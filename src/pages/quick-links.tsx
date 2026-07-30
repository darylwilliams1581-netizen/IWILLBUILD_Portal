/**
 * Quick Links — /quick-links
 *
 * Desktop-only office launcher. Users save URLs as named tiles; clicking
 * opens the destination in a new tab. No iframe embedding.
 *
 * Storage: company_settings.structure_json → { quickLinks: QuickLink[] }
 * Each link: { id, label, url, favicon, ogImage, createdAt }
 *
 * Icon resolution (3-tier):
 *   1. Cached favicon/ogImage stored on the link object (fetched at save time
 *      via GET /api/quick-links/site-meta — server-side, no CORS issues)
 *   2. Google Favicon API as live fallback (catches most cases instantly)
 *   3. Letter-avatar with deterministic pastel colour (always works)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Globe,
  ImageOff,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import PortalErrorBoundary from '@/components/PortalErrorBoundary';
import { usePermissions } from '@/lib/usePermissions';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuickLink {
  id: string;
  label: string;
  url: string;
  /** Best icon URL found at save time (favicon or og:image) */
  favicon?: string | null;
  /** og:image URL found at save time */
  ogImage?: string | null;
  /** Auto-detected page title (used to pre-fill label) */
  detectedTitle?: string | null;
  createdAt: string;
}

interface SiteMeta {
  favicon: string | null;
  ogImage: string | null;
  title: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function displayHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function googleFaviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch { return ''; }
}

/** Deterministic pastel bg + dark text from label string */
const AVATAR_PALETTES = [
  { bg: '#E0E7FF', text: '#3730A3' },
  { bg: '#D1FAE5', text: '#065F46' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#FCE7F3', text: '#9D174D' },
  { bg: '#E0F2FE', text: '#0C4A6E' },
  { bg: '#F3E8FF', text: '#6B21A8' },
  { bg: '#FFF7ED', text: '#9A3412' },
  { bg: '#F0FDF4', text: '#14532D' },
];

function avatarPalette(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

// ── Fetch site meta via backend proxy ────────────────────────────────────────

async function fetchSiteMeta(url: string): Promise<SiteMeta> {
  try {
    const res = await fetch(
      `/api/quick-links/site-meta?url=${encodeURIComponent(url)}`,
      { credentials: 'include' }
    );
    if (!res.ok) return { favicon: null, ogImage: null, title: null };
    return await res.json() as SiteMeta;
  } catch {
    return { favicon: null, ogImage: null, title: null };
  }
}

// ── Tile icon component ───────────────────────────────────────────────────────
// Resolution order:
//   1. link.favicon  (stored at save time from server-side scrape)
//   2. Google Favicon API  (live, works for most sites)
//   3. Letter avatar  (always works)

function TileIcon({ link, size = 'md' }: { link: QuickLink; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-8 h-8' : 'w-11 h-11';
  const textSize = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-xs' : 'text-base';
  const radius = size === 'lg' ? 'rounded-2xl' : 'rounded-xl';

  const pal = avatarPalette(link.label);
  const initial = (link.label.trim()[0] ?? '?').toUpperCase();

  // Try stored favicon first, then Google Favicon API
  const candidates = [
    link.favicon,
    googleFaviconUrl(link.url),
  ].filter(Boolean) as string[];

  const [idx, setIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(candidates.length === 0);

  // Reset when link changes
  useEffect(() => {
    setIdx(0);
    setAllFailed(candidates.length === 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.id, link.favicon, link.url]);

  if (allFailed || candidates.length === 0) {
    return (
      <div
        className={`${dim} ${radius} flex items-center justify-center ${textSize} font-black shrink-0 select-none`}
        style={{ background: pal.bg, color: pal.text }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={candidates[idx]}
      alt=""
      width={size === 'lg' ? 56 : size === 'sm' ? 32 : 44}
      height={size === 'lg' ? 56 : size === 'sm' ? 32 : 44}
      onError={() => {
        if (idx + 1 < candidates.length) {
          setIdx(i => i + 1);
        } else {
          setAllFailed(true);
        }
      }}
      className={`${dim} ${radius} object-contain bg-white border border-slate-100 shrink-0`}
    />
  );
}

// ── URL preview strip (shown inside modal after URL is entered) ───────────────

function UrlPreviewStrip({
  url,
  meta,
  loading,
}: {
  url: string;
  meta: SiteMeta | null;
  loading: boolean;
}) {
  if (!url || !isValidUrl(normaliseUrl(url))) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
      {loading ? (
        <Loader2 size={18} className="animate-spin text-slate-400 shrink-0" />
      ) : meta?.favicon ? (
        <img
          src={meta.favicon}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 rounded-lg object-contain bg-white border border-slate-100 shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
          <ImageOff size={13} className="text-slate-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {meta?.title && (
          <p className="text-xs font-semibold text-slate-700 truncate">{meta.title}</p>
        )}
        <p className="text-[11px] text-slate-400 truncate">{displayHost(normaliseUrl(url))}</p>
      </div>
      {meta?.ogImage && (
        <img
          src={meta.ogImage}
          alt=""
          className="w-12 h-8 rounded-lg object-cover border border-slate-100 shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
    </div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

interface LinkModalProps {
  initial: QuickLink | null;
  saving: boolean;
  onSave: (label: string, url: string, meta: SiteMeta | null) => void;
  onClose: () => void;
}

function LinkModal({ initial, saving, onSave, onClose }: LinkModalProps) {
  const [label,       setLabel]       = useState(initial?.label ?? '');
  const [url,         setUrl]         = useState(initial?.url   ?? '');
  const [err,         setErr]         = useState('');
  const [meta,        setMeta]        = useState<SiteMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-fetch meta when URL changes (debounced 800ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const norm = normaliseUrl(url);
    if (!norm || !isValidUrl(norm)) { setMeta(null); return; }

    debounceRef.current = setTimeout(async () => {
      setMetaLoading(true);
      const m = await fetchSiteMeta(norm);
      setMeta(m);
      // Auto-fill label from page title if label is still empty
      if (!label.trim() && m.title) {
        // Trim common suffixes like " | Company Name" or " - Company Name"
        const cleaned = m.title.replace(/\s*[|\-–—]\s*.{1,40}$/, '').trim();
        if (cleaned) setLabel(cleaned);
      }
      setMetaLoading(false);
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setErr('Please enter a label for this link.'); return; }
    const norm = normaliseUrl(url);
    if (!norm || !isValidUrl(norm)) { setErr('Please enter a valid URL (e.g. https://example.com).'); return; }
    onSave(label.trim(), norm, meta);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15, ease: 'easeOut' as const }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Link2 size={14} className="text-slate-500" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-sm text-slate-800">
                {initial ? 'Edit link' : 'Add quick link'}
              </h2>
              <p className="text-[11px] text-slate-400">Opens in a new tab</p>
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

          {/* URL — first so we can auto-fill label */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              URL <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Globe size={14} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
              {/* textarea so long URLs wrap instead of scrolling */}
              <textarea
                value={url}
                onChange={e => { setUrl(e.target.value); setErr(''); }}
                placeholder="https://portal.example.com"
                rows={2}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none leading-relaxed"
                autoFocus
              />
            </div>
            {/* Live site preview strip */}
            <div className="mt-2">
              <UrlPreviewStrip url={url} meta={meta} loading={metaLoading} />
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Label <span className="text-red-500">*</span>
              {metaLoading && (
                <span className="ml-2 text-[10px] font-normal text-slate-400 inline-flex items-center gap-1">
                  <Loader2 size={9} className="animate-spin" /> detecting…
                </span>
              )}
            </label>
            <input
              type="text"
              value={label}
              onChange={e => { setLabel(e.target.value); setErr(''); }}
              placeholder="e.g. BYDA, Outlook, Teletrac, Xero…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Label auto-fills from the page title — edit it to anything you like.
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
              className="flex items-center gap-2 bg-primary hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Add link'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({
  link,
  onConfirm,
  onCancel,
}: {
  link: QuickLink;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15, ease: 'easeOut' as const }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={16} className="text-red-500" />
          </div>
          <div>
            <p className="font-bold text-sm text-slate-800">Remove link?</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{link.label}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
          >
            <Trash2 size={13} />
            Remove
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Link tile ─────────────────────────────────────────────────────────────────

function LinkTile({
  link,
  isAdmin,
  onEdit,
  onDelete,
}: {
  link: QuickLink;
  isAdmin: boolean;
  onEdit: (link: QuickLink) => void;
  onDelete: (link: QuickLink) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="group relative bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-md transition-all duration-150 flex flex-col gap-3"
    >
      {/* Admin controls — top-right, appear on hover */}
      {isAdmin && (
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onEdit(link); }}
            title="Edit"
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors shadow-sm"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(link); }}
            title="Remove"
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors shadow-sm"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* Icon + label */}
      <div className="flex items-center gap-3">
        <TileIcon link={link} size="md" />
        <div className="flex-1 min-w-0 pr-8">
          <p className="font-bold text-sm text-slate-800 truncate leading-snug">{link.label}</p>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">{displayHost(link.url)}</p>
        </div>
      </div>

      {/* og:image preview strip — shown if available */}
      {link.ogImage && (
        <img
          src={link.ogImage}
          alt=""
          className="w-full h-20 object-cover rounded-xl border border-slate-100"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          loading="lazy"
        />
      )}

      {/* Open button */}
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-primary hover:border-primary hover:text-white transition-colors"
      >
        Open
        <ArrowUpRight size={12} />
      </a>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuickLinksPage() {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();

  const [links,      setLinks]      = useState<QuickLink[]>([]);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState<QuickLink | null>(null);
  const [delTarget,  setDelTarget]  = useState<QuickLink | null>(null);
  const [saveErr,    setSaveErr]    = useState('');

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/company-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((data: { structure?: { quickLinks?: QuickLink[] } }) => {
        setLinks(data.structure?.quickLinks ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingCfg(false));
  }, []);

  // ── Persist helper ──────────────────────────────────────────────────────────
  const persist = useCallback(async (next: QuickLink[]) => {
    setSaving(true);
    setSaveErr('');
    try {
      const getRes = await fetch('/api/company-settings', { credentials: 'include' });
      const current = getRes.ok
        ? await getRes.json() as { structure?: Record<string, unknown> }
        : {};
      const merged = { ...(current.structure ?? {}), quickLinks: next };

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
      setLinks(next);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Add / Edit ──────────────────────────────────────────────────────────────
  function handleSave(label: string, url: string, meta: SiteMeta | null) {
    if (editTarget) {
      const next = links.map(l =>
        l.id === editTarget.id
          ? { ...l, label, url, favicon: meta?.favicon ?? l.favicon, ogImage: meta?.ogImage ?? l.ogImage }
          : l
      );
      void persist(next).then(() => { setEditTarget(null); setShowModal(false); });
    } else {
      const newLink: QuickLink = {
        id: `ql-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label,
        url,
        favicon: meta?.favicon ?? null,
        ogImage: meta?.ogImage ?? null,
        detectedTitle: meta?.title ?? null,
        createdAt: new Date().toISOString(),
      };
      void persist([...links, newLink]).then(() => setShowModal(false));
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete() {
    if (!delTarget) return;
    void persist(links.filter(l => l.id !== delTarget.id)).then(() => setDelTarget(null));
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden lg:pt-[104px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Quick Links — IWILLBUILD Portal</title>
        <meta name="description" content="Office launcher for external portals, tools, and systems." />
        <link rel="canonical" href="https://iwillbuild.com/quick-links" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalErrorBoundary inline>
        <div className="flex flex-col flex-1">

          {/* ── Header ── */}
          <header className="sticky top-0 z-30 bg-white border-b border-border shrink-0 safe-top">
            <div className="flex items-center gap-2 px-4 h-12">
              <button
                onClick={() => navigate('/home')}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Back to Home"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Home</span>
              </button>
              <span className="text-gray-300 shrink-0">|</span>
              <Link2 size={17} className="text-primary shrink-0" />
              <h1 className="font-heading font-bold text-base truncate">Quick Links</h1>
              {!loadingCfg && links.length > 0 && (
                <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full shrink-0">
                  {links.length}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => { setEditTarget(null); setShowModal(true); }}
                    className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={13} />
                    Add Link
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">

            {loadingCfg && (
              <div className="flex items-center justify-center py-24">
                <Loader2 size={22} className="animate-spin text-slate-300" />
              </div>
            )}

            {!loadingCfg && links.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-6">
                  <Link2 size={30} className="text-slate-300" />
                </div>
                <h2 className="font-heading font-bold text-base text-slate-700 mb-2">
                  No quick links yet
                </h2>
                <p className="text-sm text-slate-400 max-w-sm leading-relaxed mb-8">
                  Add links to your external portals — BYDA, Outlook, your tracker system,
                  accounting software, supplier portals, or anything your team opens daily.
                </p>
                {isAdmin ? (
                  <button
                    onClick={() => { setEditTarget(null); setShowModal(true); }}
                    className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
                  >
                    <Plus size={15} />
                    Add first link
                  </button>
                ) : (
                  <p className="text-xs text-slate-400 italic">Ask an admin to add quick links.</p>
                )}
              </div>
            )}

            {!loadingCfg && links.length > 0 && (
              <motion.div
                layout
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
              >
                <AnimatePresence mode="popLayout">
                  {links.map(link => (
                    <LinkTile
                      key={link.id}
                      link={link}
                      isAdmin={isAdmin}
                      onEdit={l => { setEditTarget(l); setShowModal(true); }}
                      onDelete={l => setDelTarget(l)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>

        {/* ── Save error toast ── */}
        <AnimatePresence>
          {saveErr && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg"
            >
              <AlertCircle size={13} />
              {saveErr}
              <button onClick={() => setSaveErr('')} className="ml-1 opacity-70 hover:opacity-100">
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Add / Edit modal ── */}
        <AnimatePresence>
          {showModal && (
            <LinkModal
              initial={editTarget}
              saving={saving}
              onSave={handleSave}
              onClose={() => { setShowModal(false); setEditTarget(null); }}
            />
          )}
        </AnimatePresence>

        {/* ── Delete confirm ── */}
        <AnimatePresence>
          {delTarget && (
            <DeleteConfirm
              link={delTarget}
              onConfirm={handleDelete}
              onCancel={() => setDelTarget(null)}
            />
          )}
        </AnimatePresence>
      </PortalErrorBoundary>
    </div>
  );
}
