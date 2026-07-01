import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Lock, Mail, AlertCircle, Smartphone, KeyRound, MailWarning, RefreshCw, Users, CheckCircle2, ShieldCheck } from 'lucide-react';
import { signIn, useSession } from '@/lib/auth/auth-client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

// ── Safe auth logger ──────────────────────────────────────────────────────────
function authLog(event: string, data?: Record<string, unknown>) {
  try {
    console.info(JSON.stringify({ event: `auth.login.${event}`, ...data, ts: Date.now() }));
  } catch { /* best-effort */ }
}

// ── Device fingerprint (stable per browser) ──────────────────────────────────
function getDeviceFingerprint(): string {
  const key = 'iwb_device_fp';
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = `${navigator.userAgent}-${screen.width}x${screen.height}-${Intl.DateTimeFormat().resolvedOptions().timeZone}-${Date.now()}`;
    localStorage.setItem(key, fp);
  }
  return fp;
}

function getTrustedDeviceForEmail(email: string): { deviceId: string; deviceName: string } | null {
  try {
    const raw = localStorage.getItem(`iwb_trusted_${btoa(email)}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasTrustedDevice, setHasTrustedDevice] = useState(false);

  // 2FA challenge state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tfaToken, setTfaToken] = useState('');
  const [tfaLoading, setTfaLoading] = useState(false);

  // Unverified email state — shown instead of generic error
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useSession();

  // ── All hooks must be declared before any conditional return ──────────────

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      authLog('already_authenticated', { redirectTo: from });
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  // Check if this device has a trusted PIN for the entered email
  useEffect(() => {
    if (email.includes('@')) {
      const trusted = getTrustedDeviceForEmail(email);
      setHasTrustedDevice(!!trusted);
    } else {
      setHasTrustedDevice(false);
    }
  }, [email]);

  // Clear unverified state when the user changes their email
  useEffect(() => {
    if (unverified) {
      setUnverified(false);
      setResendState('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Don't render the form while redirecting
  if (isAuthenticated) return null;

  /** Returns true if an error message is about email verification */
  function isVerificationError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
      lower.includes('verif') ||
      lower.includes('not verified') ||
      lower.includes('confirm your email') ||
      lower.includes('email not confirmed')
    );
  }

  async function handleResendVerification() {
    if (!email.trim()) return;
    setResendState('sending');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok) {
        setResendState('sent');
      } else {
        setResendState('error');
      }
    } catch {
      setResendState('error');
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setUnverified(false);
    setResendState('idle');
    setLoading(true);
    authLog('submit', { route: '/login', emailDomain: email.split('@')[1] ?? 'unknown' });
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        const msg = result.error.message || '';
        authLog('error', { errorMsg: msg.slice(0, 120), status: result.error.status });
        if (isVerificationError(msg)) {
          setUnverified(true);
        } else {
          setError(msg || 'Invalid email or password.');
        }
        setLoading(false);
        return;
      }
      // Login succeeded — check if the user is unverified
      const userData = result.data?.user as { emailVerified?: boolean; id?: string } | undefined;
      authLog('success', { emailVerified: userData?.emailVerified, userId: userData?.id });
      if (userData && userData.emailVerified === false) {
        setUnverified(true);
        setLoading(false);
        return;
      }
      // Check if 2FA is required
      const tfaRes = await fetch('/api/me/2fa/status', { credentials: 'include' });
      const tfaData = await tfaRes.json() as { enabled?: boolean };
      if (tfaData.enabled) {
        setLoading(false);
        setNeeds2FA(true);
        return;
      }
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      authLog('redirect', { to: from });
      navigate(from, { replace: true });
    } catch (err) {
      authLog('exception', { errorMsg: String((err as Error)?.message ?? err).slice(0, 120) });
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !pin) {
      setError('Please enter your email and PIN.');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4–6 digits.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const deviceFingerprint = getDeviceFingerprint();
      const res = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin, deviceFingerprint }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; lockedUntil?: string };
      if (res.ok && data.ok) {
        // PIN verified — now do a normal sign-in flow
        // The user still needs to sign in with password once to get a session.
        // For now, show a message directing them to use password.
        // In a full implementation, the server would issue a session token directly.
        setError('PIN verified. Please sign in with your password to complete login.');
        setMode('password');
      } else {
        setError(data.error ?? 'Incorrect PIN.');
        if (data.error?.includes('Too many')) {
          setMode('password');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handle2FA(e: React.FormEvent) {
    e.preventDefault();
    if (tfaToken.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setError(''); setTfaLoading(true);
    try {
      const res = await fetch('/api/me/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: tfaToken }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) { setError(d.error ?? 'Invalid code. Please try again.'); return; }
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch { setError('Something went wrong. Please try again.'); }
    finally { setTfaLoading(false); }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0F1117]">
      <Helmet>
        <title>Sign In — IWILLBUILD Portal</title>
        <meta name="description" content="Sign in to the IWILLBUILD internal portal to manage jobs, crews, fleet, and more." />
        <link rel="canonical" href="https://iwillbuild.com/login" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Blueprint grid background */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(249,115,22,0.8) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249,115,22,0.8) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(249,115,22,0.07) 0%, transparent 70%)',
        }}
      />
      <div className="absolute top-0 left-0 w-64 h-64 border-r border-b border-white/5 rounded-br-[80px]" />
      <div className="absolute bottom-0 right-0 w-64 h-64 border-l border-t border-white/5 rounded-tl-[80px]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="bg-[#1A1D23] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-white/10">
            <div className="flex items-center justify-center mb-6">
              <img
                src="/airo-assets/images/logo/horizontal"
                alt="IWILLBUILD"
                className="h-10 w-auto object-contain"
              />
            </div>
            <h1 className="font-heading font-bold text-xl text-white text-center">
              Portal Sign In
            </h1>
            <p className="text-sm text-white/40 text-center mt-1">
              Internal access only
            </p>
          </div>

          {/* Mode tabs (only show PIN tab if trusted device exists) */}
          {hasTrustedDevice && !needs2FA && (
            <div className="flex border-b border-white/10">
              <button
                onClick={() => { setMode('password'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                  mode === 'password'
                    ? 'text-white border-b-2 border-primary bg-white/5'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                <Lock size={12} />
                Password
              </button>
              <button
                onClick={() => { setMode('pin'); setError(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                  mode === 'pin'
                    ? 'text-white border-b-2 border-primary bg-white/5'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                <KeyRound size={12} />
                PIN Login
              </button>
            </div>
          )}

          {/* 2FA Challenge */}
          {needs2FA && (
            <div className="px-8 py-8">
              <div className="flex flex-col items-center mb-6">
                <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center justify-center mb-3">
                  <ShieldCheck size={22} className="text-primary" />
                </div>
                <h2 className="text-white font-bold text-base">Two-Factor Authentication</h2>
                <p className="text-white/40 text-xs mt-1 text-center">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 mb-4">
                  <AlertCircle size={13} className="shrink-0" />{error}
                </div>
              )}

              <form onSubmit={handle2FA} className="flex flex-col items-center gap-5">
                <InputOTP
                  maxLength={6}
                  value={tfaToken}
                  onChange={setTfaToken}
                  autoFocus
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
                  type="submit"
                  disabled={tfaLoading || tfaToken.length !== 6}
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {tfaLoading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying…</>
                    : <><ShieldCheck size={15} />Verify Code</>
                  }
                </button>

                <button
                  type="button"
                  onClick={() => { setNeeds2FA(false); setTfaToken(''); setError(''); }}
                  className="text-xs text-white/30 hover:text-white/50 transition-colors"
                >
                  Back to login
                </button>
              </form>
            </div>
          )}

          {/* Form */}
          {!needs2FA && (
          <AnimatePresence mode="wait">
            {mode === 'password' ? (
              <motion.form
                key="password"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handlePasswordSubmit}
                className="px-8 py-6"
              >
                <div className="flex flex-col gap-4">
                  {/* Unverified email panel — shown instead of generic error */}
                  {unverified && (
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-4 flex flex-col gap-3">
                      {/* Header */}
                      <div className="flex items-start gap-2.5">
                        <MailWarning size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-amber-300 leading-snug">
                            Your email is not verified yet.
                          </p>
                          <p className="text-xs text-amber-400/70 mt-0.5 leading-relaxed">
                            Check your inbox for a verification link, or use the options below.
                          </p>
                        </div>
                      </div>

                      {/* Resend button */}
                      <button
                        type="button"
                        onClick={() => void handleResendVerification()}
                        disabled={resendState === 'sending' || resendState === 'sent'}
                        className="flex items-center justify-center gap-2 w-full bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-60 border border-amber-500/30 text-amber-300 text-xs font-semibold py-2 rounded-lg transition-colors"
                      >
                        {resendState === 'sending' ? (
                          <>
                            <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                            Sending…
                          </>
                        ) : resendState === 'sent' ? (
                          <>
                            <CheckCircle2 size={13} />
                            Verification email sent — check your inbox
                          </>
                        ) : (
                          <>
                            <RefreshCw size={13} />
                            Resend verification email
                          </>
                        )}
                      </button>
                      {resendState === 'error' && (
                        <p className="text-xs text-red-400 text-center -mt-1">
                          Failed to send. Please try again shortly.
                        </p>
                      )}

                      {/* Contact admin */}
                      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
                        <Users size={13} className="text-white/40 shrink-0" />
                        <p className="text-xs text-white/50 leading-relaxed">
                          <span className="text-white/70 font-medium">Can&apos;t receive the email?</span>{' '}
                          Contact your company admin or owner — they can verify your account manually from the portal.
                        </p>
                      </div>

                      {/* Fallback note */}
                      <p className="text-[11px] text-white/30 leading-relaxed text-center">
                        If your workplace blocks verification emails, your company owner can manually verify your account.
                      </p>
                    </div>
                  )}

                  {/* Generic error (non-verification) */}
                  {error && !unverified && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                      <AlertCircle size={14} className="shrink-0" />
                      {error}
                    </div>
                  )}

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@iwillbuild.com.au"
                        autoComplete="email"
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">
                        Password
                      </label>
                      <Link
                        to="/forgot-password"
                        className="text-xs text-white/35 hover:text-primary transition-colors"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-md transition-colors mt-1"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in…
                      </span>
                    ) : (
                      <>
                        Sign In
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>

                  {/* Resend verification link */}
                  <p className="text-center text-xs text-white/30">
                    Didn't receive a verification email?{' '}
                    <Link to="/verify-required" className="text-primary hover:text-orange-400 font-medium transition-colors">
                      Resend it
                    </Link>
                  </p>

                  <p className="text-center text-xs text-white/35 mt-1">
                    Don&apos;t have an account?{' '}
                    <Link to="/signup" className="text-primary hover:text-orange-400 font-medium transition-colors">
                      Create one
                    </Link>
                  </p>
                  <p className="text-center text-xs text-white/25 mt-1">
                    <Link to="/login-help" className="hover:text-white/50 transition-colors">
                      Having trouble logging in?
                    </Link>
                  </p>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="pin"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handlePinSubmit}
                className="px-8 py-6"
              >
                <div className="flex flex-col gap-4">
                  {error && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                      <AlertCircle size={14} className="shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                    <Smartphone size={16} className="text-primary shrink-0" />
                    <p className="text-xs text-white/50 leading-relaxed">
                      PIN login is available because this device is trusted. After 5 failed attempts, you'll need to use your password.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@iwillbuild.com.au"
                        autoComplete="email"
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                      PIN
                    </label>
                    <div className="relative">
                      <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="••••••"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors tracking-widest"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-md transition-colors mt-1"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Verifying…
                      </span>
                    ) : (
                      <>
                        Sign In with PIN
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
          )} {/* end !needs2FA */}

          {/* Footer */}
          <div className="px-8 py-4 bg-black/20 border-t border-white/5 text-center">
            <p className="text-xs text-white/25">
              IWILLBUILD Pty Ltd &mdash; Authorised personnel only
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/"
            className="text-xs text-white/30 hover:text-primary transition-colors"
          >
            &larr; Back to home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
