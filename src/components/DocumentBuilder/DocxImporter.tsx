/**
 * Smart Document Builder — DOCX Importer
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload flow: user selects a .docx → server parses → preview blocks → confirm.
 */

import { useState, useRef } from 'react';
import { FileUp, Loader2, AlertCircle, CheckCircle, X, FileText } from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import type { DocumentBlock } from './types';

interface Props {
  templateId: number | null;
  onClose: () => void;
  onImported: (blocks: DocumentBlock[], docxName: string) => void;
  /** Called when templateId is null — should save the template and return the new id, or null on failure */
  onSaveFirst: () => Promise<number | null>;
}

export default function DocxImporter({ templateId, onClose, onImported, onSaveFirst }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ blocks: DocumentBlock[]; name: string; warnings: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Resolved id — may be updated by auto-save when templateId is null
  const [resolvedId, setResolvedId] = useState<number | null>(templateId);

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.docx')) {
      setError('Only .docx files are supported.');
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
      // If no template has been saved yet, auto-save first to get an id
      let id = resolvedId;
      if (!id) {
        setError(null);
        const saved = await onSaveFirst();
        if (!saved) {
          setError('Could not save the template — please try saving manually first.');
          setLoading(false);
          return;
        }
        id = saved;
        setResolvedId(saved);
      }
      const formData = new FormData();
      formData.append('docx', file);
      const res = await fetch(`/api/document-templates/${id}/import-docx`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json() as { blocks?: DocumentBlock[]; sourceDocxName?: string; warnings?: string[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to parse DOCX');
        return;
      }
      setPreview({
        blocks: data.blocks ?? [],
        name: data.sourceDocxName ?? file.name,
        warnings: data.warnings ?? [],
      });
    } catch (err) {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    onImported(preview.blocks, preview.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
              <FileUp size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Import DOCX Template</p>
              <p className="text-xs text-slate-400">Convert a Word document into builder blocks</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Upload zone */}
          {!preview && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-orange-50/30 transition-colors"
              >
                <FileText size={32} className="text-slate-300" />
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-600">Drop your .docx file here</p>
                    <p className="text-xs text-slate-400">or click to browse</p>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  <AlertCircle size={13} />
                  {error}
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-600">What gets imported:</p>
                <p>• Headings (H1–H4) → Heading blocks</p>
                <p>• Paragraphs → Text or Rich Text blocks</p>
                <p>• Tables → Table blocks (static mode)</p>
                <p>• Lists → Rich Text blocks with bullets</p>
                <p>• Horizontal rules → Divider blocks</p>
              </div>

              <button
                onClick={handleParse}
                disabled={!file || loading}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> {resolvedId ? 'Parsing...' : 'Saving & Parsing...'}</> : 'Parse Document'}
              </button>
            </>
          )}

          {/* Preview */}
          {preview && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <CheckCircle size={13} />
                <span>Parsed <strong>{preview.blocks.length} blocks</strong> from <strong>{preview.name}</strong></span>
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
                          : b.type === 'divider' ? '—'
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setPreview(null); setFile(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Re-import
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
                >
                  Apply to Canvas
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
