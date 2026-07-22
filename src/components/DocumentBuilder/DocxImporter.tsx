/**
 * Smart Document Builder — Document Importer
 * ─────────────────────────────────────────────────────────────────────────────
 * Supports importing both .docx (Word) and .pdf files into builder blocks.
 *
 * DOCX → parsed server-side with mammoth → heading/text/table/list blocks
 * PDF  → parsed server-side with pdfjs   → image blocks (one per page)
 *         falls back to text extraction if canvas is unavailable
 */

import { useState, useRef } from 'react';
import { FileUp, Loader2, AlertCircle, CheckCircle, X, FileText, File, ArrowDownToLine, ArrowUpToLine, RefreshCw } from 'lucide-react';
import type { DocumentBlock } from './types';

type InsertMode = 'replace' | 'prepend' | 'append';

type ImportMode = 'docx' | 'pdf';

interface Props {
  templateId: number | null;
  hasExistingBlocks: boolean;
  onClose: () => void;
  onImported: (blocks: DocumentBlock[], docxName: string, insertMode: InsertMode) => void;
  /** Called when templateId is null — should save the template and return the new id, or null on failure */
  onSaveFirst: () => Promise<number | null>;
}

export default function DocxImporter({ templateId, hasExistingBlocks, onClose, onImported, onSaveFirst }: Props) {
  const [mode, setMode] = useState<ImportMode>('docx');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ blocks: DocumentBlock[]; name: string; warnings: string[]; pageCount?: number } | null>(null);
  const [insertMode, setInsertMode] = useState<InsertMode>('replace');
  const inputRef = useRef<HTMLInputElement>(null);
  const [resolvedId, setResolvedId] = useState<number | null>(templateId);

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

      // 60-second timeout — mammoth/pdfjs can be slow on large files
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

      setPreview({
        blocks: data.blocks ?? [],
        name: data.sourceDocxName ?? data.sourceFileName ?? file.name,
        warnings: data.warnings ?? [],
        pageCount: data.pageCount,
      });
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

  const handleConfirm = () => {
    if (!preview) return;
    onImported(preview.blocks, preview.name, insertMode);
    onClose();
  };

  const handleModeChange = (m: ImportMode) => {
    setMode(m);
    setFile(null);
    setError(null);
    setPreview(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
              <FileUp size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Import Document</p>
              <p className="text-xs text-slate-400">Convert a Word or PDF file into builder blocks</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Mode toggle */}
          {!preview && (
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
          )}

          {/* Upload zone + actions */}
          {!preview && (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-orange-50/30 transition-colors"
              >
                {mode === 'docx'
                  ? <FileText size={32} className="text-slate-300" />
                  : <File size={32} className="text-red-300" />
                }
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
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

              {/* Error — shown prominently above the button */}
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Import button */}
              <button
                onClick={() => void handleParse()}
                disabled={!file || loading}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> {resolvedId ? 'Parsing…' : 'Saving & Parsing…'}</>
                  : `Import ${mode === 'docx' ? 'DOCX' : 'PDF'}`
                }
              </button>

              {/* What gets imported */}
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                {mode === 'docx' ? (
                  <>
                    <p className="font-semibold text-slate-600">What gets imported from DOCX:</p>
                    <p>• Headings (H1–H4) → Heading blocks</p>
                    <p>• Paragraphs → Text or Rich Text blocks</p>
                    <p>• Tables → Table blocks (static mode)</p>
                    <p>• Lists → Rich Text blocks with bullets</p>
                    <p>• Horizontal rules → Divider blocks</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-slate-600">What gets imported from PDF:</p>
                    <p>• Each page → Image block (rendered at 1.5× scale)</p>
                    <p>• Text fallback if image rendering is unavailable</p>
                    <p>• Maximum 20 pages per import</p>
                    <p className="text-amber-600">• PDF import is best-effort — complex layouts may vary</p>
                  </>
                )}
              </div>
            </>
          )}

          {/* Preview */}
          {preview && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <CheckCircle size={13} />
                <span>
                  Parsed <strong>{preview.blocks.length} block{preview.blocks.length !== 1 ? 's' : ''}</strong> from <strong>{preview.name}</strong>
                  {preview.pageCount !== undefined && preview.pageCount !== preview.blocks.length
                    ? ` (${preview.pageCount} pages)`
                    : ''}
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <p className="font-semibold mb-1">Warnings ({preview.warnings.length}):</p>
                  {preview.warnings.map((w, i) => <p key={i}>• {w}</p>)}
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                  Block preview ({preview.blocks.length} blocks)
                </div>
                <div className="p-3 max-h-48 overflow-y-auto flex flex-col gap-1">
                  {preview.blocks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 py-0.5">
                      <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">{i + 1}</span>
                      <span className="px-1.5 py-0.5 rounded bg-orange-50 text-primary text-[10px] font-mono">{b.type}</span>
                      <span className="truncate text-slate-500">
                        {b.type === 'heading' ? b.content
                          : b.type === 'text' ? b.content
                          : b.type === 'rich_text' ? b.html.replace(/<[^>]+>/g, '').slice(0, 50)
                          : b.type === 'table' ? `${b.columns.length} cols × ${b.rows.length} rows`
                          : b.type === 'image' ? (b.alt ?? b.src ?? 'image')
                          : b.type === 'divider' ? '—'
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Insert mode — only shown when there are existing blocks */}
              {hasExistingBlocks && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                    How to insert into existing content
                  </div>
                  <div className="flex flex-col divide-y divide-slate-100">
                    {([
                      { value: 'replace', icon: RefreshCw,       label: 'Replace all',      desc: 'Delete existing blocks and replace with imported content' },
                      { value: 'prepend', icon: ArrowUpToLine,   label: 'Insert at top',    desc: 'Add imported blocks above your existing content' },
                      { value: 'append',  icon: ArrowDownToLine, label: 'Insert at bottom', desc: 'Add imported blocks below your existing content' },
                    ] as const).map(({ value, icon: Icon, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setInsertMode(value)}
                        className={`flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          insertMode === value ? 'bg-orange-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          insertMode === value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <Icon size={13} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${insertMode === value ? 'text-primary' : 'text-slate-700'}`}>{label}</p>
                          <p className="text-[11px] text-slate-400 leading-tight">{desc}</p>
                        </div>
                        <div className={`ml-auto w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          insertMode === value ? 'border-primary bg-primary' : 'border-slate-300'
                        }`}>
                          {insertMode === value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setPreview(null); setFile(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Re-import
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors ${
                    insertMode === 'replace' && hasExistingBlocks
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-primary hover:bg-orange-600'
                  }`}
                >
                  {insertMode === 'replace' && hasExistingBlocks ? 'Replace & Apply' : 'Apply to Canvas'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
