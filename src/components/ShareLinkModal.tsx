/**
 * ShareLinkModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable modal that manages a public share link for any document type.
 *
 * Behaviour:
 *   - On open: fetches GET /api/secure-share/active to check for an existing
 *     active link.  If one exists, displays it immediately — no new link is
 *     created.
 *   - If multiple active links exist (legacy duplicates): shows a warning and
 *     lets the owner choose which to keep, revoking the others.
 *   - If no active link: shows the Generate form.
 *   - Revoke: calls DELETE /api/secure-share/:id, returns to Generate form.
 *   - Revoke and Create New: calls POST /api/secure-share/:id/revoke-and-rotate,
 *     displays the new link.
 *
 * Usage (target object — preferred):
 *   <ShareLinkModal
 *     open={showShare}
 *     onClose={() => setShowShare(false)}
 *     target={{ type: 'completed_form', id: '42', title: 'Safety Induction', linkType: 'document_view', defaultPermissions: ['view','download'] }}
 *   />
 *
 * Usage (flat props — legacy):
 *   <ShareLinkModal open={showShare} onClose={...} targetType="estimate" targetId="7" title="Quote #7" />
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Link2, Copy, Check, Loader2, QrCode, Download,
  AlertTriangle, RefreshCw, Trash2, Shield, Clock, Eye, EyeOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Structured target descriptor */
export interface ShareTarget {
  type: string;
  id: string;
  title: string;
  linkType?: string;
  defaultPermissions?: string[];
}

interface ActiveLink {
  id: number;
  linkType: string;
  targetType: string;
  targetId: string;
  title: string;
  permissions: string[];
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  hasPassword: boolean;
  shareUrl: string | null;
  urlRecoverable: boolean;
  createdAt: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Preferred: pass a ShareTarget object */
  target?: ShareTarget;
  /** Legacy flat props */
  targetType?: string;
  targetId?: string;
  title?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  estimate:       'Quote / Estimate',
  invoice:        'Invoice',
  swms:           'SWMS',
  report:         'Report',
  safety_plan:    'Safety Plan',
  job_swms:       'SWMS',
  job_form:       'Form',
  completed_form: 'Completed Form',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShareLinkModal({
  open, onClose,
  target,
  targetType: legacyType, targetId: legacyId, title: legacyTitle,
}: Props) {
  // Resolve props — prefer target object, fall back to legacy flat props
  const resolvedType        = target?.type  ?? legacyType  ?? '';
  const resolvedId          = target?.id    ?? legacyId    ?? '';
  const resolvedTitle       = target?.title ?? legacyTitle ?? '';
  const resolvedLinkType    = target?.linkType ?? 'document_view';
  const resolvedPermissions = target?.defaultPermissions ?? ['view', 'download'];

  // ── State ──────────────────────────────────────────────────────────────────
  type Phase = 'loading' | 'existing' | 'duplicates' | 'generate' | 'done';
  const [phase, setPhase] = useState<Phase>('loading');
  const [activeLinks, setActiveLinks] = useState<ActiveLink[]>([]);
  const [displayLink, setDisplayLink] = useState<ActiveLink | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Generate form state
  const [expiryDays, setExpiryDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Revoke state
  const [revoking, setRevoking] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Duplicate resolution
  const [keepId, setKeepId] = useState<number | null>(null);
  const [resolvingDuplicates, setResolvingDuplicates] = useState(false);

  // Copy / QR
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useBodyScrollLock(open);

  // ── Fetch active links on open ─────────────────────────────────────────────

  const fetchActive = useCallback(async () => {
    if (!resolvedType || !resolvedId) return;
    setPhase('loading');
    setFetchError(null);
    setRevokeError(null);
    setCopied(false);
    setShowQr(false);
    try {
      const r = await fetch(
        `/api/secure-share/active?targetType=${encodeURIComponent(resolvedType)}&targetId=${encodeURIComponent(resolvedId)}&linkType=${encodeURIComponent(resolvedLinkType)}`,
        { credentials: 'include' }
      );
      const data = await r.json() as { links?: ActiveLink[]; duplicates?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Failed to load');

      const links = data.links ?? [];
      setActiveLinks(links);

      if (links.length === 0) {
        setPhase('generate');
      } else if (links.length === 1) {
        setDisplayLink(links[0]);
        setPhase('existing');
      } else {
        // Multiple active links — show duplicate resolution UI
        setKeepId(links[0].id); // default: keep newest
        setPhase('duplicates');
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load');
      setPhase('generate'); // fall through to generate form
    }
  }, [resolvedType, resolvedId]);

  useEffect(() => {
    if (open) void fetchActive();
  }, [open, fetchActive]);

  // Draw QR when URL + panel are ready
  useEffect(() => {
    const url = displayLink?.shareUrl;
    if (!url || !showQr || !qrRef.current) return;
    void drawQr(url, qrRef.current);
  }, [displayLink?.shareUrl, showQr]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      // SWMS sign-on links use the dedicated SWMS endpoint
      if (resolvedLinkType === 'swms_signon' && resolvedType === 'job_swms') {
        const res = await fetch(`/api/safety/job-swms/${resolvedId}/share-token`, {
          method: 'POST', credentials: 'include',
        });
        const data = await res.json() as { token?: string; url?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Failed to create SWMS link');
        // SWMS links don't go through the idempotent system — just show the URL
        setDisplayLink({
          id: 0, linkType: 'swms_signon', targetType: resolvedType, targetId: resolvedId,
          title: resolvedTitle, permissions: resolvedPermissions,
          expiresAt: null, maxUses: null, useCount: 0, hasPassword: false,
          shareUrl: data.url ?? null, urlRecoverable: true, createdAt: new Date().toISOString(),
        });
        setPhase('done');
        return;
      }

      const res = await fetch('/api/secure-share', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: resolvedTitle,
          linkType: resolvedLinkType,
          targetType: resolvedType,
          targetId: resolvedId,
          permissions: resolvedPermissions,
          expiryDays: expiryDays > 0 ? expiryDays : undefined,
        }),
      });
      const data = await res.json() as {
        ok?: boolean; existing?: boolean; id?: number; shareUrl?: string;
        expiresAt?: string | null; useCount?: number; permissions?: string[];
        createdAt?: string | null; error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed to create link');

      const link: ActiveLink = {
        id: data.id ?? 0,
        linkType: resolvedLinkType,
        targetType: resolvedType,
        targetId: resolvedId,
        title: resolvedTitle,
        permissions: data.permissions ?? resolvedPermissions,
        expiresAt: data.expiresAt ?? null,
        maxUses: null,
        useCount: data.useCount ?? 0,
        hasPassword: false,
        shareUrl: data.shareUrl ?? null,
        urlRecoverable: true,
        createdAt: data.createdAt ?? new Date().toISOString(),
      };
      setDisplayLink(link);
      setPhase('existing');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(linkId: number) {
    setRevoking(true);
    setRevokeError(null);
    try {
      const r = await fetch(`/api/secure-share/${linkId}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) throw new Error(data.error ?? 'Failed to revoke');
      setDisplayLink(null);
      setPhase('generate');
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : 'Failed to revoke');
    } finally {
      setRevoking(false);
    }
  }

  async function handleRevokeAndRotate(linkId: number) {
    setRotating(true);
    setRevokeError(null);
    try {
      const r = await fetch(`/api/secure-share/${linkId}/revoke-and-rotate`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryDays: expiryDays > 0 ? expiryDays : undefined }),
      });
      const data = await r.json() as {
        ok?: boolean; id?: number; shareUrl?: string;
        expiresAt?: string | null; permissions?: string[]; error?: string;
      };
      if (!r.ok || !data.ok) throw new Error(data.error ?? 'Failed to rotate');

      const newLink: ActiveLink = {
        id: data.id ?? 0,
        linkType: displayLink?.linkType ?? resolvedLinkType,
        targetType: resolvedType,
        targetId: resolvedId,
        title: resolvedTitle,
        permissions: data.permissions ?? resolvedPermissions,
        expiresAt: data.expiresAt ?? null,
        maxUses: null,
        useCount: 0,
        hasPassword: false,
        shareUrl: data.shareUrl ?? null,
        urlRecoverable: true,
        createdAt: new Date().toISOString(),
      };
      setDisplayLink(newLink);
      setActiveLinks([newLink]);
      setPhase('existing');
      setShowQr(false);
      setCopied(false);
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : 'Failed to rotate');
    } finally {
      setRotating(false);
    }
  }

  async function handleResolveDuplicates() {
    if (keepId === null) return;
    setResolvingDuplicates(true);
    setRevokeError(null);
    try {
      // Revoke all links except the chosen one
      const toRevoke = activeLinks.filter((l) => l.id !== keepId);
      await Promise.all(
        toRevoke.map((l) =>
          fetch(`/api/secure-share/${l.id}`, { method: 'DELETE', credentials: 'include' })
        )
      );
      const kept = activeLinks.find((l) => l.id === keepId) ?? null;
      setDisplayLink(kept);
      setActiveLinks(kept ? [kept] : []);
      setPhase(kept ? 'existing' : 'generate');
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : 'Failed to resolve duplicates');
    } finally {
      setResolvingDuplicates(false);
    }
  }

  async function handleCopy() {
    const url = displayLink?.shareUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadQr() {
    if (!qrRef.current) return;
    const a = document.createElement('a');
    a.href = qrRef.current.toDataURL('image/png');
    a.download = `share-qr-${resolvedType}-${resolvedId}.png`;
    a.click();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatExpiry(expiresAt: string | null): string {
    if (!expiresAt) return 'No expiry';
    const d = new Date(expiresAt);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires in ${diffDays} days (${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })})`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!open) return null;

  const docLabel = TYPE_LABELS[resolvedType] ?? resolvedType;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' as const }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            style={{ maxHeight: 'min(90dvh, 640px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
                  <Link2 size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Share {docLabel}</p>
                  <p className="text-xs text-slate-400 truncate max-w-[220px]">{resolvedTitle}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain flex-1 px-5 py-5 flex flex-col gap-4">

              {/* ── Loading ── */}
              {phase === 'loading' && (
                <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Checking for existing link…</span>
                </div>
              )}

              {/* ── Fetch error (non-fatal — falls through to generate) ── */}
              {fetchError && phase === 'generate' && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0" />
                  Could not check for existing links. You can still generate a new one.
                </div>
              )}

              {/* ── Duplicate warning ── */}
              {phase === 'duplicates' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-amber-800">Multiple active links were created for this document.</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Select which link to keep. The others will be revoked immediately.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {activeLinks.map((link, i) => (
                      <button
                        key={link.id}
                        onClick={() => setKeepId(link.id)}
                        className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                          keepId === link.id
                            ? 'border-primary bg-violet-50'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                          keepId === link.id ? 'border-primary bg-primary' : 'border-slate-300'
                        }`}>
                          {keepId === link.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700">
                            Link {i + 1} — created {link.createdAt ? new Date(link.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{formatExpiry(link.expiresAt)} · {link.useCount} use{link.useCount !== 1 ? 's' : ''}</p>
                          {!link.urlRecoverable && (
                            <p className="text-[11px] text-amber-600 mt-0.5">URL not recoverable (pre-migration link)</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {revokeError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{revokeError}</p>
                  )}

                  <button
                    onClick={() => void handleResolveDuplicates()}
                    disabled={keepId === null || resolvingDuplicates}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {resolvingDuplicates ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    {resolvingDuplicates ? 'Resolving…' : 'Keep selected, revoke others'}
                  </button>
                </div>
              )}

              {/* ── Existing link ── */}
              {(phase === 'existing') && displayLink && (
                <ExistingLinkView
                  link={displayLink}
                  copied={copied}
                  showQr={showQr}
                  qrRef={qrRef}
                  revoking={revoking}
                  rotating={rotating}
                  revokeError={revokeError}
                  expiryDays={expiryDays}
                  onCopy={() => void handleCopy()}
                  onToggleQr={() => setShowQr((v) => !v)}
                  onDownloadQr={handleDownloadQr}
                  onRevoke={() => void handleRevoke(displayLink.id)}
                  onRevokeAndRotate={() => void handleRevokeAndRotate(displayLink.id)}
                  onExpiryChange={setExpiryDays}
                  formatExpiry={formatExpiry}
                />
              )}

              {/* ── Generate form ── */}
              {phase === 'generate' && (
                <GenerateForm
                  expiryDays={expiryDays}
                  loading={generating}
                  error={genError}
                  onExpiryChange={setExpiryDays}
                  onGenerate={() => void handleGenerate()}
                />
              )}

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ExistingLinkViewProps {
  link: ActiveLink;
  copied: boolean;
  showQr: boolean;
  qrRef: React.RefObject<HTMLCanvasElement | null>;
  revoking: boolean;
  rotating: boolean;
  revokeError: string | null;
  expiryDays: number;
  onCopy: () => void;
  onToggleQr: () => void;
  onDownloadQr: () => void;
  onRevoke: () => void;
  onRevokeAndRotate: () => void;
  onExpiryChange: (v: number) => void;
  formatExpiry: (e: string | null) => string;
}

function ExistingLinkView({
  link, copied, showQr, qrRef, revoking, rotating, revokeError,
  expiryDays, onCopy, onToggleQr, onDownloadQr, onRevoke, onRevokeAndRotate,
  onExpiryChange, formatExpiry,
}: ExistingLinkViewProps) {
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showRotateOptions, setShowRotateOptions] = useState(false);

  const EXPIRY_OPTIONS = [
    { label: '7 days',    value: 7 },
    { label: '30 days',   value: 30 },
    { label: '90 days',   value: 90 },
    { label: 'No expiry', value: 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Active badge */}
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-xs font-semibold text-emerald-700">Active share link</span>
        <span className="ml-auto text-xs text-emerald-600">{link.useCount} view{link.useCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
          <Clock size={10} /> {formatExpiry(link.expiresAt)}
        </span>
        <span className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
          <Eye size={10} /> {link.permissions.join(', ')}
        </span>
        {link.hasPassword && (
          <span className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
            <Shield size={10} /> Password protected
          </span>
        )}
        {link.createdAt && (
          <span className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
            Created {new Date(link.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* URL row */}
      {link.shareUrl ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <p className="text-xs text-slate-600 font-mono truncate">{link.shareUrl}</p>
          </div>
          <button
            onClick={onCopy}
            className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl border transition-colors ${
              copied
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <EyeOff size={13} className="text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700">
            URL not recoverable — this link was created before encrypted token storage was enabled.
            Use <strong>Revoke and Create New</strong> to generate a recoverable link.
          </span>
        </div>
      )}

      {/* QR toggle */}
      {link.shareUrl && (
        <>
          <button
            onClick={onToggleQr}
            className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            <QrCode size={14} />
            {showQr ? 'Hide QR code' : 'Show QR code'}
          </button>

          {showQr && (
            <div className="flex flex-col items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <canvas ref={qrRef} className="rounded-lg" />
              <button
                onClick={onDownloadQr}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
              >
                <Download size={12} /> Download QR
              </button>
            </div>
          )}
        </>
      )}

      {/* Revoke error */}
      {revokeError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{revokeError}</p>
      )}

      {/* Revoke and Rotate options */}
      {showRotateOptions && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-600">New link expiry</p>
          <div className="flex gap-2 flex-wrap">
            {EXPIRY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onExpiryChange(opt.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  expiryDays === opt.value
                    ? 'bg-primary text-white border-primary'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setShowRotateOptions(false); onRevokeAndRotate(); }}
            disabled={rotating}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 mt-1"
          >
            {rotating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {rotating ? 'Creating new link…' : 'Revoke and create new link'}
          </button>
        </div>
      )}

      {/* Action buttons */}
      {!showRevokeConfirm && !showRotateOptions && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowRotateOptions(true)}
            disabled={rotating || revoking}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-primary hover:bg-violet-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} /> Revoke and create new
          </button>
          <button
            onClick={() => setShowRevokeConfirm(true)}
            disabled={revoking || rotating}
            className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Trash2 size={12} /> Revoke
          </button>
        </div>
      )}

      {/* Revoke confirmation */}
      {showRevokeConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-red-800">Revoke this link?</p>
          <p className="text-xs text-red-700">The recipient URL will stop working immediately. This cannot be undone.</p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => { setShowRevokeConfirm(false); onRevoke(); }}
              disabled={revoking}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              {revoking ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {revoking ? 'Revoking…' : 'Yes, revoke'}
            </button>
            <button
              onClick={() => setShowRevokeConfirm(false)}
              className="flex-1 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface GenerateFormProps {
  expiryDays: number;
  loading: boolean;
  error: string | null;
  onExpiryChange: (v: number) => void;
  onGenerate: () => void;
}

function GenerateForm({ expiryDays, loading, error, onExpiryChange, onGenerate }: GenerateFormProps) {
  const EXPIRY_OPTIONS = [
    { label: '7 days',    value: 7 },
    { label: '30 days',   value: 30 },
    { label: '90 days',   value: 90 },
    { label: 'No expiry', value: 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Link expires after</p>
        <div className="flex gap-2 flex-wrap">
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onExpiryChange(opt.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                expiryDays === opt.value
                  ? 'bg-primary text-white border-primary'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 flex items-start gap-2">
        <Link2 size={13} className="text-slate-400 mt-0.5 shrink-0" />
        <span>Anyone with the link can view and download this document. No login required.</span>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={onGenerate}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
        {loading ? 'Generating…' : 'Generate share link'}
      </button>
    </div>
  );
}

// ── QR renderer ───────────────────────────────────────────────────────────────

async function drawQr(url: string, canvas: HTMLCanvasElement) {
  try {
    const QRCode = await import('qrcode').then((m) => m.default).catch(() => null);
    if (QRCode) {
      await QRCode.toCanvas(canvas, url, {
        width: 200, margin: 2,
        color: { dark: '#1e293b', light: '#f8fafc' },
      });
      return;
    }
  } catch { /* fall through */ }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = 200; canvas.height = 200;
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#1e293b'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText('QR code unavailable', 100, 100);
  ctx.fillText('Copy the link above', 100, 118);
}
