/**
 * QR Code modal for job sign-in / sign-out
 *
 * Generates a signed short-lived QR token, renders it as a QR code image
 * using the qrserver.com API (no npm package needed), and provides
 * Print and Copy Link actions.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import {
  X, QrCode, Loader2, AlertCircle, Copy, Printer,
  CheckCircle2, RefreshCw, LogIn, LogOut,
} from 'lucide-react';
import { openPrintWindow } from '@/lib/print-html';
import { escapeHtml, safeUrl } from '@/lib/html-escape';

const ACTOR_TYPES = [
  { value: 'employee',        label: 'Employee' },
  { value: 'contractor',      label: 'Contractor' },
  { value: 'consultant',      label: 'Consultant' },
  { value: 'delivery_driver', label: 'Delivery driver' },
  { value: 'guest',           label: 'Guest / visitor' },
] as const;

type ActorTypeValue = typeof ACTOR_TYPES[number]['value'];

const VALID_ACTOR_TYPES = new Set<string>(ACTOR_TYPES.map((a) => a.value));

interface Props {
  jobId: number;
  jobName?: string;
  action: 'signin' | 'signout';
  onClose: () => void;
}

interface QrData {
  ok: boolean;
  token: string;
  url: string;
  expiresAt: string;
  actorType: string;
}

export default function JobQrModal({ jobId, jobName, action, onClose }: Props) {
  const [actorType, setActorType] = useState<ActorTypeValue>('guest');
  const [qrData, setQrData]       = useState<QrData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);

  useBodyScrollLock(true);

  async function generate() {
    setLoading(true);
    setError(null);
    setQrData(null);
    try {
      // Validate actorType against the known allowlist before sending —
      // prevents method/property injection if state is somehow tampered with.
      if (!VALID_ACTOR_TYPES.has(actorType)) {
        setError('Invalid actor type selected.');
        return;
      }
      // Validate jobId is a safe integer before interpolating into URL.
      const safeJobId = Math.trunc(Number(jobId));
      if (!Number.isFinite(safeJobId) || safeJobId <= 0) {
        setError('Invalid job ID.');
        return;
      }
      const res = await fetch(`/api/jobs/${safeJobId}/generate-qr`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actorType }),
      });
      const data = await res.json() as QrData & { error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to generate QR code');
        return;
      }
      setQrData(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate on open
  useEffect(() => { void generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyLink() {
    if (!qrData?.url) return;
    try {
      await navigator.clipboard.writeText(qrData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  function printQr() {
    if (!qrData?.url) return;
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrData.url)}`;
    const actionLabel  = action === 'signin' ? 'Sign In' : 'Sign Out';
    const jobLabel     = escapeHtml(jobName ?? `Job ${jobId}`);
    const safeQrImg    = safeUrl(qrImgUrl);
    const expiresLabel = qrData ? escapeHtml(new Date(qrData.expiresAt).toLocaleString('en-AU')) : '';
    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>QR Code \u2013 ${escapeHtml(actionLabel)} \u2013 ${jobLabel}</title>
    <style>
      body { font-family: sans-serif; text-align: center; padding: 40px; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      p  { color: #666; font-size: 14px; margin: 4px 0; }
      img { margin: 24px auto; display: block; }
      .exp { font-size: 12px; color: #999; margin-top: 16px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(actionLabel)} QR Code</h1>
    <p>${jobLabel}</p>
    <p>Scan to ${action === 'signin' ? 'sign in to' : 'sign out of'} this job</p>
    <img src="${safeQrImg}" width="300" height="300" alt="QR Code" />
    <p class="exp">Expires: ${expiresLabel}</p>
    <script>window.onload = () => window.print();<\/script>
  </body>
</html>`;
    openPrintWindow(html);
  }

  const qrImgUrl = qrData
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrData.url)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(88dvh, 640px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${action === 'signin' ? 'bg-green-50' : 'bg-slate-100'}`}>
              {action === 'signin'
                ? <LogIn size={15} className="text-green-600" />
                : <LogOut size={15} className="text-slate-600" />}
            </div>
            <h2 className="font-bold text-slate-800 text-base">
              QR {action === 'signin' ? 'Sign In' : 'Sign Out'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain flex-1 px-5 py-4 flex flex-col gap-4">
          {jobName && (
            <p className="text-sm text-slate-500 text-center">{jobName}</p>
          )}

          {/* Actor type selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Actor type</label>
            <select
              value={actorType}
              onChange={(e) => {
                const v = e.target.value;
                if (VALID_ACTOR_TYPES.has(v)) setActorType(v as ActorTypeValue);
              }}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400/30 bg-white"
            >
              {ACTOR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? 'Generating…' : 'Generate QR'}
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* QR image */}
          {qrData && qrImgUrl && (
            <div className="flex flex-col items-center gap-3">
              <div className="border-2 border-slate-200 rounded-xl p-3 bg-white">
                <img src={qrImgUrl} alt="QR Code" width={280} height={280} className="block" />
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <AlertCircle size={11} />
                Expires {new Date(qrData.expiresAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} — regenerate if expired
              </p>
              <div className="flex gap-2 w-full">
                <button onClick={copyLink} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">
                  {copied ? <CheckCircle2 size={13} className="text-green-600" /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <button onClick={printQr} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors">
                  <Printer size={13} />
                  Print
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
