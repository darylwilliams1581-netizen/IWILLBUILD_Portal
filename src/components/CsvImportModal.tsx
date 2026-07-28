/**
 * CsvImportModal — reusable CSV import flow.
 *
 * Props:
 *   title          — modal heading
 *   uploadUrl      — POST endpoint (multipart/form-data, field "file")
 *   extraFields    — additional form fields to include in the POST body
 *   onSuccess      — called with { imported, skipped, errors } after a successful import
 *   onClose        — close the modal
 *   locked         — if true, shows a locked message instead of the upload UI
 *   lockedMessage  — message to show when locked
 *   duplicateMode  — for cost guide: "skip" | "update" | "add"
 *   showDuplicateOption — show the duplicate handling selector
 */
import { useState, useRef } from 'react';
import { Upload, X, AlertCircle, CheckCircle2, Loader2, FileText, ChevronDown } from 'lucide-react';

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; raw: string; reason: string }>;
}

interface Props {
  title: string;
  uploadUrl: string;
  onSuccess: (result: CsvImportResult) => void;
  onClose: () => void;
  locked?: boolean;
  lockedMessage?: string;
  showDuplicateOption?: boolean;
}

export default function CsvImportModal({
  title,
  uploadUrl,
  onSuccess,
  onClose,
  locked = false,
  lockedMessage = 'This record is locked and cannot be imported into.',
  showDuplicateOption = false,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update' | 'add'>('skip');
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    setError('');
    setResult(null);
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are accepted.');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setError('CSV file must be under 2 MB.');
      return;
    }
    setFile(f);
  }

  async function doImport() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (showDuplicateOption) fd.append('duplicateMode', duplicateMode);

      const res = await fetch(uploadUrl, { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json() as CsvImportResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Import failed');
        return;
      }
      setResult(data);
      onSuccess(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-heading font-bold text-slate-900 text-base">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">

          {locked ? (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {lockedMessage}
            </div>
          ) : result ? (
            /* ── Success state ── */
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>
                  <strong>{result.imported}</strong> row{result.imported !== 1 ? 's' : ''} imported successfully
                  {result.skipped > 0 && <>, <strong>{result.skipped}</strong> skipped</>}
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Skipped / invalid rows</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <span className="font-semibold text-slate-600">Row {e.row}:</span>{' '}
                        <span className="text-red-600">{e.reason}</span>
                        {e.raw && <div className="text-slate-400 truncate mt-0.5 font-mono">{e.raw}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={onClose}
                className="mt-1 w-full bg-primary hover:bg-violet-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Upload state ── */
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
                  dragOver ? 'border-primary bg-violet-50' : file ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                }`}
              >
                {file ? (
                  <>
                    <FileText size={24} className="text-green-600" />
                    <p className="text-sm font-semibold text-green-700">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                  </>
                ) : (
                  <>
                    <Upload size={24} className="text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700">Drop CSV here or click to browse</p>
                    <p className="text-xs text-slate-400">.csv only · max 2 MB</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
              </div>

              {/* Duplicate mode selector */}
              {showDuplicateOption && file && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">If duplicate found (same description + unit)</label>
                  <div className="relative">
                    <select
                      value={duplicateMode}
                      onChange={(e) => setDuplicateMode(e.target.value as 'skip' | 'update' | 'add')}
                      className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 pr-8"
                    >
                      <option value="skip">Skip duplicate (keep existing)</option>
                      <option value="update">Update existing rate</option>
                      <option value="add">Import anyway (allow duplicates)</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
                  <AlertCircle size={14} className="shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-sm py-2.5 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  onClick={doImport}
                  disabled={!file || uploading}
                  className="flex-1 bg-primary hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {uploading ? <><Loader2 size={14} className="animate-spin" />Importing…</> : 'Import CSV'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
