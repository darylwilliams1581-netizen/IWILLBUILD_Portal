import { useState } from 'react';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setSent(true);
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Request failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0F1117]">
      <Helmet>
        <title>Forgot Password — IWILLBUILD Portal</title>
        <meta name="description" content="Reset your IWILLBUILD Portal password." />
        <link rel="canonical" href="https://iwillbuild.com/forgot-password" />
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
              Forgot your password?
            </h1>
            <p className="text-sm text-white/40 text-center mt-1">
              Enter your email and we'll send reset instructions.
            </p>
          </div>

          <div className="px-8 py-6">
            {sent ? (
              <div className="text-center">
                <div className="w-14 h-14 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={26} className="text-green-400" />
                </div>
                <h2 className="text-white font-bold text-lg mb-2">Check your inbox</h2>
                <p className="text-white/50 text-sm leading-relaxed mb-6">
                  If an account exists with <span className="text-white/80 font-medium">{email}</span>, we've sent reset instructions. The link expires in 30 minutes.
                </p>
                <p className="text-white/30 text-xs mb-4">
                  Don't see it? Check your spam folder, or try a different email.
                </p>
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="text-primary hover:text-orange-400 text-sm font-medium transition-colors"
                >
                  Try a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                    <AlertCircle size={14} className="shrink-0" />
                    {error}
                  </div>
                )}

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
                      placeholder="you@company.com"
                      autoComplete="email"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
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
                      Sending…
                    </span>
                  ) : (
                    <>
                      Send reset instructions
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          <div className="px-8 py-4 bg-black/20 border-t border-white/5 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-primary transition-colors"
            >
              <ArrowLeft size={13} />
              Back to sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
