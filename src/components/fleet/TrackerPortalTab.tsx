/**
 * TrackerPortalTab
 *
 * Phase-1 bridge to external GPS tracker portals.
 * Saves one URL per company in company_settings.structure_json under the
 * key `trackerPortal: { name, url }`.
 *
 * Behaviour:
 *   1. No config saved  → clean empty state + "Setup Tracker Portal" button
 *   2. Config saved     → attempt iframe embed
 *   3. Embed blocked    → clean fallback with "Open in new tab" button
 *
 * Desktop-only — this component is only rendered when view === 'tracker'
 * which is hidden on mobile in the parent pill.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowUpRight,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Satellite,
  Trash2,
  X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackerConfig {
  name: string;
  url: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function displayHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

// ── Setup / Edit Modal ────────────────────────────────────────────────────────

interface SetupModalProps {
  initial: TrackerConfig | null;
  saving: boolean;
  onSave: (cfg: TrackerConfig) => void;
  onClose: () => void;
}

function SetupModal({ initial, saving, onSave, onClose }: SetupModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url,  setUrl]  = useState(initial?.url  ?? '');
  const [err,  setErr]  = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normUrl = normaliseUrl(url);
    if (!normUrl) { setErr('Please enter a tracker portal URL.'); return; }
    if (!isValidUrl(normUrl)) { setErr('URL must start with http:// or https://'); return; }
    onSave({ name: name.trim() || displayHost(normUrl), url: normUrl });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Satellite size={15} className="text-slate-500" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-sm text-slate-800">
                {initial ? 'Edit Tracker Portal' : 'Setup Tracker Portal'}
              </h2>
              <p className="text-[11px] text-slate-400">Paste your existing portal URL</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
              <AlertCircle size={13} className="shrink-0" />
              {err}
            </div>
          )}

          {/* Portal name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Portal name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Teletrac Navman, Coretex, Linxio…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tracker portal URL <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setErr(''); }}
                placeholder="https://portal.yourtracker.com"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors font-mono"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
              Paste the URL you normally open in your browser to view your tracker.
              IWILLBUILD will try to show it here — if the portal blocks embedding,
              a direct-link button will appear instead.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Save portal'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Embed-blocked fallback panel ──────────────────────────────────────────────

function EmbedBlockedFallback({
  config,
  onEdit,
  onRemove,
  isAdmin,
}: {
  config: TrackerConfig;
  onEdit: () => void;
  onRemove: () => void;
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-5">
        <Globe size={26} className="text-slate-400" />
      </div>

      <h3 className="font-heading font-bold text-base text-slate-700 mb-1">
        {config.name}
      </h3>
      <p className="text-xs text-slate-400 font-mono mb-1">{displayHost(config.url)}</p>

      <div className="flex items-center gap-1.5 mt-2 mb-6 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
        <AlertCircle size={11} className="text-amber-500 shrink-0" />
        <span className="text-[11px] font-semibold text-amber-700">
          This portal doesn't allow embedding — open it in a new tab to use it.
        </span>
      </div>

      <a
        href={config.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm mb-4"
      >
        Open {config.name} in new tab
        <ArrowUpRight size={14} />
      </a>

      {isAdmin && (
        <div className="flex items-center gap-4 mt-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Pencil size={11} />
            Edit
          </button>
          <span className="text-slate-200">|</span>
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-600 transition-colors"
          >
            <Trash2 size={11} />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TrackerPortalTabProps {
  isAdmin: boolean;
}

export default function TrackerPortalTab({ isAdmin }: TrackerPortalTabProps) {
  const [config,       setConfig]       = useState<TrackerConfig | null>(null);
  const [loadingCfg,   setLoadingCfg]   = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveErr,      setSaveErr]      = useState('');
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeKey,    setIframeKey]    = useState(0); // force re-mount on URL change

  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load saved config from company settings ─────────────────────────────────
  useEffect(() => {
    fetch('/api/company-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((data: { structure?: { trackerPortal?: TrackerConfig } }) => {
        const tp = data.structure?.trackerPortal;
        if (tp?.url) setConfig(tp);
      })
      .catch(() => { /* non-critical */ })
      .finally(() => setLoadingCfg(false));
  }, []);

  // ── Save config via PUT /api/company-settings ───────────────────────────────
  const saveConfig = useCallback(async (newCfg: TrackerConfig) => {
    setSaving(true);
    setSaveErr('');
    try {
      // First read current structure so we don't clobber other keys
      const getRes = await fetch('/api/company-settings', { credentials: 'include' });
      const current = getRes.ok ? await getRes.json() as { structure?: Record<string, unknown> } : {};
      const merged = { ...(current.structure ?? {}), trackerPortal: newCfg };

      const putRes = await fetch('/api/company-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'structure', data: merged }),
      });
      if (!putRes.ok) {
        const d = await putRes.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to save');
      }
      setConfig(newCfg);
      setEmbedBlocked(false);
      setIframeLoading(true);
      setIframeKey(k => k + 1);
      setShowModal(false);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Remove config ───────────────────────────────────────────────────────────
  const removeConfig = useCallback(async () => {
    setSaving(true);
    try {
      const getRes = await fetch('/api/company-settings', { credentials: 'include' });
      const current = getRes.ok ? await getRes.json() as { structure?: Record<string, unknown> } : {};
      const merged = { ...(current.structure ?? {}) };
      delete merged.trackerPortal;

      await fetch('/api/company-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'structure', data: merged }),
      });
      setConfig(null);
      setEmbedBlocked(false);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }, []);

  // ── Iframe embed-block detection ────────────────────────────────────────────
  // Strategy: start a 6-second timer when the iframe begins loading.
  // If onLoad fires with a blank contentDocument (cross-origin block) or the
  // timer expires with iframeLoading still true, we flip to the fallback.
  // This catches both X-Frame-Options and CSP frame-ancestors blocks.

  function handleIframeLoad(e: React.SyntheticEvent<HTMLIFrameElement>) {
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    // Try to read contentDocument — cross-origin blocks throw a SecurityError
    try {
      const doc = (e.target as HTMLIFrameElement).contentDocument;
      // If we can read it and it's empty/blank, the browser may have blocked it
      if (doc && (doc.body?.innerHTML === '' || doc.title === '')) {
        setEmbedBlocked(true);
      }
    } catch {
      // SecurityError = cross-origin = loaded successfully (just can't read it)
      // This is the GOOD case — site loaded, just cross-origin
    }
    setIframeLoading(false);
  }

  function handleIframeError() {
    if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    setEmbedBlocked(true);
    setIframeLoading(false);
  }

  // Start the block-detection timer whenever a new URL is being loaded
  useEffect(() => {
    if (!config?.url || !iframeLoading) return;
    blockTimerRef.current = setTimeout(() => {
      // Still loading after 6s — assume blocked
      setEmbedBlocked(true);
      setIframeLoading(false);
    }, 6_000);
    return () => {
      if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    };
  }, [config?.url, iframeLoading, iframeKey]);

  // When config first loads, start iframe loading state
  useEffect(() => {
    if (config?.url) {
      setIframeLoading(true);
      setEmbedBlocked(false);
    }
  }, [config?.url]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingCfg) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* ── Sub-header bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            <Radio size={13} className="text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {config ? config.name : 'Tracker Portal'}
            </p>
            <p className="text-[11px] text-slate-400">
              {config
                ? embedBlocked
                  ? 'Embedding blocked — use the link below'
                  : `Viewing ${displayHost(config.url)}`
                : 'Connect your existing GPS tracker portal'}
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {config && (
          <div className="flex items-center gap-2">
            {/* Reload iframe */}
            {!embedBlocked && (
              <button
                onClick={() => { setIframeLoading(true); setEmbedBlocked(false); setIframeKey(k => k + 1); }}
                title="Reload portal"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors"
              >
                <RefreshCw size={12} className={iframeLoading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Reload</span>
              </button>
            )}
            {/* Open in new tab */}
            <a
              href={config.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors"
            >
              <ArrowUpRight size={12} />
              <span className="hidden sm:inline">New tab</span>
            </a>
            {/* Edit — admin only */}
            {isAdmin && (
              <button
                onClick={() => setShowModal(true)}
                title="Edit portal settings"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors"
              >
                <Pencil size={12} />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-[#F4F5F7]">

        {/* ── Empty state — no config ── */}
        {!config && (
          <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-6">
              <Satellite size={32} className="text-slate-300" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-700 mb-2">
              No tracker portal connected
            </h3>
            <p className="text-sm text-slate-400 max-w-sm leading-relaxed mb-8">
              Paste the URL of your existing GPS tracker portal — Teletrac Navman, Coretex,
              Linxio, or any other. IWILLBUILD will show it here so you don't need to switch tabs.
            </p>
            {isAdmin ? (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
              >
                <Plus size={15} />
                Setup Tracker Portal
              </button>
            ) : (
              <p className="text-xs text-slate-400 italic">Ask an admin to set up the tracker portal.</p>
            )}
          </div>
        )}

        {/* ── Embed blocked fallback ── */}
        {config && embedBlocked && (
          <div className="flex flex-col flex-1 h-full bg-white">
            <EmbedBlockedFallback
              config={config}
              onEdit={() => setShowModal(true)}
              onRemove={removeConfig}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* ── Iframe ── */}
        {config && !embedBlocked && (
          <>
            {/* Loading overlay */}
            <AnimatePresence>
              {iframeLoading && (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#F4F5F7] gap-3"
                >
                  <Loader2 size={24} className="animate-spin text-slate-400" />
                  <p className="text-xs text-slate-400">Loading {config.name}…</p>
                </motion.div>
              )}
            </AnimatePresence>

            <iframe
              key={iframeKey}
              src={config.url}
              title={config.name}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              className="absolute inset-0 w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </>
        )}
      </div>

      {/* ── Save error toast ── */}
      <AnimatePresence>
        {saveErr && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg"
          >
            <AlertCircle size={13} />
            {saveErr}
            <button onClick={() => setSaveErr('')} className="ml-1 opacity-70 hover:opacity-100">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Setup / Edit modal ── */}
      <AnimatePresence>
        {showModal && (
          <SetupModal
            initial={config}
            saving={saving}
            onSave={saveConfig}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
