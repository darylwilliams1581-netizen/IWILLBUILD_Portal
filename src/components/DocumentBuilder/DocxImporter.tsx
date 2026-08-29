/**
 * DocxImporter — Auto-detecting import modal
 * ─────────────────────────────────────────────────────────────────────────────
 * Single drop zone. No Word/PDF tabs. The file type is detected automatically
 * from the file's actual bytes — the extension and MIME type are not trusted.
 *
 * Detection (client-side, fast feedback)
 * ───────────────────────────────────────
 * PDF   — first 4 bytes must be %PDF (25 50 44 46)
 * DOCX  — first 4 bytes are ZIP magic (50 4B 03 04) AND the ZIP contains
 *          [Content_Types].xml + word/document.xml
 * .doc  — OLE2 magic → rejected with conversion guidance
 * Other — rejected with a clear message
 *
 * Server-side detection is authoritative. The client badge is immediate
 * feedback only; the server re-validates before routing.
 *
 * Routing (after server-side detection)
 * ──────────────────────────────────────
 * DOCX → POST /api/document-templates/:id/import-docx?mode=convert_blocks_v2
 * PDF  → POST /api/document-templates/:id/import-pdf
 *
 * Neither conversion implementation is duplicated here.
 *
 * Failure handling
 * ─────────────────
 * Any error keeps the modal open with a message. No partial document or
 * orphaned assets are created.
 *
 * Preserved from original
 * ────────────────────────
 * • convert_blocks_v2 block-canvas preview step (DOCX)
 * • PDF block-canvas preview step
 * • Advanced / Recovery copy section (DOCX only, collapsed by default)
 * • Save-to-library path
 * • Insert mode (replace / prepend / append)
 * • onSaveFirst flow when templateId is null
 * • All existing prop types
 */

import { useState, useRef, useCallback } from 'react';
import {
  FileUp, Loader2, AlertCircle, CheckCircle, X,
  FileText, File, ArrowDownToLine, ArrowUpToLine, RefreshCw,
  Library, Save, ChevronDown, ChevronRight, Shield,
} from 'lucide-react';
import type { DocumentBlock, ImportReport } from './types';
import { detectFileType, formatFileSize, type DetectedType } from './detectFileType';

// ─── Types ────────────────────────────────────────────────────────────────────

type InsertMode = 'replace' | 'prepend' | 'append';
/** convert_blocks_v2 = default block canvas; keep_word = recovery copy only */
type DocxMode = 'convert_blocks_v2' | 'convert_html' | 'keep_word';
type Step = 'upload' | 'preview';

export interface ConvertHtmlResult {
  id: number;
  htmlContent: string;
  importCss: string;
  importReport: ImportReport | null;
  sourceFileName: string;
}

interface Props {
  templateId: number | null;
  hasExistingBlocks: boolean;
  onClose: () => void;
  onImported: (blocks: DocumentBlock[], docxName: string, insertMode: InsertMode) => void;
  onOpenInStudio: (result: ConvertHtmlResult) => void;
  onSaveFirst: () => Promise<number | null>;
}

const DOC_TYPE_OPTIONS = [
  { value: 'swms',       label: 'SWMS' },
  { value: 'policy',     label: 'Policy' },
  { value: 'procedure',  label: 'Procedure' },
  { value: 'form',       label: 'Form' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'checklist',  label: 'Checklist' },
  { value: 'report',     label: 'Report' },
  { value: 'toolbox',    label: 'Toolbox Talk' },
  { value: 'prestart',   label: 'Pre-Start' },
  { value: 'handover',   label: 'Handover' },
];

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: DetectedType }) {
  if (type === 'pdf') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
        <File size={10} />
        PDF detected
      </span>
    );
  }
  if (type === 'docx') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
        <FileText size={10} />
        Word document detected
      </span>
    );
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocxImporter({
  templateId,
  hasExistingBlocks,
  onClose,
  onImported,
  onOpenInStudio,
  onSaveFirst,
}: Props) {
  const [file,        setFile]        = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<DetectedType | null>(null);
  const [detecting,   setDetecting]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const [preview, setPreview] = useState<{
    blocks: DocumentBlock[];
    name: string;
    warnings: string[];
    pageCount?: number;
  } | null>(null);
  const [insertMode,  setInsertMode]  = useState<InsertMode>('replace');
  const [step,        setStep]        = useState<Step>('upload');
  const [resolvedId,  setResolvedId]  = useState<number | null>(templateId);

  // DOCX sub-mode (advanced section)
  const [docxMode,     setDocxMode]     = useState<DocxMode>('convert_blocks_v2');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Save-to-library state
  const [libName,   setLibName]   = useState('');
  const [libType,   setLibType]   = useState('swms');
  const [libSaving, setLibSaving] = useState(false);
  const [libError,  setLibError]  = useState<string | null>(null);
  const [libSaved,  setLibSaved]  = useState(false);

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropRef     = useRef<HTMLDivElement>(null);
  const [dragOver,  setDragOver]  = useState(false);

  // ── File selection & detection ─────────────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setPreview(null);
    setDetectedType(null);
    setDetecting(true);
    try {
      const result = await detectFileType(f);
      if (result.error) {
        setError(result.error);
        setDetectedType(null);
        setFile(null);
      } else {
        setDetectedType(result.type);
      }
    } finally {
      setDetecting(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  }, [handleFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  // ── Main import handler ────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!file || !detectedType || loading || detecting) return;
    setLoading(true);
    setError(null);
    try {
      let id = resolvedId;
      if (!id) {
        const saved = await onSaveFirst();
        if (!saved) {
          setError('Could not save the document first — please try saving manually (Ctrl+S) then retry.');
          return;
        }
        id = saved;
        setResolvedId(saved);
      }

      const formData = new FormData();
      let endpoint: string;

      if (detectedType === 'docx') {
        endpoint = `/api/document-templates/${id}/import-docx`;
        formData.append('docx', file);
        formData.append('mode', docxMode);
      } else {
        // pdf
        endpoint = `/api/document-templates/${id}/import-pdf`;
        formData.append('pdf', file);
      }

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 90_000);
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Never parse HTML/text error bodies as JSON
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        setError(`Server error (${res.status} ${res.statusText}) — the server may be busy. Please wait a moment and try again.`);
        return;
      }

      let data: {
        mode?: string;
        htmlContent?: string;
        importCss?: string;
        importReport?: ImportReport | null;
        sourceFileName?: string;
        blocks?: DocumentBlock[];
        sourceDocxName?: string;
        warnings?: string[];
        pageCount?: number;
        error?: string;
      };
      try {
        data = await res.json() as typeof data;
      } catch {
        setError(`Server error (${res.status}) — unexpected response format.`);
        return;
      }

      if (!res.ok || data.error) {
        setError(data.error ?? `Import failed (HTTP ${res.status}) — please try again.`);
        return;
      }

      // ── convert_blocks_v2 (DOCX default) ──────────────────────────────────
      if (data.mode === 'convert_blocks_v2') {
        const parsedName = data.sourceDocxName ?? file.name;
        setPreview({ blocks: data.blocks ?? [], name: parsedName, warnings: data.warnings ?? [] });
        setLibName(parsedName.replace(/\.(docx|dotx)$/i, ''));
        setStep('preview');
        return;
      }

      // ── convert_html (legacy) ──────────────────────────────────────────────
      if (data.mode === 'convert_html') {
        onOpenInStudio({
          id,
          htmlContent:  data.htmlContent  ?? '',
          importCss:    data.importCss    ?? '',
          importReport: data.importReport ?? null,
          sourceFileName: data.sourceFileName ?? file.name,
        });
        return;
      }

      // ── keep_word (recovery copy) ──────────────────────────────────────────
      if (data.mode === 'keep_word') {
        onClose();
        return;
      }

      // ── PDF / generic block-canvas preview ────────────────────────────────
      const parsedName = data.sourceDocxName ?? data.sourceFileName ?? file.name;
      setPreview({
        blocks:    data.blocks    ?? [],
        name:      parsedName,
        warnings:  data.warnings  ?? [],
        pageCount: data.pageCount,
      });
      setLibName(parsedName.replace(/\.(docx|dotx|pdf)$/i, ''));
      setStep('preview');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload timed out — the file may be too large or the server is busy. Try a smaller file.');
      } else {
        setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Block-canvas apply / library ───────────────────────────────────────────

  const handleApplyToCanvas = () => {
    if (!preview) return;
    onImported(preview.blocks, preview.name, insertMode);
    onClose();
  };

  const handleSaveToLibrary = async () => {
    if (!preview || !libName.trim()) return;
    setLibSaving(true);
    setLibError(null);
    try {
      const res = await fetch('/api/document-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: libName.trim(),
          templateType: libType,
          docStatus: 'published',
          blocks: preview.blocks,
          appliedWidgets: [],
        }),
      });
      const data = await res.json() as { id?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLibSaved(true);
    } catch (err) {
      setLibError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLibSaving(false);
    }
  };

  const handleReset = () => {
    setPreview(null);
    setFile(null);
    setDetectedType(null);
    setError(null);
    setStep('upload');
    setLibSaved(false);
    setLibError(null);
    // Reset file input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── Import button label ────────────────────────────────────────────────────

  const importLabel = () => {
    if (detecting) return <><Loader2 size={14} className="animate-spin" /> Detecting…</>;
    if (loading) {
      return resolvedId
        ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
        : <><Loader2 size={14} className="animate-spin" /> Saving & Importing…</>;
    }
    if (detectedType === 'docx' && docxMode === 'keep_word') return 'Save as Recovery Copy';
    if (detectedType === 'docx') return 'Import into Studio';
    if (detectedType === 'pdf')  return 'Import into Studio';
    return 'Import into Studio';
  };

  const importDisabled = !file || !detectedType || loading || detecting;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import Document"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
              <FileUp size={15} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">Import Document</p>
              <p className="text-xs text-slate-400">
                {step === 'upload'  && 'Drop a Word or PDF document here, or click to browse'}
                {step === 'preview' && 'Review parsed content — apply to canvas or save to library'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live region for status announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="aria-live">
          {detecting && 'Detecting file type…'}
          {loading   && 'Importing document…'}
          {error     && `Error: ${error}`}
          {step === 'preview' && preview && `Parsed ${preview.blocks.length} blocks from ${preview.name}`}
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* ── STEP 1: Upload ──────────────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              {/* Drop zone */}
              <label htmlFor="doc-import-input" className="sr-only">
                Select a Word or PDF document to import
              </label>
              <div
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Drop zone — click or drag a Word or PDF file here"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors min-h-[160px] justify-center ${
                  dragOver
                    ? 'border-primary bg-violet-50'
                    : 'border-slate-200 hover:border-primary hover:bg-violet-50/30'
                }`}
                data-testid="drop-zone"
              >
                {/* Icon — changes based on detected type */}
                {detectedType === 'pdf'
                  ? <File size={36} className="text-red-400 flex-shrink-0" />
                  : detectedType === 'docx'
                  ? <FileText size={36} className="text-blue-400 flex-shrink-0" />
                  : <FileUp size={36} className="text-slate-300 flex-shrink-0" />
                }

                {file && detectedType ? (
                  /* File selected + detected */
                  <div className="text-center w-full px-2">
                    <p
                      className="text-sm font-semibold text-slate-700 break-words overflow-wrap-anywhere"
                      style={{ overflowWrap: 'anywhere' }}
                      data-testid="file-name"
                    >
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5" data-testid="file-size">
                      {formatFileSize(file.size)}
                    </p>
                    <div className="mt-2 flex justify-center" data-testid="type-badge">
                      <TypeBadge type={detectedType} />
                    </div>
                  </div>
                ) : detecting ? (
                  <div className="text-center">
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 justify-center">
                      <Loader2 size={13} className="animate-spin" />
                      Detecting file type…
                    </p>
                  </div>
                ) : (
                  /* Empty state */
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-600">
                      Drop a Word or PDF document here
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">or click to browse</p>
                    <p className="text-xs text-slate-300 mt-2">Accepted: .docx · .dotx · .pdf</p>
                  </div>
                )}

                <input
                  id="doc-import-input"
                  ref={inputRef}
                  type="file"
                  accept=".docx,.dotx,.pdf,.doc"
                  className="hidden"
                  data-testid="file-input"
                  aria-label="Select a Word or PDF document"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </div>

              {/* Change file link (shown when a file is selected) */}
              {file && !detecting && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-primary hover:underline self-center"
                  data-testid="change-file-btn"
                >
                  Change file
                </button>
              )}

              {/* Info box — context-aware */}
              {detectedType === 'docx' && docxMode === 'convert_blocks_v2' && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-violet-700">What happens when you import:</p>
                  <p>• Word content is converted to editable blocks in the Studio block canvas</p>
                  <p>• Headings become heading blocks; body paragraphs group into rich text blocks</p>
                  <p>• Tables, lists, page breaks and images each become their own block</p>
                  <p>• Each block can be moved, duplicated, deleted or edited independently</p>
                  <p>• The original .docx is kept as a silent recovery copy</p>
                </div>
              )}

              {detectedType === 'pdf' && (
                <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-600">What gets imported from PDF:</p>
                  <p>• Each page becomes one pdf_page block in the canvas</p>
                  <p>• A three-page PDF creates exactly three ordered blocks</p>
                  <p>• Blocks can be moved, duplicated and deleted independently</p>
                  <p>• The original PDF is stored for download</p>
                </div>
              )}

              {/* Advanced / Recovery copy (DOCX only) */}
              {detectedType === 'docx' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                    aria-expanded={advancedOpen}
                    data-testid="advanced-toggle"
                  >
                    <span className="flex items-center gap-1.5">
                      <Shield size={11} className="text-slate-400" />
                      Advanced — Recovery copy only
                    </span>
                    {advancedOpen
                      ? <ChevronDown size={13} className="text-slate-400" />
                      : <ChevronRight size={13} className="text-slate-400" />
                    }
                  </button>

                  {advancedOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 flex flex-col gap-2">
                      <p className="text-xs text-slate-500">
                        Store the original .docx in secure storage without converting it.
                        Use this for compatibility or archival — the file can be downloaded
                        or replaced at any time.
                      </p>
                      <button
                        type="button"
                        onClick={() => setDocxMode(docxMode === 'keep_word' ? 'convert_blocks_v2' : 'keep_word')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                          docxMode === 'keep_word'
                            ? 'border-amber-400 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                        data-testid="keep-word-toggle"
                      >
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          docxMode === 'keep_word' ? 'border-amber-500' : 'border-slate-300'
                        }`}>
                          {docxMode === 'keep_word' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                        </div>
                        Store as recovery copy only (do not convert)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600"
                  data-testid="error-message"
                  role="alert"
                >
                  <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              {/* Primary action */}
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={importDisabled}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                data-testid="import-btn"
                aria-disabled={importDisabled}
              >
                {importLabel()}
              </button>
            </>
          )}

          {/* ── STEP 2: Block-canvas preview ────────────────────────────────── */}
          {step === 'preview' && preview && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <CheckCircle size={13} />
                <span>
                  Parsed <strong>{preview.blocks.length} block{preview.blocks.length !== 1 ? 's' : ''}</strong> from{' '}
                  <strong
                    className="break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {preview.name}
                  </strong>
                  {preview.pageCount !== undefined ? ` (${preview.pageCount} pages)` : ''}
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <p className="font-semibold mb-1">Warnings ({preview.warnings.length}):</p>
                  {preview.warnings.slice(0, 5).map((w, i) => <p key={i}>• {w}</p>)}
                  {preview.warnings.length > 5 && (
                    <p className="text-amber-500 mt-1">…and {preview.warnings.length - 5} more</p>
                  )}
                </div>
              )}

              {/* Block list */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                  Block preview ({preview.blocks.length} blocks)
                </div>
                <div className="p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
                  {preview.blocks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 py-0.5">
                      <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 flex-shrink-0">{i + 1}</span>
                      <span className="px-1.5 py-0.5 rounded bg-violet-50 text-primary text-[10px] font-mono flex-shrink-0">{b.type}</span>
                      <span className="truncate text-slate-500 min-w-0">
                        {b.type === 'heading'    ? b.content
                          : b.type === 'text'      ? b.content
                          : b.type === 'rich_text' ? b.html.replace(/<[^>]+>/g, '').slice(0, 60)
                          : b.type === 'table'     ? `${b.columns.length} cols × ${b.rows.length} rows`
                          : b.type === 'image'     ? (b.alt ?? b.src ?? 'image')
                          : b.type === 'divider'   ? '—'
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two action paths */}
              <div className="grid grid-cols-2 gap-3">
                {/* Apply to canvas */}
                <div className="border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText size={12} className="text-primary" />
                    Apply to canvas
                  </p>
                  {hasExistingBlocks && (
                    <div className="flex flex-col gap-1">
                      {([
                        { value: 'replace', icon: RefreshCw,       label: 'Replace all' },
                        { value: 'prepend', icon: ArrowUpToLine,   label: 'Insert at top' },
                        { value: 'append',  icon: ArrowDownToLine, label: 'Insert at bottom' },
                      ] as const).map(({ value, icon: Icon, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setInsertMode(value)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                            insertMode === value
                              ? 'bg-primary/10 text-primary border border-primary/20'
                              : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <Icon size={11} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleApplyToCanvas}
                    className={`mt-auto w-full py-2 rounded-lg text-white text-xs font-semibold transition-colors ${
                      insertMode === 'replace' && hasExistingBlocks
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-primary hover:bg-violet-700'
                    }`}
                  >
                    {insertMode === 'replace' && hasExistingBlocks ? 'Replace & Apply' : 'Apply'}
                  </button>
                </div>

                {/* Save to library */}
                <div className="border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Library size={12} className="text-emerald-600" />
                    Save to library
                  </p>
                  {libSaved ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-2">
                      <CheckCircle size={20} className="text-emerald-500" />
                      <p className="text-xs font-semibold text-emerald-700 text-center">Saved to library!</p>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={libName}
                        onChange={(e) => setLibName(e.target.value)}
                        placeholder="Template name"
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                      />
                      <select
                        value={libType}
                        onChange={(e) => setLibType(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white appearance-none"
                      >
                        {DOC_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {libError && <p className="text-[10px] text-red-500">{libError}</p>}
                      <button
                        type="button"
                        onClick={() => void handleSaveToLibrary()}
                        disabled={libSaving || !libName.trim()}
                        className="mt-auto w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        {libSaving
                          ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                          : <><Save size={11} /> Save</>
                        }
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Re-import */}
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                data-testid="import-different-btn"
              >
                <RefreshCw size={11} /> Import a different file
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
