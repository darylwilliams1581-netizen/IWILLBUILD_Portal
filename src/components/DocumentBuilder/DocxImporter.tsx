/**
 * Smart Document Builder — Document Importer
 * ─────────────────────────────────────────────────────────────────────────────
 * Supports importing both .docx (Word) and .pdf files into builder blocks.
 *
 * DOCX → parsed server-side with mammoth → heading/text/table/list blocks
 * PDF  → parsed server-side with zlib text extraction → heading/rich_text blocks
 *
 * After a successful parse the user can:
 *   1. Apply to the current canvas (replace / prepend / append)
 *   2. Save directly to the shared template library
 */

import { useState, useRef } from 'react';
import {
  FileUp, Loader2, AlertCircle, CheckCircle, X,
  FileText, File, ArrowDownToLine, ArrowUpToLine, RefreshCw,
  Library, ChevronRight, Save,
} from 'lucide-react';
import type { DocumentBlock } from './types';

type InsertMode = 'replace' | 'prepend' | 'append';
type ImportMode = 'docx' | 'pdf';
type Step = 'upload' | 'preview' | 'save_library';

interface Props {
  templateId: number | null;
  hasExistingBlocks: boolean;
  onClose: () => void;
  onImported: (blocks: DocumentBlock[], docxName: string, insertMode: InsertMode) => void;
  /** Called when templateId is null — should save the template and return the new id, or null on failure */
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

export default function DocxImporter({ templateId, hasExistingBlocks, onClose, onImported, onSaveFirst }: Props) {
  const [mode, setMode] = useState<ImportMode>('docx');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Save-to-library state
  const [libName, setLibName] = useState('');
  const [libType, setLibType] = useState('swms');
  const [libSaving, setLibSaving] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);
  const [libSaved, setLibSaved] = useState(false);

  const acceptAttr = mode === 'docx' ? '.docx' : '.pdf';
  const modeLabel = mode === 'docx' ? 'Word (.docx)' : 'PDF (.pdf)';

  const handleFile = (f: File) => {
    const name = f.name.toLowerCase();
    if (mode === 'docx' && !name.endsWith('.docx')) {
      setError('Only .docx files are supported in DOCX mode.');
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

  const handleParse = async () => {
    if (!file) return;
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
      const endpoint = mode === 'docx'
        ? `/api/document-templates/${id}/import-docx`
        : `/api/document-templates/${id}/import-pdf`;
      const fieldName = mode === 'docx' ? 'docx' : 'pdf';
      formData.append(fieldName, file);

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
        blocks?: DocumentBlock[];
        sourceDocxName?: string;
        sourceFileName?: string;
        warnings?: string[];
        pageCount?: number;
        error?: string;
      };

      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to parse file');
        return;
      }

      const parsedName = data.sourceDocxName ?? data.sourceFileName ?? file.name;
      setPreview({
        blocks: data.blocks ?? [],
        name: parsedName,
        warnings: data.warnings ?? [],
        pageCount: data.pageCount,
      });
      // Pre-fill the library name from the file name
      setLibName(parsedName.replace(/\.(docx|pdf)$/i, ''));
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
                {step === 'upload' && 'Convert a Word or PDF file into builder blocks'}
                {step === 'preview' && 'Review parsed blocks — apply to canvas or save to library'}
                {step === 'save_library' && 'Save to shared template library'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* ── STEP 1: Upload ─────────────────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              {/* Mode toggle */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => handleModeChange('docx')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    mode === 'docx' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileText size={13} />
                  Word (.docx)
                </button>
                <button
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
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={() => void handleParse()}
                disabled={!file || loading}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> {resolvedId ? 'Parsing…' : 'Saving & Parsing…'}</>
                  : `Parse ${mode === 'docx' ? 'DOCX' : 'PDF'}`
                }
              </button>

              {/* What gets imported */}
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                {mode === 'docx' ? (
                  <>
                    <p className="font-semibold text-slate-600">What gets imported from DOCX:</p>
                    <p>• Headings (H1–H4) → Heading blocks</p>
                    <p>• Paragraphs → Text or Rich Text blocks</p>
                    <p>• Tables → Table blocks</p>
                    <p>• Lists → Rich Text blocks with bullets</p>
                    <p>• Horizontal rules → Divider blocks</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-slate-600">What gets imported from PDF:</p>
                    <p>• Text-based PDFs → Heading + paragraph blocks</p>
                    <p>• Scanned / image PDFs → download link block</p>
                    <p className="text-amber-600">• Best-effort — complex layouts may vary</p>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── STEP 2: Preview ────────────────────────────────────────────────── */}
          {step === 'preview' && preview && (
            <>
              {/* Parse success */}
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
                  {preview.warnings.length > 5 && <p className="text-amber-500 mt-1">…and {preview.warnings.length - 5} more</p>}
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
                        {b.type === 'heading' ? b.content
                          : b.type === 'text' ? b.content
                          : b.type === 'rich_text' ? b.html.replace(/<[^>]+>/g, '').slice(0, 60)
                          : b.type === 'table' ? `${b.columns.length} cols × ${b.rows.length} rows`
                          : b.type === 'image' ? (b.alt ?? b.src ?? 'image')
                          : b.type === 'divider' ? '—'
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
                      <button
                        onClick={() => setStep('save_library')}
                        className="text-[11px] text-primary underline"
                      >
                        Edit details
                      </button>
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
                      {libError && (
                        <p className="text-[10px] text-red-500">{libError}</p>
                      )}
                      <button
                        onClick={() => void handleSaveToLibrary()}
                        disabled={libSaving || !libName.trim()}
                        className="mt-auto w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        {libSaving ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : <><Save size={11} /> Save</>}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Re-import */}
              <button
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
