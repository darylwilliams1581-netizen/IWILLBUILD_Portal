/**
 * /billing — Subscription & billing management page.
 * Shows current plan, trial status, and upgrade options.
 * Accessible to admin/owner of a company.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  CreditCard, CheckCircle2, AlertTriangle, Clock, Zap,
  Users, User, Crown, ArrowRight, Loader2, RefreshCw,
  ShieldCheck, XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import PortalSidebar from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  status: 'active' | 'trial' | 'trial_expired' | 'cancelled' | 'past_due' | 'no_company';
  plan: string;
  trialEndsAt: string | null;
  daysLeft: number | null;
}

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    price: 19,
    period: '/mo',
    maxUsers: 1,
    features: ['1 user', 'All core modules', 'Jobs, Fleet, Forms', 'Dazza AI', 'Email support'],
    icon: User,
    highlight: false,
  },
  {
    id: 'team',
    name: 'Team',
    price: 79,
    period: '/mo',
    maxUsers: 10,
    features: ['Up to 10 users', 'All core modules', 'Jobs, Fleet, Forms', 'Dazza AI + Annette', 'Priority support'],
    icon: Users,
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 149,
    period: '/mo',
    maxUsers: 20,
    features: ['Up to 20 users', 'All core modules', 'Jobs, Fleet, Forms', 'Dazza AI + Annette', 'Dedicated support'],
    icon: Zap,
    highlight: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    period: '',
    maxUsers: 999,
    features: ['Unlimited users', 'All core modules', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee'],
    icon: Crown,
    highlight: false,
  },
] as const;

type PlanId = typeof PLANS[number]['id'];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, daysLeft }: { status: string; daysLeft: number | null }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
        <ShieldCheck size={12} /> Active
      </span>
    );
  }
  if (status === 'trial') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
        <Clock size={12} /> Trial — {daysLeft ?? 0} day{daysLeft !== 1 ? 's' : ''} left
      </span>
    );
  }
  if (status === 'trial_expired') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
        <XCircle size={12} /> Trial Expired
      </span>
    );
  }
  if (status === 'past_due') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
        <AlertTriangle size={12} /> Payment Past Due
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
        <XCircle size={12} /> Cancelled
      </span>
    );
  }
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { isAdmin, isOwner } = usePermissions();
  const [searchParams] = useSearchParams();

  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const paymentSuccess = searchParams.get('success') === '1';
  const paymentCancelled = searchParams.get('cancelled') === '1';

  useEffect(() => {
    void fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/subscription/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as SubscriptionInfo;
        setSubInfo(data);
      }
    } catch { /* silent */ }
    setLoading(false);
  }

  async function handleSubscribe(planId: PlanId) {
    if (planId === 'enterprise') {
      window.location.href = 'mailto:hello@iwillbuild.com?subject=Enterprise Plan Enquiry';
      return;
    }
    setCheckoutLoading(planId);
    setError('');
    try {
      const res = await fetch('/api/subscription/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout. Please try again.');
        setCheckoutLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Something went wrong. Please try again.');
      setCheckoutLoading(null);
    }
  }

  const currentPlanId = subInfo?.plan ?? 'trial';
  const isActive = subInfo?.status === 'active';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Helmet>
        <title>Billing & Subscription — IWILLBUILD Portal</title>
        <meta name="description" content="Manage your IWILLBUILD subscription plan, trial status, and billing details." />
        <link rel="canonical" href="https://iwillbuild.com/billing" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-heading font-black text-2xl text-slate-900">Billing & Subscription</h1>
            <p className="text-sm text-slate-500 mt-1">Manage your plan and payment details</p>
          </div>

          {/* Payment success / cancelled banners */}
          {paymentSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6"
            >
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Subscription activated!</p>
                <p className="text-xs text-emerald-600">Your plan is now active. Welcome aboard.</p>
              </div>
            </motion.div>
          )}
          {paymentCancelled && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">Payment was cancelled. No charges were made.</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
              <AlertTriangle size={18} className="text-red-600 shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Current plan card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Plan</p>
                {loading ? (
                  <div className="h-7 w-32 bg-slate-100 rounded animate-pulse" />
                ) : (
                  <div className="flex items-center gap-3">
                    <h2 className="font-heading font-black text-xl text-slate-900 capitalize">
                      {currentPlanId === 'trial' ? 'Free Trial' : currentPlanId}
                    </h2>
                    {subInfo && <StatusBadge status={subInfo.status} daysLeft={subInfo.daysLeft} />}
                  </div>
                )}
                {subInfo?.trialEndsAt && subInfo.status === 'trial' && (
                  <p className="text-xs text-slate-500 mt-1">
                    Trial ends {new Date(subInfo.trialEndsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
              <button
                onClick={fetchStatus}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                title="Refresh status"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {/* Trial expiry warning */}
            {subInfo?.status === 'trial' && (subInfo.daysLeft ?? 14) <= 5 && (
              <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800 font-medium">
                  Your trial expires in {subInfo.daysLeft} day{subInfo.daysLeft !== 1 ? 's' : ''}. Subscribe below to keep access.
                </p>
              </div>
            )}
            {subInfo?.status === 'trial_expired' && (
              <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <XCircle size={14} className="text-red-600 shrink-0" />
                <p className="text-xs text-red-800 font-medium">
                  Your trial has expired. Subscribe to a plan below to restore access.
                </p>
              </div>
            )}
            {subInfo?.status === 'past_due' && (
              <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                <p className="text-xs text-red-800 font-medium">
                  Your last payment failed. Please update your payment method to avoid losing access.
                </p>
              </div>
            )}
          </div>

          {/* Plan cards */}
          {(!isActive || isOwner) && (
            <>
              <h2 className="font-heading font-bold text-base text-slate-800 mb-4">
                {isActive ? 'Change Plan' : 'Choose a Plan'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {PLANS.map((plan) => {
                  const Icon = plan.icon;
                  const isCurrent = isActive && currentPlanId === plan.id;
                  const isLoading = checkoutLoading === plan.id;

                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`relative flex flex-col bg-white rounded-2xl border-2 p-5 shadow-sm transition-all duration-150 ${
                        plan.highlight
                          ? 'border-primary shadow-orange-100'
                          : isCurrent
                          ? 'border-emerald-400'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {plan.highlight && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-primary text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                            Most Popular
                          </span>
                        </div>
                      )}
                      {isCurrent && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                            Current Plan
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mb-3">
                        <div className={`p-1.5 rounded-lg ${plan.highlight ? 'bg-primary/10' : 'bg-slate-100'}`}>
                          <Icon size={14} className={plan.highlight ? 'text-primary' : 'text-slate-500'} />
                        </div>
                        <span className="font-heading font-black text-sm text-slate-900">{plan.name}</span>
                      </div>

                      <div className="mb-4">
                        {plan.price !== null ? (
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-2xl font-black text-slate-900">${plan.price}</span>
                            <span className="text-xs text-slate-400">{plan.period}</span>
                          </div>
                        ) : (
                          <span className="text-lg font-black text-slate-900">Custom</span>
                        )}
                      </div>

                      <ul className="flex flex-col gap-1.5 mb-5 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                            <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isCurrent ? (
                        <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 size={12} /> Active
                        </div>
                      ) : (isAdmin || isOwner) ? (
                        <button
                          onClick={() => void handleSubscribe(plan.id)}
                          disabled={isLoading || !!checkoutLoading}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 ${
                            plan.highlight
                              ? 'bg-primary hover:bg-orange-600 text-white'
                              : 'bg-slate-900 hover:bg-slate-700 text-white'
                          }`}
                        >
                          {isLoading ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : plan.price === null ? (
                            <>Contact Us <ArrowRight size={13} /></>
                          ) : (
                            <>
                              <CreditCard size={13} />
                              {isActive ? 'Switch Plan' : 'Subscribe'}
                            </>
                          )}
                        </button>
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {/* Active subscription info */}
          {isActive && !isOwner && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h3 className="font-heading font-bold text-base text-slate-900">Subscription Active</h3>
              </div>
              <p className="text-sm text-slate-600">
                Your subscription is active. To change or cancel your plan, contact your account administrator or email{' '}
                <a href="mailto:hello@iwillbuild.com" className="text-primary hover:underline">hello@iwillbuild.com</a>.
              </p>
            </div>
          )}

          {/* Fine print */}
          <p className="text-xs text-slate-400 text-center mt-8">
            All plans billed monthly. Cancel anytime. Prices in AUD and include GST.
            Payments processed securely by Stripe.
          </p>
        </div>
      </main>
    </div>
  );
}
