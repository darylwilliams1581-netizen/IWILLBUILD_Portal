/**
 * FormSharePanel — Share/revoke/reset actions for a form submission
 * ─────────────────────────────────────────────────────────────────────────────
 * Used in Job → Forms tab beside each form instance.
 * Shows share link status, copy link, revoke, and reset controls.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Share2, Copy, CheckCircle2, XCircle, RotateCcw, Loader2,
  Eye, Clock, AlertTriangle, ExternalLink,
} from 'lucide-react';

interface ShareLink {
  id: number;
  targetType: string;
  expiresAt: string;
  maxViews: number | null;
  viewCount: number;
  revokedAt: string | null;
  createdAt: string;
  isActive: boolean;
}

interface FormSharePanelProps {
  submissionId: number;
  submissionStatus: string;
  canReset: boolean; // admin or owner
  onStatusChange?: () => void; // callback to refresh parent
}

export function FormSharePanel({
  submissionId,
  submissionStatus,
  canReset,
  onStatusChange,
}: FormSharePanelProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/job-forms/${submissionId}/share`);
      const body = await r.json() as { links?: ShareLink[]; error?: string };
      if (r.ok) setLinks(body.links ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [submissionId]);

  useEffect(() => {
    if (open) void fetchLinks();
  }, [open, fetchLinks]);

  const activeLink = links.find((l) => l.isActive && l.targetType === 'external_form');

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setNewToken(null);
    try {
      const r = await fetch(`/api/job-forms/${submissionId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'external_form', expiryDays: 30 }),
      });
      const body = await r.json() as { token?: string; error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Failed to create link');
      setNewToken(body.token ?? null);
      onStatusChange?.();
      await fetchLinks();
    } catch (e: unknown) {
      setError((e as Error).message);
    }
    setCreating(false);
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke this share link? The external user will no longer be able to access the form.')) return;
    setRevoking(true);
    setError(null);
    try {
      const r = await fetch(`/api/job-forms/${submissionId}/share`, { method: 'DELETE' });
      if (!r.ok) {
        const body = await r.json() as { error?: string };
        throw new Error(body.error ?? 'Failed to revoke');
      }
      setNewToken(null);
      onStatusChange?.();
      await fetchLinks();
    } catch (e: unknown) {
      setError((e as Error).message);
    }
    setRevoking(false);
  };

  const handleReset = async () => {
    if (!confirm('Reset this form? This will clear the submitted status and revoke the share link. The form can then be re-sent.')) return;
    setResetting(true);
    setError(null);
    try {
      const r = await fetch(`/api/job-forms/${submissionId}/reset`, { method: 'POST' });
      if (!r.ok) {
        const body = await r.json() as { error?: string };
        throw new Error(body.error ?? 'Failed to reset');
      }
      setNewToken(null);
      onStatusChange?.();
      await fetchLinks();
    } catch (e: unknown) {
      setError((e as Error).message);
    }
    setResetting(false);
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/external/form/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getExternalUrl = (token: string) =>
    `${window.location.origin}/external/form/${token}`;

  const isSubmitted = submissionStatus === 'submitted' || submissionStatus === 'locked';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary border border-slate-200 hover:border-primary/30 bg-white px-2.5 py-1.5 rounded-lg transition-colors"
        title="Share / manage external link"
      >
        <Share2 size={12} />
        Share
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl w-80 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700">External Form Link</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-600 hover:text-slate-800 text-xs"
            >
              ✕
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 size={12} className="animate-spin" />
              Loading…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={12} />
              {error}
            </div>
          )}

          {/* New token — show once */}
          {newToken && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-emerald-700">Link created — copy it now</p>
              <p className="text-xs text-emerald-600 break-all font-mono bg-white border border-emerald-200 rounded-lg px-2 py-1.5">
                {getExternalUrl(newToken)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copyLink(newToken)}
                  className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
                >
                  {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                  href={getExternalUrl(newToken)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                >
                  <ExternalLink size={11} />
                  Open
                </a>
              </div>
            </div>
          )}

          {/* Active link status */}
          {!newToken && activeLink && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-blue-600" />
                <p className="text-xs font-semibold text-blue-700">Active link</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-blue-600">
                <span className="flex items-center gap-1">
                  <Eye size={11} />
                  {activeLink.viewCount} view{activeLink.viewCount !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  Expires {new Date(activeLink.expiresAt).toLocaleDateString('en-AU')}
                </span>
              </div>
            </div>
          )}

          {/* No active link */}
          {!newToken && !activeLink && !loading && (
            <p className="text-xs text-slate-400">No active share link.</p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
            {/* Create / regenerate */}
            {!isSubmitted && (
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="flex items-center gap-1.5 text-xs bg-primary hover:bg-violet-700 text-white px-3 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 w-full justify-center"
              >
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Share2 size={11} />}
                {activeLink ? 'Regenerate Link' : 'Create Share Link'}
              </button>
            )}

            {/* Copy existing */}
            {activeLink && !newToken && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex flex-col gap-1.5">
                <p className="text-[11px] text-slate-500 font-medium">Active link — regenerate to get a new copyable URL</p>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 hover:bg-white px-3 py-1.5 rounded-lg font-medium transition-colors w-full justify-center"
                >
                  {creating ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  Regenerate to copy
                </button>
              </div>
            )}

            {/* Revoke */}
            {activeLink && (
              <button
                type="button"
                onClick={() => void handleRevoke()}
                disabled={revoking}
                className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 w-full justify-center"
              >
                {revoking ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                Revoke Link
              </button>
            )}

            {/* Reset form */}
            {isSubmitted && canReset && (
              <button
                type="button"
                onClick={() => void handleReset()}
                disabled={resetting}
                className="flex items-center gap-1.5 text-xs text-amber-700 border border-amber-200 hover:bg-amber-50 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 w-full justify-center"
              >
                {resetting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                Reset / Reopen Form
              </button>
            )}
          </div>

          <p className="text-xs text-slate-400">
            External users can complete this form without a portal login.
            Links expire after 30 days.
          </p>
        </div>
      )}
    </div>
  );
}
