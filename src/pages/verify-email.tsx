import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

type Status = 'verifying' | 'success' | 'error' | 'invalid';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const uid = searchParams.get('uid') ?? '';

  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token || !uid) {
      setStatus('invalid');
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, uid }),
        });
        if (cancelled) return;

        if (res.ok) {
          setStatus('success');
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.error ?? 'Verification failed.');
          setStatus(data.code === 'invalid_or_expired' ? 'error' : 'error');
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Network error. Please check your connection and try again.');
          setStatus('error');
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, [token, uid]);

  return (
    <>
      <Helmet>
        <title>Verify Email — IWILLBUILD Portal</title>
        <meta name="description" content="Verify your email address to activate your IWILLBUILD Portal account." />
        <link rel="canonical" href="https://iwillbuild.com/verify-email" />
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
            {/* Verifying */}
            {status === 'verifying' && (
              <>
                <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Loader2 size={28} className="text-primary animate-spin" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Verifying your email…</h1>
                <p className="text-white/50 text-sm">Just a moment while we confirm your address.</p>
              </>
            )}

            {/* Success */}
            {status === 'success' && (
              <>
                <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <CheckCircle size={28} className="text-green-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Email verified!</h1>
                <p className="text-white/60 text-sm leading-relaxed mb-8">
                  Your account is now active. You can sign in and start using IWILLBUILD Portal.
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
                >
                  Sign in to your account
                  <ArrowRight size={16} />
                </Link>
              </>
            )}

            {/* Invalid link (no token/uid params) */}
            {status === 'invalid' && (
              <>
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <XCircle size={28} className="text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Invalid link</h1>
                <p className="text-white/60 text-sm leading-relaxed mb-8">
                  This verification link is missing required information. Please use the link from your email exactly as sent.
                </p>
                <Link
                  to="/check-email"
                  className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
                >
                  Resend verification email
                </Link>
              </>
            )}

            {/* Error (expired / already used / server error) */}
            {status === 'error' && (
              <>
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <XCircle size={28} className="text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Verification failed</h1>
                <p className="text-white/60 text-sm leading-relaxed mb-2">
                  {errorMsg || 'This link is invalid or has expired.'}
                </p>
                <p className="text-white/40 text-xs mb-8">
                  Verification links expire after 24 hours and can only be used once.
                </p>
                <div className="flex flex-col gap-3">
                  <Link
                    to="/check-email"
                    className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors"
                  >
                    Request a new link
                  </Link>
                  <Link
                    to="/login"
                    className="text-white/40 hover:text-white/70 text-sm transition-colors"
                  >
                    Back to login
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
