/**
 * SecurityTab — TOTP-based two-factor authentication management.
 * Lives inside Settings → Security.
 */
import { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldOff, Smartphone, KeyRound,
  Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Copy, Check,
} from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

type Phase = 'loading' | 'disabled' | 'setup' | 'verify' | 'enabled' | 'disabling';

export default function SecurityTab() {
  const [phase, setPhase]         = useState<Phase>('loading');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret]       = useState('');
  const [token, setToken]         = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [busy, setBusy]           = useState(false);
  const [copied, setCopied]       = useState(false);

  // Load current 2FA status
  useEffect(() => {
    fetch('/api/me/2fa/status', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { enabled?: boolean }) => setPhase(d.enabled ? 'enabled' : 'disabled'))
      .catch(() => setPhase('disabled'));
  }, []);

  async function startSetup() {
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/me/2fa/setup', { credentials: 'include' });
      const d = await res.json() as { qrDataUrl?: string; secret?: string; alreadyEnabled?: boolean; error?: string };
      if (!res.ok || d.error) { setError(d.error ?? 'Setup failed.'); return; }
      if (d.alreadyEnabled) { setPhase('enabled'); return; }
      setQrDataUrl(d.qrDataUrl ?? '');
      setSecret(d.secret ?? '');
      setPhase('setup');
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  async function verifyEnable() {
    if (token.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/me/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) { setError(d.error ?? 'Invalid code.'); return; }
      setSuccess('Two-factor authentication is now active.');
      setToken('');
      setPhase('enabled');
      setTimeout(() => setSuccess(''), 5000);
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  async function disable() {
    if (!disablePw) { setError('Enter your current password to disable 2FA.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/me/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: disablePw, token: disableToken || undefined }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) { setError(d.error ?? 'Failed to disable 2FA.'); return; }
      setSuccess('Two-factor authentication has been disabled.');
      setDisablePw(''); setDisableToken('');
      setPhase('disabled');
      setTimeout(() => setSuccess(''), 5000);
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading security settings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-1 flex items-center gap-2">
          <ShieldCheck size={16} className="text-slate-400" />
          Two-Factor Authentication
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Add an extra layer of security to your account. When enabled, you'll need your authenticator app each time you log in.
        </p>

        {/* Status banner */}
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-5 border ${
          phase === 'enabled'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          {phase === 'enabled'
            ? <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
            : <ShieldOff size={18} className="text-slate-400 shrink-0" />
          }
          <div>
            <p className="text-sm font-bold">
              {phase === 'enabled' ? '2FA is enabled' : '2FA is not enabled'}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              {phase === 'enabled'
                ? 'Your account is protected with an authenticator app.'
                : 'Your account is protected by password only.'}
            </p>
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle size={13} className="shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 mb-4 font-semibold">
            <CheckCircle2 size={13} className="shrink-0" />{success}
          </div>
        )}

        {/* ── DISABLED: prompt to set up ── */}
        {phase === 'disabled' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-center shrink-0">
                <Smartphone size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 mb-1">Use an authenticator app</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Works with Google Authenticator, Authy, Microsoft Authenticator, or any TOTP-compatible app.
                  After setup you'll scan a QR code and enter a 6-digit code to confirm.
                </p>
              </div>
            </div>
            <button
              onClick={startSetup}
              disabled={busy}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Set Up Two-Factor Authentication
            </button>
          </div>
        )}

        {/* ── SETUP: show QR code ── */}
        {phase === 'setup' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1">Step 1 — Scan this QR code</p>
              <p className="text-xs text-slate-500 mb-4">
                Open your authenticator app and scan the QR code below, or enter the setup key manually.
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-6">
                {qrDataUrl && (
                  <div className="border-2 border-slate-200 rounded-xl p-2 bg-white shrink-0">
                    <img src={qrDataUrl} alt="2FA QR Code" className="w-40 h-40" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Manual setup key</p>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <code className="text-xs font-mono text-slate-700 break-all flex-1 select-all">{secret}</code>
                    <button
                      onClick={copySecret}
                      className="shrink-0 text-slate-400 hover:text-primary transition-colors"
                      title="Copy key"
                    >
                      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    Enter this key in your app if you can't scan the QR code. Keep it safe — it's your backup.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-bold text-slate-800 mb-1">Step 2 — Enter the 6-digit code</p>
              <p className="text-xs text-slate-500 mb-4">
                Enter the code shown in your authenticator app to confirm setup.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <InputOTP
                  maxLength={6}
                  value={token}
                  onChange={setToken}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <button
                  onClick={verifyEnable}
                  disabled={busy || token.length !== 6}
                  className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Verify &amp; Enable
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <button
                onClick={() => { setPhase('disabled'); setError(''); setToken(''); }}
                className="text-xs text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel setup
              </button>
            </div>
          </div>
        )}

        {/* ── ENABLED: show status + disable option ── */}
        {phase === 'enabled' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800 font-semibold">
                Authenticator app connected. You'll be asked for a code at each login.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                <ShieldOff size={14} className="text-red-400" />
                Disable Two-Factor Authentication
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Enter your password and an authenticator code to turn off 2FA.
              </p>

              <div className="flex flex-col gap-3 max-w-sm">
                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={disablePw}
                      onChange={e => setDisablePw(e.target.value)}
                      placeholder="Your account password"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* TOTP code */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Authenticator Code
                  </label>
                  <InputOTP
                    maxLength={6}
                    value={disableToken}
                    onChange={setDisableToken}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <button
                  onClick={disable}
                  disabled={busy || !disablePw}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 w-fit"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                  Disable 2FA
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
          <KeyRound size={12} />
          Recommended authenticator apps
        </p>
        <ul className="text-xs text-slate-500 flex flex-col gap-1">
          <li>• <strong>Google Authenticator</strong> — iOS &amp; Android</li>
          <li>• <strong>Authy</strong> — iOS, Android &amp; Desktop (supports backup)</li>
          <li>• <strong>Microsoft Authenticator</strong> — iOS &amp; Android</li>
          <li>• <strong>1Password / Bitwarden</strong> — built-in TOTP support</li>
        </ul>
      </div>
    </div>
  );
}
