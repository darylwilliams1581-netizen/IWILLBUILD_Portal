/**
 * SecurityTab — Two-factor authentication management.
 * Supports both TOTP (authenticator app) and SMS 2FA.
 * Only one method can be active at a time.
 */
import { useState, useEffect } from 'react';
import {
  ShieldCheck, ShieldOff, Smartphone, MessageSquare,
  Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Copy, Check, RefreshCw,
} from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

type Method = 'totp' | 'sms' | null;
type Phase =
  | 'loading'
  | 'disabled'
  // TOTP phases
  | 'totp-setup'
  | 'totp-verify'
  | 'totp-enabled'
  | 'totp-disabling'
  // SMS phases
  | 'sms-enter-phone'
  | 'sms-verify-setup'
  | 'sms-enabled'
  | 'sms-disabling';

export default function SecurityTab() {
  const [phase, setPhase]         = useState<Phase>('loading');
  const [activeMethod, setActiveMethod] = useState<Method>(null);
  const [maskedPhone, setMaskedPhone] = useState('');

  // TOTP state
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret]       = useState('');
  const [token, setToken]         = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [copied, setCopied]       = useState(false);

  // SMS state
  const [smsPhone, setSmsPhone]   = useState('');
  const [smsCode, setSmsCode]     = useState('');
  const [smsSendState, setSmsSendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Shared
  const [disablePw, setDisablePw] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [busy, setBusy]           = useState(false);

  // Load current 2FA status
  useEffect(() => {
    fetch('/api/me/2fa/status', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { enabled?: boolean; method?: Method; maskedPhone?: string }) => {
        setActiveMethod(d.method ?? null);
        if (d.maskedPhone) setMaskedPhone(d.maskedPhone);
        if (!d.enabled) {
          setPhase('disabled');
        } else if (d.method === 'sms') {
          setPhase('sms-enabled');
        } else {
          setPhase('totp-enabled');
        }
      })
      .catch(() => setPhase('disabled'));
  }, []);

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 5000);
  }

  // ── TOTP ──────────────────────────────────────────────────────────────────

  async function startTotpSetup() {
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/me/2fa/setup', { credentials: 'include' });
      const d = await res.json() as { qrDataUrl?: string; secret?: string; alreadyEnabled?: boolean; error?: string };
      if (!res.ok || d.error) { setError(d.error ?? 'Setup failed.'); return; }
      if (d.alreadyEnabled) { setPhase('totp-enabled'); return; }
      setQrDataUrl(d.qrDataUrl ?? '');
      setSecret(d.secret ?? '');
      setPhase('totp-setup');
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  async function verifyTotpEnable() {
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
      setToken('');
      setActiveMethod('totp');
      setPhase('totp-enabled');
      showSuccess('Authenticator app 2FA is now active.');
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  async function disableTotp() {
    if (!disablePw) { setError('Enter your current password.'); return; }
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
      setDisablePw(''); setDisableToken('');
      setActiveMethod(null);
      setPhase('disabled');
      showSuccess('Two-factor authentication has been disabled.');
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── SMS ───────────────────────────────────────────────────────────────────

  async function sendSmsSetupCode() {
    if (!smsPhone.trim()) { setError('Enter your mobile number.'); return; }
    setError(''); setSmsSendState('sending');
    try {
      const res = await fetch('/api/me/2fa/sms/send-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: smsPhone.trim() }),
      });
      const d = await res.json() as { ok?: boolean; maskedPhone?: string; error?: string };
      if (!res.ok || !d.ok) { setError(d.error ?? 'Failed to send code.'); setSmsSendState('idle'); return; }
      if (d.maskedPhone) setMaskedPhone(d.maskedPhone);
      setSmsSendState('sent');
      setPhase('sms-verify-setup');
    } catch { setError('Network error. Please try again.'); setSmsSendState('idle'); }
  }

  async function verifySmsEnable() {
    if (smsCode.length !== 6) { setError('Enter the 6-digit code we sent you.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/me/2fa/sms/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: smsPhone.trim(), code: smsCode }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) { setError(d.error ?? 'Invalid code.'); return; }
      setSmsCode('');
      setActiveMethod('sms');
      setPhase('sms-enabled');
      showSuccess('SMS 2FA is now active. You\'ll receive a code by text at each login.');
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  async function disableSms() {
    if (!disablePw) { setError('Enter your current password.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/me/2fa/sms/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: disablePw }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) { setError(d.error ?? 'Failed to disable SMS 2FA.'); return; }
      setDisablePw('');
      setActiveMethod(null);
      setMaskedPhone('');
      setPhase('disabled');
      showSuccess('SMS 2FA has been disabled.');
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading security settings…</span>
      </div>
    );
  }

  const isEnabled = activeMethod !== null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-bold text-base text-slate-800 mb-1 flex items-center gap-2">
          <ShieldCheck size={16} className="text-slate-400" />
          Two-Factor Authentication
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Add an extra layer of security. Choose between an authenticator app (TOTP) or SMS text message.
        </p>

        {/* Status banner */}
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-5 border ${
          isEnabled
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          {isEnabled
            ? <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
            : <ShieldOff size={18} className="text-slate-400 shrink-0" />
          }
          <div>
            <p className="text-sm font-bold">
              {isEnabled
                ? activeMethod === 'sms' ? '2FA active — SMS' : '2FA active — Authenticator app'
                : '2FA is not enabled'}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              {isEnabled
                ? activeMethod === 'sms'
                  ? `Codes sent to ${maskedPhone || 'your phone'} at each login.`
                  : 'Your account is protected with an authenticator app.'
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

        {/* ── DISABLED: choose method ── */}
        {phase === 'disabled' && (
          <div className="flex flex-col gap-3">
            {/* TOTP option */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-center shrink-0">
                  <Smartphone size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Authenticator app</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Works with Google Authenticator, Authy, Microsoft Authenticator, or any TOTP app.
                    Generates codes offline — no phone signal needed.
                  </p>
                </div>
              </div>
              <button
                onClick={startTotpSetup}
                disabled={busy}
                className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Set up authenticator app
              </button>
            </div>

            {/* SMS option */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center shrink-0">
                  <MessageSquare size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">SMS text message</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Receive a 6-digit code by text message each time you log in.
                    Requires mobile signal at login time.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setError(''); setPhase('sms-enter-phone'); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors"
              >
                <MessageSquare size={14} />
                Set up SMS 2FA
              </button>
            </div>
          </div>
        )}

        {/* ── TOTP SETUP: show QR code ── */}
        {phase === 'totp-setup' && (
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
                    <button onClick={copySecret} className="shrink-0 text-slate-400 hover:text-primary transition-colors" title="Copy key">
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
              <p className="text-xs text-slate-500 mb-4">Enter the code shown in your authenticator app to confirm setup.</p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <InputOTP maxLength={6} value={token} onChange={setToken}>
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
                <button
                  onClick={verifyTotpEnable}
                  disabled={busy || token.length !== 6}
                  className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Verify &amp; Enable
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <button onClick={() => { setPhase('disabled'); setError(''); setToken(''); }} className="text-xs text-slate-600 hover:text-slate-800 transition-colors">
                Cancel setup
              </button>
            </div>
          </div>
        )}

        {/* ── TOTP ENABLED ── */}
        {phase === 'totp-enabled' && (
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
              <p className="text-xs text-slate-500 mb-4">Enter your password and an authenticator code to turn off 2FA.</p>

              <div className="flex flex-col gap-3 max-w-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={disablePw}
                      onChange={e => setDisablePw(e.target.value)}
                      placeholder="Your account password"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800" tabIndex={-1}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Authenticator Code</label>
                  <InputOTP maxLength={6} value={disableToken} onChange={setDisableToken}>
                    <InputOTPGroup>
                      {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <button
                  onClick={disableTotp}
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

        {/* ── SMS: enter phone ── */}
        {phase === 'sms-enter-phone' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1">Enter your mobile number</p>
              <p className="text-xs text-slate-500 mb-4">
                We'll send a verification code to confirm your number before enabling SMS 2FA.
                Australian (04xx) and New Zealand (02x) numbers are supported.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-sm">
                <input
                  type="tel"
                  value={smsPhone}
                  onChange={e => setSmsPhone(e.target.value)}
                  placeholder="+61 400 000 000"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  autoFocus
                />
                <button
                  onClick={sendSmsSetupCode}
                  disabled={smsSendState === 'sending' || !smsPhone.trim()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {smsSendState === 'sending'
                    ? <><Loader2 size={14} className="animate-spin" />Sending…</>
                    : <><MessageSquare size={14} />Send code</>
                  }
                </button>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <button onClick={() => { setPhase('disabled'); setError(''); setSmsPhone(''); }} className="text-xs text-slate-600 hover:text-slate-800 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── SMS: verify setup code ── */}
        {phase === 'sms-verify-setup' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1">Enter the code we sent you</p>
              <p className="text-xs text-slate-500 mb-4">
                We sent a 6-digit code to {maskedPhone || smsPhone}. Enter it below to confirm your number.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <InputOTP maxLength={6} value={smsCode} onChange={setSmsCode} autoFocus>
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
                <button
                  onClick={verifySmsEnable}
                  disabled={busy || smsCode.length !== 6}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Verify &amp; Enable
                </button>
              </div>
              <button
                onClick={sendSmsSetupCode}
                disabled={smsSendState === 'sending'}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mt-3 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} />
                {smsSendState === 'sending' ? 'Sending…' : 'Resend code'}
              </button>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <button onClick={() => { setPhase('sms-enter-phone'); setError(''); setSmsCode(''); }} className="text-xs text-slate-600 hover:text-slate-800 transition-colors">
                ← Change number
              </button>
            </div>
          </div>
        )}

        {/* ── SMS ENABLED ── */}
        {phase === 'sms-enabled' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
              <p className="text-sm text-blue-800 font-semibold">
                SMS 2FA active — codes sent to {maskedPhone || 'your phone'} at each login.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
                <ShieldOff size={14} className="text-red-400" />
                Disable SMS 2FA
              </p>
              <p className="text-xs text-slate-500 mb-4">Enter your password to turn off SMS 2FA.</p>

              <div className="flex flex-col gap-3 max-w-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={disablePw}
                      onChange={e => setDisablePw(e.target.value)}
                      placeholder="Your account password"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800" tabIndex={-1}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={disableSms}
                  disabled={busy || !disablePw}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 w-fit"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                  Disable SMS 2FA
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
