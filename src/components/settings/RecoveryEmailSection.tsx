/**
 * RecoveryEmailSection
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the user's protected recovery email address.
 *
 * Security UX:
 *  - Addresses always shown masked (a***@e***.com) — never plain
 *  - Changing requires current password + TOTP (when enrolled)
 *  - 7-day hold shown clearly; new address cannot be used until hold expires
 *  - Pending change shows cancel instructions (check old email)
 *  - Verification tokens never appear in the UI
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Mail, Clock, AlertTriangle, CheckCircle2,
  Loader2, Eye, EyeOff, X, RefreshCw,
} from 'lucide-react';

interface RecoveryState {
  hasActive:       boolean;
  maskedActive:    string | null;
  hasPending:      boolean;
  maskedPending:   string | null;
  pendingVerified: boolean;
  holdExpiresAt:   string | null;  // ISO string from JSON
  frozen:          boolean;
}

interface Props {
  twoFactorEnabled: boolean;
}

export default function RecoveryEmailSection({ twoFactorEnabled }: Props) {
  const [state,      setState]      = useState<RecoveryState | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);

  // Form fields
  const [newEmail,   setNewEmail]   = useState('');
  const [password,   setPassword]   = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [totpCode,   setTotpCode]   = useState('');
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/me/recovery-email');
      if (res.ok) setState(await res.json() as RecoveryState);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openForm() {
    setNewEmail(''); setPassword(''); setTotpCode('');
    setError(''); setSuccess('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setPassword(''); setTotpCode('');
    setError('');
  }

  async function submit() {
    setError('');
    if (!newEmail.trim()) { setError('Enter the new recovery email address.'); return; }
    if (!password.trim()) { setError('Enter your current password.'); return; }
    if (twoFactorEnabled && !totpCode.trim()) { setError('Enter your authenticator code.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/me/recovery-email/request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newEmail: newEmail.trim(), password, totpCode: totpCode.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setSuccess(data.message ?? 'Verification email sent. Check your new address.');
      setShowForm(false);
      setPassword(''); setTotpCode('');
      await load();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
        <Loader2 size={14} className="animate-spin" />Loading recovery email…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <Mail size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">Recovery email</p>
          <p className="text-xs text-slate-500 mt-0.5">
            A separate verified address used only for account recovery. Changing it requires your password{twoFactorEnabled ? ' and authenticator code' : ''} and takes effect after a 7-day security hold.
          </p>
        </div>
        <button
          onClick={load}
          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Frozen warning */}
      {state?.frozen && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>This account is frozen. Contact IWILLBUILD support to open a recovery case.</span>
        </div>
      )}

      {/* Active address */}
      {state?.hasActive ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
          <CheckCircle2 size={14} className="text-green-600 shrink-0" />
          <span className="text-xs text-green-800 font-medium">Active: <span className="font-mono">{state.maskedActive}</span></span>
        </div>
      ) : state?.hasPending ? (
        /* Pending change in progress — don't show the "not set" warning, the pending block below covers it */
        null
      ) : (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="text-amber-600 shrink-0" />
          <span className="text-xs text-amber-800">No recovery email set. Add one to protect your account.</span>
        </div>
      )}

      {/* Pending change */}
      {state?.hasPending && (
        <div className="flex flex-col gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-blue-600 shrink-0" />
            <span className="text-xs text-blue-800 font-semibold">Change pending</span>
          </div>
          <p className="text-xs text-blue-700">
            New address: <span className="font-mono">{state.maskedPending}</span>
            {state.pendingVerified ? ' — verified' : ' — awaiting verification (check new inbox)'}
          </p>
          {state.holdExpiresAt && (
            <p className="text-xs text-blue-600">
              Security hold expires: <span className="font-medium">{new Date(state.holdExpiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </p>
          )}
          <p className="text-xs text-blue-600 mt-0.5">
            If you did not request this, check your current recovery email for a <strong>Cancel change</strong> link.
          </p>
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-xs text-green-800">
          <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Change form */}
      {showForm && !state?.frozen ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">
              {state?.hasActive ? 'Change recovery email' : 'Set recovery email'}
            </p>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="shrink-0" />{error}
            </div>
          )}

          {/* New email */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              New recovery email
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="recovery@example.com"
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Current password
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your account password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* TOTP (when enrolled) */}
          {twoFactorEnabled && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          )}

          {/* Security notice */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <ShieldCheck size={12} className="shrink-0 mt-0.5" />
            <span>Both your current and new recovery addresses will receive emails. The change takes effect after a <strong>7-day security hold</strong>.</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={closeForm}
              className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void submit()}
              disabled={busy || !newEmail.trim() || !password.trim() || (twoFactorEnabled && !totpCode.trim())}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {busy ? <><Loader2 size={13} className="animate-spin" />Sending…</> : 'Send verification'}
            </button>
          </div>
        </div>
      ) : (
        !state?.frozen && (
          <button
            onClick={openForm}
            className="self-start flex items-center gap-2 border border-slate-200 hover:border-primary/40 hover:bg-violet-50 text-slate-700 hover:text-primary text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Mail size={14} />
            {state?.hasActive ? 'Change recovery email' : 'Set recovery email'}
          </button>
        )
      )}
    </div>
  );
}
