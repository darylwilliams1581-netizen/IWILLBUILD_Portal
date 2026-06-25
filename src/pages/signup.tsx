import { useState } from 'react';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Lock, Mail, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { signIn } from '@/lib/auth/auth-client';

// Password policy checks
function getPasswordStrength(pw: string) {
  return {
    length: pw.length >= 8,
    letter: /[a-zA-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^a-zA-Z0-9]/.test(pw),
  };
}

function StrengthRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${ok ? 'text-emerald-400' : 'text-white/30'}`}>
      <CheckCircle2 size={11} className={ok ? 'text-emerald-400' : 'text-white/20'} />
      {label}
    </div>
  );
}

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const strength = getPasswordStrength(password);
  const passwordValid = strength.length && strength.letter && strength.number && strength.symbol;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your full name.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!passwordValid) { setError('Password does not meet the requirements below.'); return; }

    setError('');
    setLoading(true);

    try {
      // Call our custom signup endpoint (handles profile + role assignment)
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
        credentials: 'include',
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) {
        setError(data.error || 'Signup failed. Please try again.');
        setLoading(false);
        return;
      }

      // Auto sign-in after successful signup
      const loginResult = await signIn.email({ email: email.trim().toLowerCase(), password });
      if (loginResult.error) {
        // Signup worked but auto-login failed — send to login page
        navigate('/login', { replace: true });
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0F1117]">
      <Helmet>
        <title>Create Account — IWILLBUILD Portal</title>
        <meta name="description" content="Create your IWILLBUILD portal account to manage jobs, crews, fleet, and more." />
        <link rel="canonical" href="https://iwillbuild.com.au/signup" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Blueprint grid */}
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

      {/* Card */}
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
              Create Account
            </h1>
            <p className="text-sm text-white/40 text-center mt-1">
              Internal access only
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-6">
            <div className="flex flex-col gap-4">
              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                  <AlertCircle size={14} className="shrink-0" />
                  {error}
                </div>
              )}

              {/* Full name */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                  Full Name
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Darren Walsh"
                    autoComplete="name"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150"
                  />
                </div>
              </div>

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
                    className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors duration-150"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Strength indicators — only show once user starts typing */}
                {password.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 px-0.5">
                    <StrengthRow ok={strength.length} label="8+ characters" />
                    <StrengthRow ok={strength.letter} label="1 letter" />
                    <StrengthRow ok={strength.number} label="1 number" />
                    <StrengthRow ok={strength.symbol} label="1 symbol" />
                  </div>
                )}
              </div>

              {/* CTA */}
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-md transition-colors duration-150 mt-1"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating account…
                  </span>
                ) : (
                  <>
                    Create Account
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              {/* Login link */}
              <p className="text-center text-xs text-white/35 mt-1">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:text-orange-400 font-medium transition-colors duration-150">
                  Sign in
                </Link>
              </p>
            </div>
          </form>

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
            className="text-xs text-white/30 hover:text-primary transition-colors duration-150"
          >
            &larr; Back to home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
