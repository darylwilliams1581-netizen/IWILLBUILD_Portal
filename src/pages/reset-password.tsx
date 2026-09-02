import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate } from "react-router";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, ShieldAlert } from 'lucide-react';
function PasswordStrength({
  password
}: {
  password: string;
}) {
  const checks = [{
    label: 'At least 8 characters',
    ok: password.length >= 8
  }, {
    label: 'At least one number',
    ok: /\d/.test(password)
  }, {
    label: 'At least one symbol',
    ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)
  }];
  const passed = checks.filter(c => c.ok).length;
  const color = passed === 3 ? 'bg-green-500' : passed >= 2 ? 'bg-amber-500' : 'bg-red-500';
  return <div className="mt-2">
      <div className="flex gap-1 mb-2">
        {[0, 1, 2].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passed ? color : 'bg-white/10'}`} />)}
      </div>
      <div className="flex flex-col gap-1">
        {checks.map(c => <div key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-green-400' : 'text-white/30'}`}>
            <CheckCircle size={11} />
            {c.label}
          </div>)}
      </div>
    </div>;
}
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? '';
  const uid = params.get('uid') ?? '';
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token || !uid) {
      setTokenValid(false);
      return;
    }
    fetch(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}&uid=${encodeURIComponent(uid)}`).then(r => r.json()).then((d: {
      valid: boolean;
    }) => setTokenValid(d.valid)).catch(() => setTokenValid(false));
  }, [token, uid]);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8 || !/\d/.test(newPassword) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword)) {
      setError('Password does not meet the requirements below.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          userId: uid,
          newPassword
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        setDone(true);
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setError(data.error ?? 'Failed to reset password. Please try again.');
      }
    } catch {
      setError('Request failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }
  return <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0F1117]">
      <Helmet>
        <title>Reset Password — IWIIlBUILD Portal</title>
        <meta name="description" content="Set a new password for your IWIIlBUILD Portal account." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://iwillbuild.com/reset-password" />
        <meta name="robots" content="noindex" />
      </Helmet>

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
          <div className="px-8 pt-8 pb-6 border-b border-white/10">
            <div className="flex items-center justify-center mb-6">
              <img src="/airo-assets/images/logo/horizontal" alt="IWIIlBUILD" className="h-10 w-auto object-contain" />
            </div>
            <h1 className="font-heading font-bold text-xl text-white text-center">
              Set new password
            </h1>
          </div>

          <div className="px-8 py-6">
            {tokenValid === null && <div className="flex items-center justify-center py-8">
                <span className="w-6 h-6 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
              </div>}

            {tokenValid === false && <div className="text-center">
                <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert size={26} className="text-red-400" />
                </div>
                <h2 className="text-white font-bold text-lg mb-2">Link expired or invalid</h2>
                <p className="text-white/50 text-sm leading-relaxed mb-6">
                  This password reset link has expired or already been used. Reset links are valid for 30 minutes.
                </p>
                <Link to="/forgot-password" className="inline-flex items-center gap-2 bg-primary hover:bg-violet-700 text-white font-semibold text-sm px-5 py-2.5 rounded-md transition-colors">
                  Request a new link
                </Link>
              </div>}

            {tokenValid === true && !done && <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                    <AlertCircle size={14} className="shrink-0" />
                    {error}
                  </div>}

                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                      {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {newPassword && <PasswordStrength password={newPassword} />}
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required className="w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && <p className="text-red-400 text-xs mt-1">Passwords do not match.</p>}
                </div>

                <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-violet-700 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-md transition-colors mt-1">
                  {loading ? <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Resetting…
                    </span> : 'Set new password'}
                </button>
              </form>}

            {done && <div className="text-center">
                <div className="w-14 h-14 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={26} className="text-green-400" />
                </div>
                <h2 className="text-white font-bold text-lg mb-2">Password reset!</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  Your password has been updated. Redirecting you to sign in…
                </p>
              </div>}
          </div>

          <div className="px-8 py-4 bg-black/20 border-t border-white/5 text-center">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-primary transition-colors">
              <ArrowLeft size={13} />
              Back to sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>;
}
