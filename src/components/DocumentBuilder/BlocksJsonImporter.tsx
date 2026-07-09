/**
 * BlocksJsonImporter
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal for importing a .blocks.json file (produced by the Python SWMS
 * extraction script) directly into the Document Builder.
 *
 * Calls POST /api/document-templates/:id/import-blocks
 * Returns DocumentBlock[] which are inserted using the same insert-mode
 * options as the DOCX importer (Replace All / Insert at Top / Insert at Bottom).
 */

import { useState, useRef, useCallback } from 'react';
import { X, FileJson, Loader2, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import type { DocumentBlock } from './types';
import { useDocumentStore } from './useDocumentStore';

type InsertMode = 'replace' | 'prepend' | 'append';

interface Props {
  templateId: number | null;
  hasExistingBlocks: boolean;
  onClose: () => void;
  onImported: (blocks: DocumentBlock[], name: string, mode: InsertMode) => void;
  onSaveFirst: () => Promise<number | null>;
}

interface Preview {
  blocks: DocumentBlock[];
  documentName: string;
  warnings: string[];
}

export default function BlocksJsonImporter({
  templateId,
  hasExistingBlocks,
  onClose,
  onImported,
  onSaveFirst,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [insertMode, setInsertMode] = useState<InsertMode>('replace');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.json')) {
      setError('Please upload a .blocks.json file.');
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

  const handleParse = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      // Ensure template is saved first
      let resolvedId = templateId;
      if (!resolvedId) {
        resolvedId = await onSaveFirst();
        if (!resolvedId) {
          setError('Could not save the document before importing. Please try saving manually first.');
          setLoading(false);
          return;
        }
      }

      const form = new FormData();
      form.append('file', file);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(`/api/document-templates/${resolvedId}/import-blocks`, {
        method: 'POST',
        credentials: 'include',
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json() as {
        ok?: boolean;
        blocks?: DocumentBlock[];
        documentName?: string;
        warnings?: string[];
        error?: string;
      };

      if (!res.ok || data.error) {
        setError(data.error ?? 'Import failed — please check the file format.');
        return;
      }

      setPreview({
        blocks: data.blocks ?? [],
        documentName: data.documentName ?? file.name.replace(/\.json$/i, ''),
        warnings: data.warnings ?? [],
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Upload timed out — the file may be too large or the server is busy.');
      } else {
        setError('Network error — please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [file, templateId, onSaveFirst]);

  const handleConfirm = () => {
    if (!preview) return;
    onImported(preview.blocks, preview.documentName, insertMode);
    onClose();
  };

  // Block type → friendly label for preview list
  const blockLabel = (b: DocumentBlock): string => {
    if (b.type === 'heading')          return `H${b.level}: ${b.content.slice(0, 50)}`;
    if (b.type === 'text')             return `Text: ${b.content.slice(0, 50)}`;
    if (b.type === 'rich_text')        return `Rich text: ${b.html.replace(/<[^>]+>/g, '').slice(0, 50)}`;
    if (b.type === 'field')            return `Field (${b.fieldType}): ${b.label}`;
    if (b.type === 'table')            return `Table: ${b.columns.length} cols × ${b.rows.length} rows`;
    if (b.type === 'risk_matrix')      return `Risk Matrix: ${b.title}`;
    if (b.type === 'safety_badge_row') return `PPE badges (${b.badges.length})`;
    if (b.type === 'banner')           return `Banner (${b.variant}): ${b.title}`;
    if (b.type === 'page_break')       return 'Page Break';
    if (b.type === 'divider')          return 'Divider';
    if (b.type === 'spacer')           return `Spacer (${b.height}px)`;
    if (b.type === 'image')            return `Image: ${b.alt || b.src}`;
    if (b.type === 'system_field')     return `System field: ${b.fieldKey}`;
    return b.type;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <FileJson size={15} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Import .blocks.json</p>
              <p className="text-xs text-slate-400">Python SWMS script output → builder blocks</p>
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
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              >
                <FileJson size={32} className="text-blue-300" />
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-600">Drop your .blocks.json file here</p>
                    <p className="text-xs text-slate-400">or click to browse</p>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,application/json"
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
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Parsing…</>
                  : 'Parse & Preview'
                }
              </button>

              {/* What gets imported */}
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-600">Supported block types:</p>
                <p>• <span className="font-medium text-slate-700">heading</span> → Heading block (H1–H4)</p>
                <p>• <span className="font-medium text-slate-700">text</span> → Text / Rich Text block</p>
                <p>• <span className="font-medium text-slate-700">short_text / date / signature</span> → Field blocks</p>
                <p>• <span className="font-medium text-slate-700">risk_matrix</span> → Native 5×5 Risk Matrix</p>
                <p>• <span className="font-medium text-slate-700">safety_badges</span> → PPE icon row</p>
                <p>• <span className="font-medium text-slate-700">hazard_stripe / first_aid_banner</span> → Banner blocks</p>
                <p>• <span className="font-medium text-slate-700">table</span> → Table block (fillable or static)</p>
                <p>• <span className="font-medium text-slate-700">page_break</span> → Page Break</p>
              </div>
            </>
          )}

          {/* Preview */}
          {preview && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                <CheckCircle size={13} />
                <span>
                  Parsed <strong>{preview.blocks.length} block{preview.blocks.length !== 1 ? 's' : ''}</strong> from <strong>{preview.documentName}</strong>
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <p className="font-semibold mb-1">Warnings ({preview.warnings.length}):</p>
                  {preview.warnings.map((w, i) => <p key={i}>• {w}</p>)}
                </div>
              )}

              {/* Block list */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                  Block preview ({preview.blocks.length} blocks)
                </div>
                <div className="p-3 max-h-48 overflow-y-auto flex flex-col gap-1">
                  {preview.blocks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 py-0.5">
                      <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 flex-shrink-0">{i + 1}</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-mono flex-shrink-0">{b.type}</span>
                      <span className="truncate text-slate-500">{blockLabel(b)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Insert mode — only shown if there are existing blocks */}
              {hasExistingBlocks && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-slate-600">Insert mode</p>
                  <div className="relative">
                    <select
                      value={insertMode}
                      onChange={(e) => setInsertMode(e.target.value as InsertMode)}
                      className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 pr-8"
                    >
                      <option value="replace">Replace All — discard existing blocks</option>
                      <option value="prepend">Insert at Top — before existing blocks</option>
                      <option value="append">Insert at Bottom — after existing blocks</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {insertMode === 'replace' && (
                    <p className="text-[10px] text-amber-600">⚠ This will remove all {useDocumentStore.getState().blocks.length} existing blocks.</p>
                  )}
                </div>
              )}

              <button
                onClick={handleConfirm}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle size={14} />
                {insertMode === 'replace' ? 'Replace & Import' : insertMode === 'prepend' ? 'Insert at Top' : 'Insert at Bottom'}
              </button>

              <button
                onClick={() => { setPreview(null); setFile(null); }}
                className="w-full py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                ← Choose a different file
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
