import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, Lock, Mail, User, AlertCircle,
  CheckCircle2, Building2, ChevronRight, Users, Zap, Crown, Gift,
} from 'lucide-react';
import { signIn } from '@/lib/auth/auth-client';
import { INDUSTRY_LIST, type IndustryId } from '@/lib/industry-config';

// ── Password policy ───────────────────────────────────────────────────────────
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

// ── Plan definitions ──────────────────────────────────────────────────────────
const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    price: '$19',
    period: '/mo',
    maxUsers: 1,
    description: 'Perfect for sole traders',
    icon: User,
    color: 'border-slate-600 hover:border-slate-400',
    activeColor: 'border-primary bg-primary/10',
    badge: null,
  },
  {
    id: 'team',
    name: 'Team',
    price: '$79',
    period: '/mo',
    maxUsers: 10,
    description: 'Up to 10 team members',
    icon: Users,
    color: 'border-slate-600 hover:border-slate-400',
    activeColor: 'border-primary bg-primary/10',
    badge: 'Most Popular',
  },
  {
    id: 'business',
    name: 'Business',
    price: '$149',
    period: '/mo',
    maxUsers: 10,
    description: 'Up to 10 team members',
    icon: Zap,
    color: 'border-slate-600 hover:border-slate-400',
    activeColor: 'border-primary bg-primary/10',
    badge: null,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    maxUsers: 999,
    description: 'Unlimited users + support',
    icon: Crown,
    color: 'border-slate-600 hover:border-slate-400',
    activeColor: 'border-amber-400 bg-amber-400/10',
    badge: null,
  },
] as const;

type PlanId = typeof PLANS[number]['id'];

// ── Background decoration ─────────────────────────────────────────────────────
function BlueprintBg() {
  return (
    <>
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
    </>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`rounded-full transition-all duration-300 ${
            s === step
              ? 'w-6 h-2 bg-primary'
              : s < step
              ? 'w-2 h-2 bg-primary/50'
              : 'w-2 h-2 bg-white/15'
          }`}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SignupPage() {
  const navigate = useNavigate();

  // Step 1 — company
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState<IndustryId>('construction');

  // Step 2 — plan
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('team');
  const [trialOnly, setTrialOnly] = useState(false);

  // Step 3 — account
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Incomplete signup state — shown when server returns error: 'incomplete_signup'
  const [incompleteSignup, setIncompleteSignup] = useState<{ userId: string; email: string } | null>(null);

  // Anti-spam: record when the page was first rendered
  const formLoadTime = useRef<number>(Date.now());

  const strength = getPasswordStrength(password);
  const passwordValid = strength.length && strength.letter && strength.number && strength.symbol;

  // ── Step navigation ─────────────────────────────────────────────────────────
  function goStep2() {
    if (!companyName.trim()) { setError('Please enter your company name.'); return; }
    setError('');
    setStep(2);
  }

  function goStep3() {
    setError('');
    setStep(3);
  }

  function goTrialStep3() {
    setSelectedPlan('solo');
    setTrialOnly(true);
    setError('');
    setStep(3);
  }

  // ── Final submit ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter your full name.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!passwordValid) { setError('Password does not meet the requirements below.'); return; }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          companyName: companyName.trim(),
          plan: selectedPlan,
          trialOnly,
          industry,
          // Anti-spam fields
          _hp: '',                          // honeypot — always empty for real users
          _t: formLoadTime.current,         // form load timestamp
        }),
        credentials: 'include',
      });

      const data = await res.json() as { ok?: boolean; error?: string; userId?: string; message?: string };

      if (!res.ok) {
        // Incomplete signup — auth user exists but no profile/company
        if (data.error === 'incomplete_signup' && data.userId) {
          setIncompleteSignup({ userId: data.userId, email: email.trim().toLowerCase() });
          setLoading(false);
          return;
        }
        setError(data.error || 'Signup failed. Please try again.');
        setLoading(false);
        return;
      }

      // Auto sign-in so the session cookie is set
      const loginResult = await signIn.email({ email: email.trim().toLowerCase(), password });
      if (loginResult.error) {
        // Sign-in failed — send them to check-email anyway (account was created)
        navigate('/check-email', { state: { email: email.trim().toLowerCase() }, replace: true });
        return;
      }

      // Redirect to check-email (not dashboard — must verify first)
      navigate('/check-email', { state: { email: email.trim().toLowerCase() }, replace: true });
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-150';

  // ── Incomplete signup screen ─────────────────────────────────────────────────
  if (incompleteSignup) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0F1117] py-8">
        <Helmet>
          <title>Complete Your Setup — IWILLBUILD Portal</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <BlueprintBg />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' as const }}
          className="relative z-10 w-full max-w-md mx-4"
        >
          <div className="flex justify-center mb-6">
            <img src="/airo-assets/images/logo/horizontal" alt="IWILLBUILD Portal" className="h-8 w-auto" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={22} className="text-amber-400" />
            </div>
            <h1 className="text-xl font-black text-white text-center mb-2">Account setup incomplete</h1>
            <p className="text-sm text-white/50 text-center mb-1">
              An account for <span className="text-white/80 font-semibold">{incompleteSignup.email}</span> was started but setup didn't finish.
            </p>
            <p className="text-sm text-white/40 text-center mb-6">
              You can continue setup, sign in to try again, or reset your password.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  // Go back to step 1 with email pre-filled — user will re-enter company details
                  // and we'll call resume-signup instead of signup
                  setIncompleteSignup(null);
                  setStep(1);
                  setError('');
                }}
                className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-orange-600 transition-colors"
              >
                Continue setup
              </button>
              <Link
                to="/login"
                className="w-full py-3 rounded-xl border border-white/10 text-white/70 font-semibold text-sm text-center hover:bg-white/5 transition-colors"
              >
                Sign in instead
              </Link>
              <Link
                to="/forgot-password"
                className="w-full py-3 rounded-xl border border-white/10 text-white/50 font-semibold text-sm text-center hover:bg-white/5 transition-colors"
              >
                Reset password
              </Link>
            </div>
            <p className="text-xs text-white/25 text-center mt-5">
              If you need help, contact{' '}
              <a href="mailto:support@iwillbuild.com" className="text-white/40 hover:text-white/60 underline">
                support@iwillbuild.com
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0F1117] py-8">
      <Helmet>
        <title>Get Started — IWILLBUILD Portal</title>
        <meta name="description" content="Create your IWILLBUILD portal account. 30-day free trial, no credit card required." />
        <link rel="canonical" href="https://iwillbuild.com/signup" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <BlueprintBg />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
        className="relative z-10 w-full max-w-lg mx-4"
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img
            src="/airo-assets/images/logo/horizontal"
            alt="IWILLBUILD"
            className="h-10 w-auto object-contain"
          />
        </div>

        <div className="bg-[#1A1D23] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-7 pb-5 border-b border-white/10">
            <StepDots step={step} />
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="h1" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                  <h1 className="font-heading font-bold text-xl text-white text-center">Your company name</h1>
                  <p className="text-sm text-white/40 text-center mt-1">This is how your portal will be labelled</p>
                </motion.div>
              )}
              {step === 2 && (
                <motion.div key="h2" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                  <h1 className="font-heading font-bold text-xl text-white text-center">Choose your plan</h1>
                  <p className="text-sm text-white/40 text-center mt-1">30-day free trial · No credit card required</p>
                </motion.div>
              )}
              {step === 3 && (
                <motion.div key="h3" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                  <h1 className="font-heading font-bold text-xl text-white text-center">Create your account</h1>
                  <p className="text-sm text-white/40 text-center mt-1">
                    {trialOnly
                      ? <span>1-month free trial · <span className="text-emerald-400 font-medium">Solo plan</span> · Upgrade anytime</span>
                      : <span>You'll be the Admin for <span className="text-white/70 font-medium">{companyName}</span></span>
                    }
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400 mb-4">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <AnimatePresence mode="wait">

              {/* ── Step 1: Company name + industry ──────────────────────── */}
              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
                        Company / Business Name
                      </label>
                      <div className="relative">
                        <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && goStep2()}
                          placeholder="Walsh Constructions Pty Ltd"
                          autoFocus
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Industry selector */}
                    <div>
                      <label className="block text-xs font-medium text-white/60 mb-2 uppercase tracking-wider">
                        Industry
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {INDUSTRY_LIST.map((ind) => (
                          <button
                            key={ind.id}
                            type="button"
                            onClick={() => setIndustry(ind.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                              industry === ind.id
                                ? 'border-primary bg-primary/20 text-white font-semibold'
                                : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/70 hover:bg-white/5'
                            }`}
                          >
                            <span className="text-sm leading-none shrink-0">{ind.icon}</span>
                            <span className="truncate">{ind.label}</span>
                            {industry === ind.id && (
                              <CheckCircle2 size={11} className="ml-auto text-primary shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={goStep2}
                      className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-orange-600 text-white font-semibold text-sm py-2.5 rounded-md transition-colors duration-150 mt-1"
                    >
                      Continue <ChevronRight size={15} />
                    </button>
                    <p className="text-center text-xs text-white/35">
                      Already have an account?{' '}
                      <Link to="/login" className="text-primary hover:text-orange-400 font-medium transition-colors duration-150">Sign in</Link>
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Plan selection ───────────────────────────────── */}
              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      {PLANS.map((plan) => {
                        const Icon = plan.icon;
                        const isActive = selectedPlan === plan.id;
                        return (
                          <button
                            key={plan.id}
                            onClick={() => setSelectedPlan(plan.id)}
                            className={`relative flex flex-col items-start gap-1.5 p-3.5 rounded-xl border-2 text-left transition-all duration-150 ${isActive ? plan.activeColor : plan.color}`}
                          >
                            {plan.badge && (
                              <span className="absolute -top-2 right-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {plan.badge}
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              <Icon size={14} className={isActive ? 'text-primary' : 'text-white/50'} />
                              <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-white/70'}`}>{plan.name}</span>
                            </div>
                            <div className="flex items-baseline gap-0.5">
                              <span className={`text-lg font-black ${isActive ? 'text-white' : 'text-white/60'}`}>{plan.price}</span>
                              {plan.period && <span className="text-xs text-white/35">{plan.period}</span>}
                            </div>
                            <p className="text-[11px] text-white/40 leading-tight">{plan.description}</p>
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-center text-xs text-white/30 mt-1">
                      All plans include a 30-day free trial. Billing starts after trial ends.
                    </p>

                    {/* ── Free trial shortcut ─────────────────────────────── */}
                    <button
                      type="button"
                      onClick={goTrialStep3}
                      className="group flex items-center justify-between w-full px-4 py-3 rounded-xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/70 hover:bg-emerald-500/10 transition-all duration-150"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 shrink-0">
                          <Gift size={15} className="text-emerald-400" />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-emerald-400">Try free for 1 month</p>
                          <p className="text-[11px] text-white/35 leading-tight">Start as Solo · No credit card · Upgrade anytime</p>
                        </div>
                      </div>
                      <ChevronRight size={15} className="text-emerald-400/60 group-hover:text-emerald-400 transition-colors duration-150 shrink-0" />
                    </button>

                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => { setError(''); setStep(1); }}
                        className="flex-1 py-2.5 rounded-md border border-white/10 text-sm font-semibold text-white/50 hover:text-white hover:border-white/20 transition-colors duration-150"
                      >
                        Back
                      </button>
                      <button
                        onClick={goStep3}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 text-white font-semibold text-sm py-2.5 rounded-md transition-colors duration-150"
                      >
                        Continue <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Step 3: Account details ──────────────────────────────── */}
              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
                  <form onSubmit={handleSubmit}>
                    {/* Anti-spam: honeypot field — hidden from real users, bots fill it */}
                    <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, pointerEvents: 'none', tabIndex: -1 } as React.CSSProperties} aria-hidden="true">
                      <input
                        type="text"
                        name="_hp"
                        tabIndex={-1}
                        autoComplete="off"
                        defaultValue=""
                      />
                    </div>
                    <div className="flex flex-col gap-4">
                      {/* Full name */}
                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">Full Name</label>
                        <div className="relative">
                          <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Darren Walsh"
                            autoComplete="name"
                            autoFocus
                            required
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">Email Address</label>
                        <div className="relative">
                          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com.au"
                            autoComplete="email"
                            required
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">Password</label>
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
                        {password.length > 0 && (
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 px-0.5">
                            <StrengthRow ok={strength.length} label="8+ characters" />
                            <StrengthRow ok={strength.letter} label="1 letter" />
                            <StrengthRow ok={strength.number} label="1 number" />
                            <StrengthRow ok={strength.symbol} label="1 symbol" />
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => { setError(''); setTrialOnly(false); setStep(2); }}
                          className="flex-1 py-2.5 rounded-md border border-white/10 text-sm font-semibold text-white/50 hover:text-white hover:border-white/20 transition-colors duration-150"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-md transition-colors duration-150"
                        >
                          {loading ? (
                            <span className="flex items-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Creating…
                            </span>
                          ) : (
                            <>Start Free Trial <ChevronRight size={15} /></>
                          )}
                        </button>
                      </div>

                      <p className="text-center text-xs text-white/35">
                        Already have an account?{' '}
                        <Link to="/login" className="text-primary hover:text-orange-400 font-medium transition-colors duration-150">Sign in</Link>
                      </p>
                    </div>
                  </form>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-black/20 border-t border-white/5 text-center">
            <p className="text-xs text-white/25">
              IWILLBUILD Pty Ltd &mdash; By signing up you agree to our Terms of Service
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-white/30 hover:text-primary transition-colors duration-150">
            &larr; Back to home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
