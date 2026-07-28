/**
 * ShareToLibraryModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform owner ONLY — publishes content to the Global Library.
 * Regular company users cannot see or use this modal.
 *
 * Props:
 *   templateId      — the source record id to publish
 *   templateName    — pre-fills the title field
 *   isPlatformOwner — must be true; caller should not render this for regular users
 *   sourceType      — 'document' (default) | 'swms' — determines which API endpoint is called
 *   onClose         — called when the modal should close
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Library, CheckCircle, AlertCircle, Loader2, Globe,
  ChevronDown,
} from 'lucide-react';

interface Props {
  templateId: number;
  templateName: string;
  isPlatformOwner?: boolean;
  /** Which API to call:
   *  'document' (default) → POST /api/document-templates/:id/publish-to-library
   *  'swms'               → POST /api/safety/swms/:id/publish-to-library
   *  'form'               → POST /api/form-templates/:id/publish-to-library */
  sourceType?: 'document' | 'swms' | 'form';
  onClose: () => void;
}

const LIBRARY_TYPES = [
  { value: 'form',         label: 'Form' },
  { value: 'procedure',    label: 'Procedure' },
  { value: 'policy',       label: 'Policy' },
  { value: 'swms',         label: 'SWMS' },
  { value: 'checklist',    label: 'Checklist' },
  { value: 'induction',    label: 'Induction' },
  { value: 'toolbox_talk', label: 'Toolbox Talk' },
  { value: 'prestart',     label: 'Pre-start' },
  { value: 'report',       label: 'Report' },
  { value: 'recipe',       label: 'Recipe' },
] as const;

const CATEGORIES = [
  'Safety', 'HR', 'Operations', 'Quality', 'Environment',
  'Finance', 'Legal', 'IT', 'Construction', 'Electrical',
  'Plumbing', 'HVAC', 'Landscaping', 'Cleaning', 'Other',
];

const DISCIPLINES = [
  'Construction', 'Electrical', 'Plumbing', 'HVAC', 'Landscaping',
  'Cleaning', 'Mining', 'Oil & Gas', 'Manufacturing', 'Hospitality',
  'Healthcare', 'Transport', 'Retail', 'General', 'Other',
];

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function ShareToLibraryModal({
  templateId, templateName, isPlatformOwner = false,
  sourceType = 'document', onClose,
}: Props) {
  // Guard: only platform owners should ever see this modal
  if (!isPlatformOwner) return null;

  const defaultType = sourceType === 'swms' ? 'swms' : 'form';

  const [title,      setTitle]      = useState(templateName);
  const [type,       setType]       = useState(defaultType);
  const [category,   setCategory]   = useState('');
  const [discipline, setDiscipline] = useState('');
  const [summary,    setSummary]    = useState('');
  const [version,    setVersion]    = useState('1.0');
  const [tags,       setTags]       = useState('');
  const [status,     setStatus]     = useState<Status>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [resultId,   setResultId]   = useState<number | null>(null);

  const inp = 'w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors placeholder-slate-400';
  const sel = `${inp} appearance-none cursor-pointer`;

  function buildUrl() {
    if (sourceType === 'swms') return `/api/safety/swms/${templateId}/publish-to-library`;
    if (sourceType === 'form') return `/api/form-templates/${templateId}/publish-to-library`;
    return `/api/document-templates/${templateId}/publish-to-library`;
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(buildUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          type,
          category:   category.trim()   || undefined,
          discipline: discipline.trim() || undefined,
          summary:    summary.trim()    || undefined,
          version:    version.trim()    || '1.0',
          tags:       tags.trim()       || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; libraryItemId?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Publish failed');
      setResultId(data.libraryItemId ?? null);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed');
      setStatus('error');
    }
  }

  return (
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
              <Library size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Publish to Global Library</p>
              <p className="text-xs text-slate-400">Published immediately — visible to all companies</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {status === 'success' ? (
          <div className="p-8 flex flex-col items-center gap-4 text-center overflow-y-auto">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-emerald-50 border border-emerald-200">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-800 mb-1">Published to Global Library!</p>
              <p className="text-sm text-slate-500 max-w-xs">
                <strong>{title}</strong> is now live and available to all companies.
              </p>
            </div>
            {resultId && (
              <a href="/library" className="text-xs text-primary font-semibold hover:underline">
                View in library →
              </a>
            )}
            <button onClick={onClose} className="mt-1 px-8 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-4 overflow-y-auto">
            {/* Owner badge */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs font-medium">
              <Globe size={13} />
              As platform owner, this will be published immediately and visible to all companies.
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} placeholder="e.g. Electrical Safety SWMS" />
            </div>

            {/* Type + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                <div className="relative">
                  <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
                    {LIBRARY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                <div className="relative">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
                    <option value="">Select…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Discipline + Version */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Industry / Discipline</label>
                <div className="relative">
                  <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className={sel}>
                    <option value="">Select…</option>
                    {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Version</label>
                <input value={version} onChange={(e) => setVersion(e.target.value)} className={inp} placeholder="1.0" />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tags <span className="font-normal text-slate-400">(comma-separated)</span></label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} className={inp} placeholder="e.g. electrical, high-voltage, safety" />
            </div>

            {/* Summary */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Summary <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={`${inp} resize-none`} placeholder="Briefly describe what this document covers…" />
            </div>

            {/* Error */}
            {status === 'error' && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                <AlertCircle size={13} className="flex-shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={!title.trim() || status === 'loading'}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <><Loader2 size={13} className="animate-spin" />Publishing…</>
                ) : (
                  <><Globe size={13} />Publish to Global Library</>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
