import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ShieldAlert, RefreshCw, CheckCircle, LogOut, ShieldCheck,
  Mail, Phone, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff,
} from 'lucide-react';
import { signOut, useSession } from '@/lib/auth/auth-client';

export default function VerifyRequiredPage() {
  const { user } = useSession();
  const email = user?.email ?? '';

  // Resend email
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Change email
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [changeEmailPassword, setChangeEmailPassword] = useState('');
  const [showChangeEmailPw, setShowChangeEmailPw] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);

  // SMS
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const [phone, setPhone] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [verifyingSms, setVerifyingSms] = useState(false);
  const [smsVerified, setSmsVerified] = useState(false);

  // Owner bypass
  const [selfVerifying, setSelfVerifying] = useState(false);
  const [selfVerified, setSelfVerified] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if SMS is configured
  useEffect(() => {
    fetch('/api/auth/sms-configured')
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setSmsConfigured(d.configured))
      .catch(() => setSmsConfigured(false));
  }, []);

  function clearMessages() { setError(''); setSuccess(''); }

  async function handleResend() {
    if (resending || resent) return;
    clearMessages();
    setResending(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setError('Too many requests. Please wait a few minutes before trying again.');
        return;
      }
      setResent(true);
      setSuccess('Verification email resent! Check your inbox and spam folder.');
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    setChangingEmail(true);
    try {
      const res = await fetch('/api/auth/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newEmail, password: changeEmailPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setEmailChanged(true);
        setSuccess('Email updated! A verification link has been sent to your new address.');
        setShowChangeEmail(false);
      } else {
        setError(data.error ?? 'Failed to update email.');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setChangingEmail(false);
    }
  }

  async function handleSendSms(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    setSendingSms(true);
    try {
      const res = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setSmsSent(true);
        setSuccess('Verification code sent to your phone.');
      } else {
        setError(data.error ?? 'Failed to send SMS.');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSendingSms(false);
    }
  }

  async function handleVerifySms(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    setVerifyingSms(true);
    try {
      const res = await fetch('/api/auth/verify-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: smsCode }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setSmsVerified(true);
        setSuccess('Phone verified! Redirecting to dashboard…');
        setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
      } else {
        setError(data.error ?? 'Incorrect code.');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setVerifyingSms(false);
    }
  }

  async function handleSelfVerify() {
    if (selfVerifying || selfVerified) return;
    clearMessages();
    setSelfVerifying(true);
    try {
      const res = await fetch('/api/auth/self-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setSelfVerified(true);
        setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
      } else {
        setError(data.error ?? 'Self-verification failed. You may not have owner access.');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSelfVerifying(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = '/login';
  }

  return (
    <>
      <Helmet>
        <title>Verify Your Account — IWILLBUILD Portal</title>
        <meta name="description" content="Please verify your account to access IWILLBUILD Portal." />
        <link rel="canonical" href="https://iwillbuild.com/verify-required" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center px-4 py-8">
        {/* Blueprint grid */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(249,115,22,0.6) 1px, transparent 1px),
              linear-gradient(90deg, rgba(249,115,22,0.6) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-6">
            <img
              src="/airo-assets/images/logo/horizontal"
              alt="IWILLBUILD"
              className="h-10 w-auto object-contain mx-auto"
            />
          </div>

          <div className="bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-8 pt-8 pb-6 text-center border-b border-white/10">
              <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldAlert size={26} className="text-amber-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Account verification required</h1>
              <p className="text-white/50 text-sm leading-relaxed">
                Your account needs to be verified before you can access the portal.
              </p>
              {email && (
                <p className="text-white/70 text-sm font-medium mt-2 break-all">
                  A link was sent to <span className="text-primary">{email}</span>
                </p>
              )}
            </div>

            <div className="px-8 py-6 flex flex-col gap-3">
              {/* Global messages */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-400 text-sm">
                  <CheckCircle size={15} />
                  {success}
                </div>
              )}

              {/* 1. Resend email */}
              <button
                onClick={handleResend}
                disabled={resending || resent}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                <RefreshCw size={15} className={resending ? 'animate-spin' : ''} />
                {resent ? 'Email resent!' : resending ? 'Sending…' : 'Resend verification email'}
              </button>

              {/* Tips */}
              <div className="bg-white/5 rounded-xl p-4 text-left">
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Tips</p>
                <ul className="flex flex-col gap-1 text-white/35 text-xs">
                  <li>• Check your spam or junk folder</li>
                  <li>• The link expires after 24 hours</li>
                  <li>• After clicking the link, refresh this page</li>
                </ul>
              </div>

              {/* 2. Change email */}
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => { setShowChangeEmail(!showChangeEmail); clearMessages(); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Mail size={14} />
                    Change email address
                  </span>
                  {showChangeEmail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showChangeEmail && (
                  <form onSubmit={handleChangeEmail} className="px-4 pb-4 flex flex-col gap-3 border-t border-white/10 pt-3">
                    <p className="text-white/40 text-xs leading-relaxed">
                      Enter a new email address and confirm your password. A new verification link will be sent.
                    </p>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="new@email.com"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary transition-colors"
                    />
                    <div className="relative">
                      <input
                        type={showChangeEmailPw ? 'text' : 'password'}
                        value={changeEmailPassword}
                        onChange={(e) => setChangeEmailPassword(e.target.value)}
                        placeholder="Confirm password"
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 pr-9 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowChangeEmailPw(!showChangeEmailPw)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      >
                        {showChangeEmailPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={changingEmail}
                      className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                    >
                      {changingEmail ? 'Updating…' : 'Update email & resend'}
                    </button>
                  </form>
                )}
              </div>

              {/* 3. SMS verification (only if configured) */}
              {smsConfigured && (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => { setShowSms(!showSms); clearMessages(); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Phone size={14} />
                      Verify by SMS instead
                    </span>
                    {showSms ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showSms && (
                    <div className="px-4 pb-4 border-t border-white/10 pt-3">
                      {smsVerified ? (
                        <div className="flex items-center gap-2 text-green-400 text-sm">
                          <CheckCircle size={15} />
                          Verified! Redirecting…
                        </div>
                      ) : !smsSent ? (
                        <form onSubmit={handleSendSms} className="flex flex-col gap-3">
                          <p className="text-white/40 text-xs">Enter your mobile number to receive a 6-digit code.</p>
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+61 4XX XXX XXX"
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary transition-colors"
                          />
                          <button
                            type="submit"
                            disabled={sendingSms}
                            className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                          >
                            {sendingSms ? 'Sending…' : 'Send SMS code'}
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifySms} className="flex flex-col gap-3">
                          <p className="text-white/40 text-xs">Enter the 6-digit code sent to {phone}.</p>
                          <input
                            type="text"
                            value={smsCode}
                            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            maxLength={6}
                            required
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center tracking-widest placeholder:text-white/25 focus:outline-none focus:border-primary transition-colors"
                          />
                          <button
                            type="submit"
                            disabled={verifyingSms || smsCode.length < 6}
                            className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                          >
                            {verifyingSms ? 'Verifying…' : 'Verify code'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSmsSent(false); setSmsCode(''); }}
                            className="text-white/30 hover:text-white/50 text-xs text-center transition-colors"
                          >
                            Use a different number
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Contact admin / support */}
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Still stuck?</p>
                <div className="flex flex-col gap-2 text-xs text-white/40">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={12} />
                    <span>Contact your company admin to manually verify your account</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail size={12} />
                    <a href="mailto:support@iwillbuild.com" className="text-primary hover:text-orange-400 transition-colors">
                      Contact IWILLBUILD support
                    </a>
                  </div>
                </div>
              </div>

              {/* 5. Platform owner bypass */}
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-1">Platform Developer?</p>
                <p className="text-white/30 text-xs mb-3 leading-relaxed">
                  If you're the platform developer and can't receive email, you can bypass verification below.
                </p>
                {selfVerified ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                    <CheckCircle size={15} />
                    Verified! Redirecting to dashboard…
                  </div>
                ) : (
                  <button
                    onClick={handleSelfVerify}
                    disabled={selfVerifying}
                    className="flex items-center gap-2 text-xs font-bold text-primary hover:text-orange-400 disabled:opacity-50 transition-colors"
                  >
                    <ShieldCheck size={14} className={selfVerifying ? 'animate-pulse' : ''} />
                    {selfVerifying ? 'Verifying…' : 'Bypass email — I am the platform developer'}
                  </button>
                )}
              </div>

              <button
                onClick={handleSignOut}
                className="inline-flex items-center justify-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors pt-1"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
