import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ShieldAlert, RefreshCw, CheckCircle, LogOut, ShieldCheck } from 'lucide-react';
import { signOut } from '@/lib/auth/auth-client';
import { useSession } from '@/lib/auth/auth-client';

export default function VerifyRequiredPage() {
  const { user } = useSession();
  const email = user?.email ?? '';

  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [selfVerifying, setSelfVerifying] = useState(false);
  const [selfVerified, setSelfVerified] = useState(false);

  async function handleSelfVerify() {
    if (selfVerifying || selfVerified) return;
    setSelfVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/auth/self-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setSelfVerified(true);
        // Reload after short delay so session refreshes
        setTimeout(() => window.location.href = '/dashboard', 1500);
      } else {
        setError(data.error ?? 'Self-verification failed. You may not have owner access.');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setSelfVerifying(false);
    }
  }

  async function handleResend() {
    if (resending || resent) return;
    setResending(true);
    setError('');
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
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = '/login';
  }

  return (
    <>
      <Helmet>
        <title>Verify Your Email — IWILLBUILD Portal</title>
        <meta name="description" content="Please verify your email address to access IWILLBUILD Portal." />
        <link rel="canonical" href="https://iwillbuild.com/verify-required" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center px-4">
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
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">IW</span>
              </div>
              <span className="text-white font-bold text-lg tracking-tight">IWILLBUILD</span>
            </div>
          </div>

          <div className="bg-[#1A1D27] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
            {/* Icon */}
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert size={28} className="text-amber-400" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-3">Email verification required</h1>
            <p className="text-white/60 text-sm leading-relaxed mb-2">
              You need to verify your email address before accessing the portal.
            </p>
            {email && (
              <p className="text-white/80 text-sm font-medium mb-6 break-all">
                A verification link was sent to <span className="text-primary">{email}</span>
              </p>
            )}

            {/* Resend */}
            {resent ? (
              <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-medium mb-6 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <CheckCircle size={16} />
                Verification email resent! Check your inbox.
              </div>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors mb-4"
              >
                <RefreshCw size={15} className={resending ? 'animate-spin' : ''} />
                {resending ? 'Sending…' : 'Resend verification email'}
              </button>
            )}

            {error && (
              <p className="text-red-400 text-xs mb-4">{error}</p>
            )}

            {/* Tips */}
            <div className="bg-white/5 rounded-xl p-4 text-left mb-6">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Tips</p>
              <ul className="space-y-1.5 text-white/40 text-xs">
                <li>• Check your spam or junk folder</li>
                <li>• The link expires after 24 hours</li>
                <li>• After clicking the link, refresh this page</li>
              </ul>
            </div>

            {/* Owner emergency bypass */}
            <div className="border border-white/10 rounded-xl p-4 mb-6 text-left">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">Platform Owner?</p>
              <p className="text-white/35 text-xs mb-3 leading-relaxed">
                If you're the platform owner and can't receive email (e.g. blocked by your organisation), you can bypass verification below.
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
                  {selfVerifying ? 'Verifying…' : 'Bypass email — I am the platform owner'}
                </button>
              )}
            </div>

            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
