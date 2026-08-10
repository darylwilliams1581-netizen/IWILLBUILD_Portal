/**
 * BugReportModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating action button + slide-up modal for submitting bug reports.
 * Any authenticated user can use this from any page.
 *
 * Usage: <BugReportModal /> — drop it anywhere in the layout tree.
 */
import { useState, useRef } from 'react';
import {
  Bug, X, Image, ChevronDown, Send, CheckCircle2,
  AlertCircle, Loader2, Paperclip,
} from 'lucide-react';

// ── Categories ────────────────────────────────────────────────────────────────

export const BUG_CATEGORIES = [
  { value: 'ui_display',      label: 'UI / Display issue' },
  { value: 'data_incorrect',  label: 'Incorrect data' },
  { value: 'feature_broken',  label: 'Feature not working' },
  { value: 'performance',     label: 'Slow / performance' },
  { value: 'crash',           label: 'App crash / error' },
  { value: 'photos_upload',   label: 'Photos / uploads' },
  { value: 'maps_gps',        label: 'Maps / GPS' },
  { value: 'notifications',   label: 'Notifications' },
  { value: 'permissions',     label: 'Permissions / access' },
  { value: 'other',           label: 'Other' },
] as const;

type Phase = 'idle' | 'open' | 'submitting' | 'success';

// ── Component ─────────────────────────────────────────────────────────────────

export default function BugReportModal() {
  const [phase, setPhase]             = useState<Phase>('idle');
  const [category, setCategory]       = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot]   = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openModal() {
    setPhase('open');
    setCategory('');
    setDescription('');
    setScreenshot(null);
    setScreenshotPreview(null);
    setErrorMsg('');
  }

  function closeModal() {
    if (phase === 'submitting') return;
    setPhase('idle');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Screenshot must be under 10 MB.');
      return;
    }
    setScreenshot(file);
    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function removeScreenshot() {
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setErrorMsg('Please describe the issue.'); return; }
    setErrorMsg('');
    setPhase('submitting');

    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('description', description.trim());
      formData.append('page_url', window.location.href);
      formData.append('user_agent', navigator.userAgent);
      if (screenshot) formData.append('screenshot', screenshot);

      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'Failed to submit. Please try again.');
        setPhase('open');
        return;
      }

      setPhase('success');
      setTimeout(() => setPhase('idle'), 3500);
    } catch {
      setErrorMsg('Network error. Please try again.');
      setPhase('open');
    }
  }

  return (
    <>
      {/* ── FAB ── */}
      {phase === 'idle' && (
        <button
          onClick={openModal}
          title="Report a bug"
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <Bug size={20} className="text-slate-300" />
        </button>
      )}

      {/* ── Success toast ── */}
      {phase === 'success' && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-emerald-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-xl">
          <CheckCircle2 size={16} />
          Bug report submitted — thanks!
        </div>
      )}

      {/* ── Modal backdrop ── */}
      {(phase === 'open' || phase === 'submitting') && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center">
                  <Bug size={15} className="text-red-500" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-sm leading-tight">Report a Bug</h2>
                  <p className="text-xs text-slate-400">Help us improve IWILLBUILD</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                disabled={phase === 'submitting'}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
              >
                <X size={15} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              {/* Category dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-8"
                    disabled={phase === 'submitting'}
                  >
                    <option value="">Select a category…</option>
                    {BUG_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What happened? What were you trying to do? What did you expect to happen?"
                  rows={4}
                  maxLength={2000}
                  disabled={phase === 'submitting'}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-slate-300"
                />
                <p className="text-right text-[11px] text-slate-300 mt-0.5">{description.length}/2000</p>
              </div>

              {/* Screenshot */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Screenshot <span className="text-slate-300 font-normal normal-case">(optional)</span>
                </label>

                {screenshotPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      className="w-full max-h-40 object-contain"
                    />
                    <button
                      type="button"
                      onClick={removeScreenshot}
                      disabled={phase === 'submitting'}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                    >
                      <X size={12} />
                    </button>
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 text-white text-[11px] px-2 py-0.5 rounded-full">
                      <Image size={10} />
                      {screenshot?.name}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={phase === 'submitting'}
                    className="w-full border-2 border-dashed border-slate-200 hover:border-primary/40 rounded-xl py-5 flex flex-col items-center gap-2 text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <Paperclip size={18} />
                    <span className="text-xs font-medium">Attach screenshot</span>
                    <span className="text-[11px] opacity-60">PNG, JPG, WebP — max 10 MB</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Error */}
              {errorMsg && (
                <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle size={13} className="shrink-0" />{errorMsg}
                </div>
              )}

              {/* Current page hint */}
              <p className="text-[11px] text-slate-300 -mt-1">
                Page: <span className="font-mono">{window.location.pathname}</span>
              </p>

              {/* Submit */}
              <button
                type="submit"
                disabled={phase === 'submitting' || !description.trim()}
                className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {phase === 'submitting'
                  ? <><Loader2 size={15} className="animate-spin" />Submitting…</>
                  : <><Send size={14} />Submit Bug Report</>
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
