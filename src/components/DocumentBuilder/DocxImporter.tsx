/**
 * DocxImporter
 * ─────────────────────────────────────────────────────────────────────────────
 * Used from within the Studio builder ribbon to import a Word or PDF file into
 * an existing document.
 *
 * Word (.docx / .dotx) — primary path
 * ─────────────────────────────────────
 * Default: "Import and edit in Studio" (convert_html mode)
 *   • Converts DOCX → sanitised HTML canvas via POST …/import-docx?mode=convert_html
 *   • On success: calls onOpenInStudio({ htmlContent, importCss, importReport })
 *     so the parent can refresh the template and switch to HtmlDocumentCanvas.
 *   • The import report is shown AFTER the canvas opens — it never blocks editing.
 *   • No Gotenberg check, no source-preview panel, no "download Word to edit".
 *
 * Advanced / Recovery copy (keep_word mode) — secondary, clearly labelled
 *   • Stores the original .docx in R2 as a silent recovery copy.
 *   • Calls onClose() on success — no canvas transition.
 *   • Presented as a collapsed "Advanced" section so it is not the default.
 *
 * PDF — unchanged (convert_blocks, goes to preview step)
 *
 * Failure handling
 * ─────────────────
 * Any error leaves the modal open with a descriptive message. The document is
 * never left in a broken state — the server is atomic (rollback on failure).
 *
 * Accepted file types
 * ────────────────────
 * .docx and .dotx (Word template) — both are ZIP-based OOXML; mammoth handles
 * both without extra architecture. .dotx is accepted only in the Word path.
 */

import { useState, useRef } from 'react';
import {
  FileUp, Loader2, AlertCircle, CheckCircle, X,
  FileText, File, ArrowDownToLine, ArrowUpToLine, RefreshCw,
  Library, Save, ChevronDown, ChevronRight, Shield,
} from 'lucide-react';
import type { DocumentBlock, ImportReport } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type InsertMode = 'replace' | 'prepend' | 'append';
type ImportMode = 'docx' | 'pdf';
/** convert_html = default live canvas; keep_word = recovery copy only */
type DocxMode = 'convert_html' | 'keep_word';
type Step = 'upload' | 'preview' | 'save_library';

/** Payload returned by the server for a successful convert_html import */
export interface ConvertHtmlResult {
  id: number;
  htmlContent: string;
  importCss: string;
  importReport: ImportReport | null;
  /** Original filename (used as document title when needed) */
  sourceFileName: string;
}

interface Props {
  templateId: number | null;
  hasExistingBlocks: boolean;
  onClose: () => void;
  /** Called for block-canvas imports (PDF, or legacy convert_blocks) */
  onImported: (blocks: DocumentBlock[], docxName: string, insertMode: InsertMode) => void;
  /**
   * Called after a successful convert_html import.
   * Parent should: close the importer, refresh the template from the server,
   * and switch to HtmlDocumentCanvas. The returned data contains everything
   * needed to do so without an extra round-trip.
   */
  onOpenInStudio: (result: ConvertHtmlResult) => void;
  /** Called when templateId is null — should save the template and return the new id */
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocxImporter({
  templateId,
  hasExistingBlocks,
  onClose,
  onImported,
  onOpenInStudio,
  onSaveFirst,
}: Props) {
  const [mode, setMode] = useState<ImportMode>('docx');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Block-canvas preview (PDF / legacy convert_blocks only)
  const [preview, setPreview] = useState<{
    blocks: DocumentBlock[];
    name: string;
    warnings: string[];
    pageCount?: number;
  } | null>(null);
  const [insertMode, setInsertMode] = useState<InsertMode>('replace');
  const [step, setStep] = useState<Step>('upload');
  const inputRef = useRef<HTMLInputElement>(null);
  const [resolvedId, setResolvedId] = useState<number | null>(templateId);

  // DOCX sub-mode: convert_html is the default (recommended)
  const [docxMode, setDocxMode] = useState<DocxMode>('convert_html');
  // Advanced section collapsed by default
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Save-to-library state (block-canvas preview path only)
  const [libName, setLibName] = useState('');
  const [libType, setLibType] = useState('swms');
  const [libSaving, setLibSaving] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);
  const [libSaved, setLibSaved] = useState(false);

  // Accept .docx and .dotx for Word; .pdf for PDF
  const acceptAttr = mode === 'docx' ? '.docx,.dotx' : '.pdf';
  const modeLabel  = mode === 'docx' ? 'Word (.docx / .dotx)' : 'PDF (.pdf)';

  // ── File validation ────────────────────────────────────────────────────────

  const handleFile = (f: File) => {
    const name = f.name.toLowerCase();
    if (mode === 'docx' && !name.endsWith('.docx') && !name.endsWith('.dotx')) {
      setError('Only .docx and .dotx files are supported for Word import.');
      return;
    }
    if (mode === 'pdf' && !name.endsWith('.pdf')) {
      setError('Only .pdf files are supported in PDF mode.');
      return;
    }
    setFile(f);
    setError(null);
    setPreview(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ── Main import handler ────────────────────────────────────────────────────

  const handleParse = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      // Ensure we have a saved template ID before uploading
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
      const endpoint = mode === 'docx'
        ? `/api/document-templates/${id}/import-docx`
        : `/api/document-templates/${id}/import-pdf`;
      formData.append(mode === 'docx' ? 'docx' : 'pdf', file);
      if (mode === 'docx') {
        formData.append('mode', docxMode);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);
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

      const data = await res.json() as {
        mode?: string;
        // convert_html response fields
        htmlContent?: string;
        importCss?: string;
        importReport?: ImportReport | null;
        sourceFileName?: string;
        // block-canvas / keep_word response fields
        blocks?: DocumentBlock[];
        sourceDocxName?: string;
        warnings?: string[];
        pageCount?: number;
        sha256?: string;
        revision?: number;
        error?: string;
      };

      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to import file — please try again.');
        return;
      }

      // ── convert_html: open directly in Studio ─────────────────────────────
      if (data.mode === 'convert_html') {
        onOpenInStudio({
          id,
          htmlContent: data.htmlContent ?? '',
          importCss:   data.importCss   ?? '',
          importReport: data.importReport ?? null,
          sourceFileName: data.sourceFileName ?? file.name,
        });
        return;
      }

      // ── keep_word: stored as recovery copy — close modal ──────────────────
      if (data.mode === 'keep_word') {
        onClose();
        return;
      }

      // ── Block-canvas preview (PDF / legacy convert_blocks) ─────────────────
      const parsedName = data.sourceDocxName ?? data.sourceFileName ?? file.name;
      setPreview({
        blocks:    data.blocks ?? [],
        name:      parsedName,
        warnings:  data.warnings ?? [],
        pageCount: data.pageCount,
      });
      setLibName(parsedName.replace(/\.(docx|dotx|pdf)$/i, ''));
      setStep('preview');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload timed out — the file may be too large or the server is busy. Try a smaller file.');
      } else {
        setError('Network error — please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Block-canvas apply / library (PDF path) ────────────────────────────────

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
      const payload = {
        name: libName.trim(),
        templateType: libType,
        docStatus: 'published',
        blocks: preview.blocks,
        appliedWidgets: [],
      };
      const res = await fetch('/api/document-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
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

  // ── Mode / reset helpers ───────────────────────────────────────────────────

  const handleModeChange = (m: ImportMode) => {
    setMode(m);
    setFile(null);
    setError(null);
    setPreview(null);
    setStep('upload');
  };

  const handleReset = () => {
    setPreview(null);
    setFile(null);
    setStep('upload');
    setLibSaved(false);
    setLibError(null);
  };

  // ── Primary button label ───────────────────────────────────────────────────

  const primaryLabel = () => {
    if (loading) {
      return resolvedId
        ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
        : <><Loader2 size={14} className="animate-spin" /> Saving & Importing…</>;
    }
    if (mode === 'docx' && docxMode === 'keep_word') return 'Save as Recovery Copy';
    if (mode === 'docx') return 'Import and edit in Studio';
    return 'Parse PDF';
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center">
              <FileUp size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Import Document</p>
              <p className="text-xs text-slate-400">
                {step === 'upload'       && 'Import a Word or PDF file into Studio'}
                {step === 'preview'      && 'Review parsed content — apply to canvas or save to library'}
                {step === 'save_library' && 'Save to shared template library'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-300 hover:text-slate-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* ── STEP 1: Upload ──────────────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              {/* File type toggle */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => handleModeChange('docx')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    mode === 'docx' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileText size={13} />
                  Word (.docx)
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('pdf')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    mode === 'pdf' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <File size={13} className="text-red-500" />
                  PDF (.pdf)
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-violet-50/30 transition-colors"
                data-testid="drop-zone"
              >
                {mode === 'docx'
                  ? <FileText size={32} className="text-slate-300" />
                  : <File size={32} className="text-red-300" />
                }
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB — click to change</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-600">Drop your {modeLabel} file here</p>
                    <p className="text-xs text-slate-400">or click to browse</p>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={acceptAttr}
                  className="hidden"
                  data-testid="file-input"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {/* What happens info box — context-aware */}
              {mode === 'docx' && docxMode === 'convert_html' && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-violet-700">What happens when you import:</p>
                  <p>• Word content is converted to an editable HTML canvas in Studio</p>
                  <p>• Tables, headings, paragraphs, lists, images and page breaks are preserved</p>
                  <p>• The original .docx is kept as a silent recovery copy</p>
                  <p>• An import report is shown after opening — it never blocks editing</p>
                </div>
              )}

              {/* Advanced / Recovery copy section */}
              {mode === 'docx' && (
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
                        or replaced at any time. Word is not the live editing format.
                      </p>
                      <button
                        type="button"
                        onClick={() => setDocxMode(docxMode === 'keep_word' ? 'convert_html' : 'keep_word')}
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

              {/* PDF info */}
              {mode === 'pdf' && (
                <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-600">What gets imported from PDF:</p>
                  <p>• Text-based PDFs → Heading + paragraph blocks</p>
                  <p>• Scanned / image PDFs → download link block</p>
                  <p className="text-amber-600">• Best-effort — complex layouts may vary</p>
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
                onClick={() => void handleParse()}
                disabled={!file || loading}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                data-testid="import-btn"
              >
                {primaryLabel()}
              </button>
            </>
          )}

          {/* ── STEP 2: Block-canvas preview (PDF / legacy) ─────────────────── */}
          {step === 'preview' && preview && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <CheckCircle size={13} />
                <span>
                  Parsed <strong>{preview.blocks.length} block{preview.blocks.length !== 1 ? 's' : ''}</strong> from <strong>{preview.name}</strong>
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
                      <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">{i + 1}</span>
                      <span className="px-1.5 py-0.5 rounded bg-violet-50 text-primary text-[10px] font-mono">{b.type}</span>
                      <span className="truncate text-slate-500">
                        {b.type === 'heading'   ? b.content
                          : b.type === 'text'     ? b.content
                          : b.type === 'rich_text' ? b.html.replace(/<[^>]+>/g, '').slice(0, 60)
                          : b.type === 'table'    ? `${b.columns.length} cols × ${b.rows.length} rows`
                          : b.type === 'image'    ? (b.alt ?? b.src ?? 'image')
                          : b.type === 'divider'  ? '—'
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two action paths */}
              <div className="grid grid-cols-2 gap-3">
                {/* Path A: Apply to canvas */}
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

                {/* Path B: Save to library */}
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
