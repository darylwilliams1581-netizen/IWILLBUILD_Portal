/**
 * ShareLinkModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable modal that generates a public share link for any document type
 * (estimate, invoice, SWMS, report) via POST /api/secure-share.
 *
 * No login required for the recipient — they just open the link.
 *
 * Usage (flat props — legacy):
 *   <ShareLinkModal
 *     open={showShare}
 *     onClose={() => setShowShare(false)}
 *     targetType="estimate"
 *     targetId={String(estimate.id)}
 *     title={estimate.title}
 *   />
 *
 * Usage (target object — preferred):
 *   <ShareLinkModal
 *     open={showShare}
 *     onClose={() => setShowShare(false)}
 *     target={{ type: 'job_swms', id: '42', title: 'SWMS #1', linkType: 'swms_signon', defaultPermissions: ['view','sign'] }}
 *   />
 */
import { useState, useEffect, useRef } from 'react';
import { X, Link2, Copy, Check, Loader2, QrCode, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

/** Structured target descriptor — used by JobSafety and other callers */
export interface ShareTarget {
  type: string;
  id: string;
  title: string;
  linkType?: string;
  defaultPermissions?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Preferred: pass a ShareTarget object */
  target?: ShareTarget;
  /** Legacy flat props — used when target is not provided */
  targetType?: 'estimate' | 'invoice' | 'swms' | 'report' | 'safety_plan' | string;
  targetId?: string;
  title?: string;
}

const EXPIRY_OPTIONS = [
  { label: '7 days',   value: 7 },
  { label: '30 days',  value: 30 },
  { label: '90 days',  value: 90 },
  { label: 'No expiry', value: 0 },
];

const TYPE_LABELS: Record<string, string> = {
  estimate:    'Quote / Estimate',
  invoice:     'Invoice',
  swms:        'SWMS',
  report:      'Report',
  safety_plan: 'Safety Plan',
  job_swms:    'SWMS',
  job_form:    'Form',
};

export default function ShareLinkModal({ open, onClose, target, targetType: legacyType, targetId: legacyId, title: legacyTitle }: Props) {
  // Resolve props — prefer target object, fall back to legacy flat props
  const resolvedType  = target?.type  ?? legacyType  ?? '';
  const resolvedId    = target?.id    ?? legacyId    ?? '';
  const resolvedTitle = target?.title ?? legacyTitle ?? '';
  const resolvedLinkType = target?.linkType ?? 'document_view';
  const resolvedPermissions = target?.defaultPermissions ?? ['view', 'download'];
  const [expiryDays, setExpiryDays] = useState(30);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  // Lock body scroll while open — must be before any early return
  useBodyScrollLock(open);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setShareUrl(null);
      setError(null);
      setCopied(false);
      setShowQr(false);
      setExpiryDays(30);
    }
  }, [open]);

  // Draw QR code when URL is ready and QR panel is shown
  useEffect(() => {
    if (!shareUrl || !showQr || !qrRef.current) return;
    void drawQr(shareUrl, qrRef.current);
  }, [shareUrl, showQr]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      // SWMS sign-on links use the dedicated SWMS share-token endpoint so
      // recipients land on /safety/sign/:token (the full view+sign workflow)
      // rather than the generic /share/:token metadata page.
      if (resolvedLinkType === 'swms_signon' && resolvedType === 'job_swms') {
        const res = await fetch(`/api/safety/job-swms/${resolvedId}/share-token`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await res.json() as { token?: string; url?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Failed to create SWMS link');
        setShareUrl(data.url ?? null);
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
      const data = await res.json() as { ok?: boolean; shareUrl?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed to create link');
      setShareUrl(data.shareUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDownloadQr() {
    if (!qrRef.current) return;
    const a = document.createElement('a');
    a.href = qrRef.current.toDataURL('image/png');
    a.download = `share-qr-${resolvedType}-${resolvedId}.png`;
    a.click();
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
            style={{ maxHeight: 'min(88dvh, 600px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
                  <Link2 size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Share {TYPE_LABELS[resolvedType] ?? resolvedType}</p>
                  <p className="text-xs text-slate-400 truncate max-w-[220px]">{resolvedTitle}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain flex-1 px-5 py-5 flex flex-col gap-4">
              {!shareUrl ? (
                <>
                  {/* Expiry picker */}
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Link expires after</p>
                    <div className="flex gap-2 flex-wrap">
                      {EXPIRY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setExpiryDays(opt.value)}
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
                    onClick={() => void handleGenerate()}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                    {loading ? 'Generating…' : 'Generate share link'}
                  </button>
                </>
              ) : (
                <>
                  {/* Success — show link */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <Check size={14} className="text-emerald-600 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700">Share link created</span>
                  </div>

                  {/* URL row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-slate-600 font-mono truncate">{shareUrl}</p>
                    </div>
                    <button
                      onClick={() => void handleCopy()}
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

                  {/* QR toggle */}
                  <button
                    onClick={() => setShowQr((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <QrCode size={14} />
                    {showQr ? 'Hide QR code' : 'Show QR code'}
                  </button>

                  {showQr && (
                    <div className="flex flex-col items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <canvas ref={qrRef} className="rounded-lg" />
                      <button
                        onClick={handleDownloadQr}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
                      >
                        <Download size={12} />
                        Download QR
                      </button>
                    </div>
                  )}

                  <p className="text-center text-xs text-slate-400">
                    {expiryDays > 0 ? `Expires in ${expiryDays} days` : 'No expiry set'} · View &amp; download only
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Minimal QR code renderer (no external lib) ────────────────────────────────
// Uses the browser's built-in QR generation via a data URL approach.
// Falls back to a simple canvas-based QR using the qrcode library if available,
// otherwise renders a placeholder with the URL.

async function drawQr(url: string, canvas: HTMLCanvasElement) {
  try {
    // Try to use qrcode library if available
    const QRCode = await import('qrcode').then((m) => m.default).catch(() => null);
    if (QRCode) {
      await QRCode.toCanvas(canvas, url, {
        width: 200,
        margin: 2,
        color: { dark: '#1e293b', light: '#f8fafc' },
      });
      return;
    }
  } catch { /* fall through */ }

  // Fallback: draw a simple placeholder
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = 200;
  canvas.height = 200;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#1e293b';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('QR code unavailable', 100, 100);
  ctx.fillText('Copy the link above', 100, 118);
}
