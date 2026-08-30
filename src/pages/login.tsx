import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate, useLocation } from "react-router";
import { Eye, EyeOff, ArrowRight, Lock, Mail, AlertCircle, Smartphone, KeyRound, MailWarning, RefreshCw, Users, CheckCircle2, ShieldCheck, ExternalLink, MessageSquare } from 'lucide-react';
import { useSession, authClient, signIn, consumeTwoFactorRedirect } from '@/lib/auth/auth-client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import ForcedPasswordChangeModal from '@/components/auth/ForcedPasswordChangeModal';

import { isNativeApp, WEB_PORTAL_URL, openExternalUrl } from '@/lib/native-routing';

// ── Safe auth logger ──────────────────────────────────────────────────────────
function authLog(event: string, data?: Record<string, unknown>) {
  try {
    console.info(JSON.stringify({
      event: `auth.login.${event}`,
      ...data,
      ts: Date.now()
    }));
  } catch {/* best-effort */}
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
function getTrustedDeviceForEmail(email: string): {
  deviceId: string;
  deviceName: string;
} | null {
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
  // In-memory challenge token for SMS 2FA login flow (never persisted to storage)
  const smsChallengeTokenRef = useRef<string | null>(null);
  const [tfa2Method, setTfa2Method] = useState<'totp' | 'sms' | null>(null);
  const [tfaToken, setTfaToken] = useState('');
  const [tfaLoading, setTfaLoading] = useState(false);
  const [smsMaskedPhone, setSmsMaskedPhone] = useState('');
  const [smsResendState, setSmsResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  // Backup-code mode — separate input so the user can switch without clearing the TOTP field
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCodeInput, setBackupCodeInput] = useState('');

  // Unverified email state — shown instead of generic error
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Forced password change state
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Just-verified banner — shown when redirected from email verification
  const [justVerified, setJustVerified] = useState(false);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    isPending
  } = useSession();

  // ── All hooks must be declared before any conditional return ──────────────

  // Detect ?verified=1 and ?reason=expired query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('verified') === '1') {
      setJustVerified(true);
      navigate('/login', {
        replace: true
      });
    }
    if (params.get('reason') === 'expired') {
      setSessionExpiredNotice(true);
      // Keep ?from= in the URL so post-login redirect works — only strip ?reason=
      const newParams = new URLSearchParams(location.search);
      newParams.delete('reason');
      const newSearch = newParams.toString();
      navigate(newSearch ? `/login?${newSearch}` : '/login', {
        replace: true
      });
    }
  }, [location.search, navigate]);

  // ── All hooks must be declared before any conditional return ──────────────

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const params = new URLSearchParams(location.search);
      const fromParam = params.get('from');
      const rawFrom = (location.state as {
        from?: {
          pathname: string;
        };
      })?.from?.pathname || (fromParam ? decodeURIComponent(fromParam) : null) || '/home';
      const SAFE_BLOCKLIST = ['/login', '/signup', '/verify', '/forgot', '/reset', '/check-email'];
      // Native app always lands on /home — never the public landing page
      const from = isNativeApp ? '/home' : rawFrom.startsWith('/') && !SAFE_BLOCKLIST.some(b => rawFrom.startsWith(b)) ? rawFrom : '/home';
      authLog('already_authenticated', {
        redirectTo: from
      });
      navigate(from, {
        replace: true
      });
    }
  }, [isAuthenticated, navigate, location.state, location.search]);

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

  // Don't render the form while session is loading or while redirecting
  if (isPending) return <div className="min-h-screen flex items-center justify-center bg-[#0F1117]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>;
  if (isAuthenticated) return null;

  /** Returns true if an error message is about email verification */
  function isVerificationError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return lower.includes('verif') || lower.includes('not verified') || lower.includes('confirm your email') || lower.includes('email not confirmed');
  }
  async function handleResendVerification() {
    if (!email.trim()) return;
    setResendState('sending');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase()
        })
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
    authLog('submit', {
      route: '/login',
      emailDomain: email.split('@')[1] ?? 'unknown'
    });
    try {
      // Use the BetterAuth SDK signIn.email() so the official twoFactor plugin
      // can intercept the response. The twoFactorClient plugin's onTwoFactorRedirect
      // callback fires when the server returns twoFactorRedirect:true, storing the
      // redirect context in the module-level handoff variable for us to read below.
      // signIn.email — the smsChallengeCapture fetchPlugin in auth-client.tsx
      // captures smsChallengeToken from context.data before the twoFactorClient
      // plugin fires, so consumeTwoFactorRedirect() returns it alongside methods.
      const result = await signIn.email({ email, password });

      // Always extract smsChallengeToken from result.data as a final fallback —
      // covers the case where the SDK doesn't fire onSuccess (e.g. network error
      // path) but still returns data.
      const rawData = result?.data as Record<string, unknown> | undefined;
      if (!smsChallengeTokenRef.current) {
        const smsToken = rawData?.smsChallengeToken as string | undefined;
        if (smsToken) smsChallengeTokenRef.current = smsToken;
      }

      // Check if the twoFactor plugin signalled a redirect.
      // consumeTwoFactorRedirect() returns the context including smsChallengeToken
      // captured by the smsChallengeCapture fetchPlugin in auth-client.tsx.
      const twoFaRedirect = consumeTwoFactorRedirect() ?? (() => {
        if (rawData?.twoFactorRedirect === true) {
          const methods = (rawData.twoFactorMethods as string[] | undefined) ?? [];
          return { needs2FA: true as const, methods };
        }
        return null;
      })();

      // Diagnostic — safe fields only, no credentials
      console.info(JSON.stringify({
        event: 'login.2fa.trace',
        hasRawData: !!rawData,
        rawDataKeys: rawData ? Object.keys(rawData) : [],
        rawTwoFactorRedirect: rawData?.twoFactorRedirect,
        rawTwoFactorMethods: rawData?.twoFactorMethods,
        hasSmsTokenInRaw: !!(rawData?.smsChallengeToken),
        twoFaRedirectNull: twoFaRedirect === null,
        twoFaRedirectMethods: twoFaRedirect?.methods ?? null,
        tokenInRef: !!smsChallengeTokenRef.current,
        ts: Date.now(),
      }));

      // Extract smsChallengeToken from the redirect context (primary path)
      if (twoFaRedirect && 'smsChallengeToken' in twoFaRedirect) {
        const t = (twoFaRedirect as { smsChallengeToken?: string }).smsChallengeToken;
        if (t) smsChallengeTokenRef.current = t;
      }

      if (twoFaRedirect) {
        const methods = twoFaRedirect.methods ?? [];
        // Determine method: prefer totp if available, else sms
        const method: 'totp' | 'sms' = methods.includes('totp') ? 'totp' : 'sms';
        authLog('2fa_required', { method, methods });
        setLoading(false);
        setTfa2Method(method);
        if (method === 'sms') {
          setSmsMaskedPhone('');
          setSmsResendState('sending');
          try {
            const sendRes = await fetch('/api/me/2fa/sms/send', {
              method: 'POST',
              credentials: 'include',
              headers: smsChallengeTokenRef.current
                ? { 'X-SMS-Challenge-Token': smsChallengeTokenRef.current }
                : {},
            });
            const sendData = (await sendRes.json()) as { ok?: boolean; maskedPhone?: string; error?: string };
            if (sendData.maskedPhone) setSmsMaskedPhone(sendData.maskedPhone);
            setSmsResendState('sent');
            // Reset after 30 s so the user can resend if the code doesn't arrive
            setTimeout(() => setSmsResendState('idle'), 30_000);
          } catch {
            setSmsResendState('idle');
          }
        }
        setNeeds2FA(true);
        return;
      }

      // ── Standard error handling ────────────────────────────────────────────
      if (result?.error) {
        const msg = result.error.message ?? '';
        authLog('error', { errorMsg: msg.slice(0, 120) });
        if (isVerificationError(msg)) {
          setUnverified(true);
        } else {
          setError(msg || 'Invalid email or password.');
        }
        setLoading(false);
        return;
      }

      // ── Login succeeded ────────────────────────────────────────────────────
      const userData = result?.data?.user as { emailVerified?: boolean; id?: string } | undefined;
      authLog('success', { emailVerified: userData?.emailVerified, userId: userData?.id });

      if (userData && userData.emailVerified === false) {
        setUnverified(true);
        setLoading(false);
        return;
      }

      // Check if forced password change is required (server injects mustChangePassword)
      const rawBody = result?.data as Record<string, unknown> | undefined;
      if (rawBody?.mustChangePassword) {
        setLoading(false);
        setMustChangePassword(true);
        return;
      }

      // Prefer ?from= query param (set by session-expiry hard redirect) over
      // React Router location state (set by ProtectedRoute soft redirect).
      const params = new URLSearchParams(location.search);
      const fromParam = params.get('from');
      const rawFrom = (location.state as {
        from?: {
          pathname: string;
        };
      })?.from?.pathname || (fromParam ? decodeURIComponent(fromParam) : null) || '/home';
      const SAFE_BLOCKLIST = ['/login', '/signup', '/verify', '/forgot', '/reset', '/check-email'];
      // Native app always goes to /home — never back to the public landing page
      const from = isNativeApp ? '/home' : rawFrom.startsWith('/') && !SAFE_BLOCKLIST.some(b => rawFrom.startsWith(b)) ? rawFrom : '/home';
      authLog('redirect', {
        to: from
      });
      navigate(from, {
        replace: true
      });
    } catch (err) {
      authLog('exception', {
        errorMsg: String((err as Error)?.message ?? err).slice(0, 120)
      });
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          pin,
          deviceFingerprint
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        lockedUntil?: string;
      };
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

    // ── Backup-code path ───────────────────────────────────────────────────
    if (useBackupCode) {
      const code = backupCodeInput.trim();
      if (!code) { setError('Enter your backup code.'); return; }
      setError('');
      setTfaLoading(true);
      try {
        // Official BetterAuth plugin: POST /api/auth/two-factor/verify-backup-code
        // This is a dedicated endpoint — backup codes must NOT be sent to verifyTotp.
        const result = await authClient.twoFactor.verifyBackupCode({ code });
        if (result?.error) {
          setError(result.error.message ?? 'Invalid backup code. Please try again.');
          return;
        }
        const rawFrom2faBackup = (location.state as { from?: { pathname: string } })?.from?.pathname || '/home';
        const SAFE_BLOCKLIST_BACKUP = ['/login', '/signup', '/verify', '/forgot', '/reset', '/check-email'];
        const from2faBackup = isNativeApp ? '/home' : rawFrom2faBackup.startsWith('/') && !SAFE_BLOCKLIST_BACKUP.some(b => rawFrom2faBackup.startsWith(b)) ? rawFrom2faBackup : '/home';
        navigate(from2faBackup, { replace: true });
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setTfaLoading(false);
      }
      return;
    }

    // ── TOTP / SMS path ────────────────────────────────────────────────────
    if (tfaToken.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError('');
    setTfaLoading(true);
    try {
      if (tfa2Method === 'sms') {
        // SMS 2FA still uses the custom endpoint (separate from the official TOTP plugin)
        const res = await fetch('/api/me/2fa/sms/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(smsChallengeTokenRef.current
              ? { 'X-SMS-Challenge-Token': smsChallengeTokenRef.current }
              : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ token: tfaToken, code: tfaToken }),
        });
        const d = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !d.ok) {
          setError(d.error ?? 'Invalid code. Please try again.');
          return;
        }
      } else {
        // TOTP: use the official BetterAuth twoFactor plugin endpoint
        const result = await authClient.twoFactor.verifyTotp({ code: tfaToken });
        if (result?.error) {
          const msg = result.error.message ?? 'Invalid code. Please try again.';
          setError(msg);
          return;
        }
      }
      const rawFrom2fa = (location.state as {
        from?: {
          pathname: string;
        };
      })?.from?.pathname || '/home';
      const SAFE_BLOCKLIST_2FA = ['/login', '/signup', '/verify', '/forgot', '/reset', '/check-email'];
      const from2fa = isNativeApp ? '/home' : rawFrom2fa.startsWith('/') && !SAFE_BLOCKLIST_2FA.some(b => rawFrom2fa.startsWith(b)) ? rawFrom2fa : '/home';
      navigate(from2fa, {
        replace: true
      });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setTfaLoading(false);
    }
  }
  async function handleSmsResend() {
    setSmsResendState('sending');
    setError('');
    try {
      const res = await fetch('/api/me/2fa/sms/send', {
        method: 'POST',
        credentials: 'include',
        headers: smsChallengeTokenRef.current
          ? { 'X-SMS-Challenge-Token': smsChallengeTokenRef.current }
          : {},
      });
      const d = (await res.json()) as {
        ok?: boolean;
        maskedPhone?: string;
        error?: string;
      };
      if (d.maskedPhone) setSmsMaskedPhone(d.maskedPhone);
      setSmsResendState('sent');
      setTimeout(() => setSmsResendState('idle'), 30_000);
    } catch {
      setSmsResendState('idle');
      setError('Failed to resend. Please try again.');
    }
  }
  return <div className="relative min-h-screen flex items-center justify-center overflow-y-auto bg-[#0F1117] py-8">
      <Helmet>
        <title>Sign In — IWILLBUILD Portal</title>
        <meta name="description" content="Sign in to the IWILLBUILD portal to manage jobs, crews, fleet, safety and more." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://iwillbuild.com/login" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Sign In — IWILLBUILD Portal" />
        <meta property="og:description" content="Sign in to manage your construction jobs, fleet, safety docs and team." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/login" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      {/* Forced password change modal */}
      {mustChangePassword && <ForcedPasswordChangeModal onSuccess={() => {
      setMustChangePassword(false);
      const rawFromPwChange = (location.state as {
        from?: {
          pathname: string;
        };
      })?.from?.pathname || '/home';
      const SAFE_BLOCKLIST_PW = ['/login', '/signup', '/verify', '/forgot', '/reset', '/check-email'];
      const fromPwChange = isNativeApp ? '/home' : rawFromPwChange.startsWith('/') && !SAFE_BLOCKLIST_PW.some(b => rawFromPwChange.startsWith(b)) ? rawFromPwChange : '/home';
      navigate(fromPwChange, {
        replace: true
      });
    }} />}

      {/* Blueprint grid background */}
      <div className="absolute inset-0 opacity-[0.06]" style={{
      backgroundImage: `
            linear-gradient(rgba(249,115,22,0.8) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249,115,22,0.8) 1px, transparent 1px)
          `,
      backgroundSize: '40px 40px'
    }} />
      <div className="absolute inset-0 pointer-events-none" style={{
      background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(249,115,22,0.07) 0%, transparent 70%)'
    }} />
      <div className="absolute top-0 left-0 w-64 h-64 border-r border-b border-white/5 rounded-br-[80px]" />
      <div className="absolute bottom-0 right-0 w-64 h-64 border-l border-t border-white/5 rounded-tl-[80px]" />

      <motion.div initial={{
      opacity: 0,
      y: 24
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      duration: 0.4,
      ease: 'easeOut' as const
    }} className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-[#1A1D23] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-white/10">
            <div className="flex items-center justify-center mb-6">
              <img src="/assets/logo.png" alt="IWILLBUILD" className="h-12 w-auto object-contain" />
            </div>
            <h1 className="font-heading font-bold text-xl text-white text-center">
              Portal Sign In
            </h1>
            <p className="text-sm text-white/40 text-center mt-1">
              Internal access only
            </p>
          </div>

          {/* ── Session expired notice ─────────────────────────────────── */}
          {sessionExpiredNotice && <div className="flex items-start gap-3 bg-violet-500/10 border border-violet-600/25 rounded-xl px-4 py-3 mx-0">
              <ShieldCheck size={16} className="text-violet-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-violet-300 text-sm font-semibold">Session expired — please sign in again</p>
                <p className="text-violet-400/70 text-xs mt-0.5">Your session has expired — please sign in again.</p>
              </div>
            </div>}

          {/* ── Email just-verified banner ─────────────────────────────── */}
          {justVerified && <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/25 rounded-xl px-4 py-3 mx-0">
              <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-green-300 text-sm font-semibold">Email verified — you're all set!</p>
                <p className="text-green-400/70 text-xs mt-0.5">Enter your password below to sign in.</p>
              </div>
            </div>}

          {/* Mode tabs (only show PIN tab if trusted device exists) */}
          {hasTrustedDevice && !needs2FA && <div className="flex border-b border-white/10">
              <button onClick={() => {
            setMode('password');
            setError('');
          }} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${mode === 'password' ? 'text-white border-b-2 border-primary bg-white/5' : 'text-white/40 hover:text-white/60'}`}>
                <Lock size={12} />
                Password
              </button>
              <button onClick={() => {
            setMode('pin');
            setError('');
          }} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${mode === 'pin' ? 'text-white border-b-2 border-primary bg-white/5' : 'text-white/40 hover:text-white/60'}`}>
                <KeyRound size={12} />
                PIN Login
              </button>
            </div>}

          {/* 2FA Challenge */}
          {needs2FA && <div className="px-8 py-8">
              <div className="flex flex-col items-center mb-6">
                <div className="w-12 h-12 bg-violet-500/10 border border-violet-600/30 rounded-xl flex items-center justify-center mb-3">
                  {tfa2Method === 'sms' ? <MessageSquare size={22} className="text-primary" /> : <ShieldCheck size={22} className="text-primary" />}
                </div>
                <h2 className="text-white font-bold text-base">Two-Factor Authentication</h2>
                <p className="text-white/40 text-xs mt-1 text-center">
                  {useBackupCode
                    ? 'Enter one of your saved backup codes.'
                    : tfa2Method === 'sms'
                      ? smsMaskedPhone ? `We sent a code to ${smsMaskedPhone}` : 'We sent a 6-digit code to your phone.'
                      : 'Enter the 6-digit code from your authenticator app.'}
                </p>
              </div>

              {error && <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 mb-4">
                  <AlertCircle size={13} className="shrink-0" />{error}
                </div>}

              <form onSubmit={handle2FA} className="flex flex-col items-center gap-5">
                {useBackupCode ? (
                  /* ── Backup code input ── */
                  <input
                    type="text"
                    value={backupCodeInput}
                    onChange={e => setBackupCodeInput(e.target.value)}
                    placeholder="xxxxx-xxxxx"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white text-sm font-mono text-center tracking-widest placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60"
                  />
                ) : (
                  /* ── TOTP / SMS OTP input ── */
                  <InputOTP maxLength={6} value={tfaToken} onChange={setTfaToken} autoFocus>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="text-white border-white/20 bg-white/5" />
                      <InputOTPSlot index={1} className="text-white border-white/20 bg-white/5" />
                      <InputOTPSlot index={2} className="text-white border-white/20 bg-white/5" />
                      <InputOTPSlot index={3} className="text-white border-white/20 bg-white/5" />
                      <InputOTPSlot index={4} className="text-white border-white/20 bg-white/5" />
                      <InputOTPSlot index={5} className="text-white border-white/20 bg-white/5" />
                    </InputOTPGroup>
                  </InputOTP>
                )}

                <button
                  type="submit"
                  disabled={tfaLoading || (useBackupCode ? !backupCodeInput.trim() : tfaToken.length !== 6)}
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-violet-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {tfaLoading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying…</> : <><ShieldCheck size={15} />{useBackupCode ? 'Use Backup Code' : 'Verify Code'}</>}
                </button>

                {/* Resend button for SMS */}
                {tfa2Method === 'sms' && !useBackupCode && <button type="button" onClick={() => void handleSmsResend()} disabled={smsResendState === 'sending' || smsResendState === 'sent'} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 disabled:opacity-50 transition-colors">
                    {smsResendState === 'sending' ? <><span className="w-3 h-3 border border-white/30 border-t-white/60 rounded-full animate-spin" />Sending…</> : smsResendState === 'sent' ? <><CheckCircle2 size={12} className="text-green-400" />Code sent — resend available in 30s</> : <><RefreshCw size={12} />Resend code</>}
                  </button>}

                {/* Backup code toggle — only shown for TOTP (not SMS) */}
                {tfa2Method !== 'sms' && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode(v => !v);
                      setError('');
                      setBackupCodeInput('');
                      setTfaToken('');
                    }}
                    className="text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    {useBackupCode ? '← Use authenticator app instead' : 'Use a backup code instead'}
                  </button>
                )}

                <button type="button" onClick={() => {
              setNeeds2FA(false);
              setTfaToken('');
              setBackupCodeInput('');
              setUseBackupCode(false);
              setError('');
              setTfa2Method(null);
            }} className="text-xs text-white/30 hover:text-white/50 transition-colors">
                  Back to login
                </button>
              </form>
            </div>}

          {/* Form */}
          {!needs2FA && <AnimatePresence mode="wait">
            {mode === 'password' ? <motion.form key="password" initial={{
            opacity: 0,
            x: -10
          }} animate={{
            opacity: 1,
            x: 0
          }} exit={{
            opacity: 0,
            x: 10
          }} transition={{
            duration: 0.2
          }} onSubmit={handlePasswordSubmit} className="px-8 py-6">
                <div className="flex flex-col gap-4">
                  {/* Unverified email panel — shown instead of generic error */}
                  {unverified && <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-4 flex flex-col gap-3">
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
                      <button type="button" onClick={() => void handleResendVerification()} disabled={resendState === 'sending' || resendState === 'sent'} className="flex items-center justify-center gap-2 w-full bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-60 border border-amber-500/30 text-amber-300 text-xs font-semibold py-2 rounded-lg transition-colors">
                        {resendState === 'sending' ? <>
                            <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                            Sending…
                          </> : resendState === 'sent' ? <>
                            <CheckCircle2 size={13} />
                            Verification email sent — check your inbox
                          </> : <>
                            <RefreshCw size={13} />
                            Resend verification email
                          </>}
                      </button>
                      {resendState === 'error' && <p className="text-xs text-red-400 text-center -mt-1">
                          Failed to send. Please try again shortly.
                        </p>}

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
                    </div>}

                  {/* Generic error (non-verification) */}
                  {error && !unverified && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                      <AlertCircle size={14} className="shrink-0" />
                      {error}
                    </div>}

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@iwillbuild.com.au" autoComplete="email" required className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">
                        Password
                      </label>
                      <Link to="/forgot-password" className="text-xs text-white/35 hover:text-primary transition-colors">
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-violet-700 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-md transition-colors mt-1">
                    {loading ? <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in…
                      </span> : <>
                        Sign In
                        <ArrowRight size={15} />
                      </>}
                  </button>

                  {/* Resend verification link */}
                  <p className="text-center text-xs text-white/30">
                    Didn't receive a verification email?{' '}
                    <Link to="/verify-required" className="text-primary hover:text-violet-400 font-medium transition-colors">
                      Resend it
                    </Link>
                  </p>

                  <p className="text-center text-xs text-white/35 mt-1">
                    Don&apos;t have an account?{' '}
                    <Link to="/signup" className="text-primary hover:text-violet-400 font-medium transition-colors">
                      Create one
                    </Link>
                  </p>
                  <p className="text-center text-xs text-white/25 mt-1">
                    <Link to="/login-help" className="hover:text-white/50 transition-colors">
                      Having trouble logging in?
                    </Link>
                  </p>
                </div>
              </motion.form> : <motion.form key="pin" initial={{
            opacity: 0,
            x: 10
          }} animate={{
            opacity: 1,
            x: 0
          }} exit={{
            opacity: 0,
            x: -10
          }} transition={{
            duration: 0.2
          }} onSubmit={handlePinSubmit} className="px-8 py-6">
                <div className="flex flex-col gap-4">
                  {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                      <AlertCircle size={14} className="shrink-0" />
                      {error}
                    </div>}

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
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@iwillbuild.com.au" autoComplete="email" required className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                      PIN
                    </label>
                    <div className="relative">
                      <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" inputMode="numeric" maxLength={6} required className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors tracking-widest" />
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-violet-700 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-md transition-colors mt-1">
                    {loading ? <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Verifying…
                      </span> : <>
                        Sign In with PIN
                        <ArrowRight size={15} />
                      </>}
                  </button>
                </div>
              </motion.form>}
          </AnimatePresence>} {/* end !needs2FA */}

          {/* Footer */}
          <div className="px-8 py-4 bg-black/20 border-t border-white/5 text-center">
            <p className="text-xs text-white/25">
              IWILLBUILD Pty Ltd &mdash; Authorised personnel only
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          {/* Native app: subscribe / create account link */}
          {isNativeApp ? <>
              <Link to="/subscribe" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-primary transition-colors font-medium">
                <Users size={12} />
                New to IWILLBUILD? Start a free trial
              </Link>
              <button type="button" onClick={() => openExternalUrl(WEB_PORTAL_URL)} className="flex items-center gap-1.5 text-xs text-white/25 hover:text-primary transition-colors">
                <ExternalLink size={12} />
                Open web portal
              </button>
            </> : <Link to="/" className="text-xs text-white/30 hover:text-primary transition-colors">
              &larr; Back to home
            </Link>}
        </div>
      </motion.div>
    </div>;
}
