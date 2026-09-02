import { useEffect, useState, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from "react-router";
type Status = 'verifying' | 'success' | 'error' | 'invalid';
const REDIRECT_DELAY = 4; // seconds

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const uid = searchParams.get('uid') ?? '';
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token,
            uid
          })
        });
        if (cancelled) return;
        if (res.ok) {
          setStatus('success');
          // Start countdown then redirect to login with verified flag
          let secs = REDIRECT_DELAY;
          countdownRef.current = setInterval(() => {
            secs -= 1;
            setCountdown(secs);
            if (secs <= 0) {
              clearInterval(countdownRef.current!);
              navigate('/login?verified=1');
            }
          }, 1000);
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.error ?? 'Verification failed.');
          setStatus('error');
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Network error. Please check your connection and try again.');
          setStatus('error');
        }
      }
    }
    verify();
    return () => {
      cancelled = true;
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [token, uid, navigate]);
  return <>
      <Helmet>
        <title>Verify Email — IWIIlBUILD Portal</title>
        <meta name="description" content="Verify your email address to activate your IWIIlBUILD Portal account." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://iwillbuild.com/verify-email" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center px-4">
        {/* Blueprint grid */}
        <div className="fixed inset-0 pointer-events-none opacity-[0.04]" style={{
        backgroundImage: `
              linear-gradient(rgba(249,115,22,0.6) 1px, transparent 1px),
              linear-gradient(90deg, rgba(249,115,22,0.6) 1px, transparent 1px)
            `,
        backgroundSize: '40px 40px'
      }} />

        <div className="relative w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">IW</span>
              </div>
              <span className="text-white font-bold text-lg tracking-tight">IWIIlBUILD</span>
            </div>
          </div>

          <div className="bg-[#1A1D27] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
            {/* Verifying */}
            {status === 'verifying' && <>
                <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Loader2 size={28} className="text-primary animate-spin" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Verifying your email…</h1>
                <p className="text-white/50 text-sm">Just a moment while we confirm your address.</p>
              </>}

            {/* Success */}
            {status === 'success' && <>
                <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <CheckCircle size={28} className="text-green-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Email verified!</h1>
                <p className="text-white/60 text-sm leading-relaxed mb-2">
                  Your account is now active. Taking you to sign in…
                </p>
                {/* Countdown bar */}
                <div className="w-full bg-white/10 rounded-full h-1.5 mb-6 overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full transition-all duration-1000 ease-linear" style={{
                width: `${(REDIRECT_DELAY - countdown) / REDIRECT_DELAY * 100}%`
              }} />
                </div>
                <p className="text-white/30 text-xs mb-6">
                  Redirecting in {countdown}s…
                </p>
                <Link to="/login?verified=1" className="inline-flex items-center gap-2 bg-primary hover:bg-violet-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors">
                  Sign in now
                  <ArrowRight size={16} />
                </Link>
              </>}

            {/* Invalid link (no token/uid params) */}
            {status === 'invalid' && <>
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <XCircle size={28} className="text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">Invalid link</h1>
                <p className="text-white/60 text-sm leading-relaxed mb-8">
                  This verification link is missing required information. Please use the link from your email exactly as sent.
                </p>
                <Link to="/check-email" className="inline-flex items-center gap-2 bg-primary hover:bg-violet-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors">
                  Resend verification email
                </Link>
              </>}

            {/* Error (expired / already used / server error) */}
            {status === 'error' && <>
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
                  <Link to="/check-email" className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-violet-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors">
                    Request a new link
                  </Link>
                  <Link to="/login" className="text-white/40 hover:text-white/70 text-sm transition-colors">
                    Back to login
                  </Link>
                </div>
              </>}
          </div>
        </div>
      </div>
    </>;
}
