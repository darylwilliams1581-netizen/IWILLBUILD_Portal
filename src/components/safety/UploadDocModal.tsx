/**
 * UploadDocModal
 * Generic file-upload modal used by the Safety Policies and Posters tabs.
 * Sends a multipart/form-data POST to the given endpoint.
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Loader2, AlertCircle, CheckCircle2, FileText } from 'lucide-react';

interface UploadDocModalProps {
  /** API endpoint to POST to, e.g. "/api/safety/documents" */
  endpoint: string;
  /** Modal title */
  title: string;
  /** Options for the type/category dropdown */
  typeOptions: readonly string[];
  /** Form field name for the type dropdown */
  typeField: string;
  /** Called when the modal should close */
  onClose: () => void;
  /** Called with the newly created record on success */
  onUploaded: (record: unknown) => void;
}

export default function UploadDocModal({
  endpoint, title, typeOptions, typeField, onClose, onUploaded,
}: UploadDocModalProps) {
  const [file,       setFile]       = useState<File | null>(null);
  const [docTitle,   setDocTitle]   = useState('');
  const [docType,    setDocType]    = useState(typeOptions[0] ?? '');
  const [reviewDate, setReviewDate] = useState('');
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !docTitle) setDocTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    if (!docTitle.trim()) { setError('Please enter a title.'); return; }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', docTitle.trim());
      fd.append(typeField, docType);
      if (reviewDate) fd.append('reviewDate', reviewDate);

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json() as { error?: string; document?: unknown; poster?: unknown };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      onUploaded(data.document ?? data.poster ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center">
                <Upload size={14} className="text-primary" />
              </div>
              <p className="text-sm font-bold text-slate-800">{title}</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={(e) => void handleSubmit(e)} className="p-5 flex flex-col gap-4 overflow-y-auto">

            {/* File drop zone */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                File <span className="text-red-400">*</span>
              </label>
              <div
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                  file ? 'border-primary/40 bg-orange-50/50' : 'border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                {file ? (
                  <>
                    <FileText size={20} className="text-primary" />
                    <p className="text-xs font-semibold text-slate-700 text-center px-4 truncate max-w-full">{file.name}</p>
                    <p className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <Upload size={20} className="text-slate-300" />
                    <p className="text-xs text-slate-400">Click to select a file</p>
                    <p className="text-[10px] text-slate-300">PDF, DOCX, PNG, JPG accepted</p>
                  </>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. WHS Policy 2024"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors placeholder-slate-400"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors appearance-none"
              >
                {typeOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Review date (optional) */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Review date <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                <AlertCircle size={13} className="shrink-0" />{error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || !file}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <><Loader2 size={13} className="animate-spin" />Uploading…</>
                ) : (
                  <><CheckCircle2 size={13} />Upload</>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
