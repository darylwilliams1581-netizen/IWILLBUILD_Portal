import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Lock, Mail, AlertCircle, Smartphone, KeyRound } from 'lucide-react';
import { signIn, useSession } from '@/lib/auth/auth-client';

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

  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useSession();

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
    navigate(from, { replace: true });
    return null;
  }

  // Check if this device has a trusted PIN for the entered email
  useEffect(() => {
    if (email.includes('@')) {
      const trusted = getTrustedDeviceForEmail(email);
      setHasTrustedDevice(!!trusted);
    } else {
      setHasTrustedDevice(false);
    }
  }, [email]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || 'Invalid email or password.');
        setLoading(false);
        return;
      }
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch {
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
          {hasTrustedDevice && (
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

          {/* Form */}
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
                  {error && (
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
