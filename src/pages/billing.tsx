/**
 * /billing — Subscription & billing management page.
 * Shows current plan, trial status, billing actions, and upgrade options.
 * Accessible to admin/owner of a company.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  CreditCard, CheckCircle2, AlertTriangle, Clock, Zap,
  Users, User, Crown, ArrowRight, Loader2, RefreshCw,
  ShieldCheck, XCircle, ExternalLink, Ban, RotateCcw,
  CalendarClock, Receipt, Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PortalSidebar from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  status: 'active' | 'trial' | 'trial_expired' | 'cancelled' | 'past_due' | 'cancel_pending' | 'no_company';
  plan: string;
  trialEndsAt: string | null;
  daysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    price: 19,
    period: '/mo +GST',
    maxUsers: 1,
    features: ['1 user', 'All core modules', 'Jobs, Fleet, Forms', 'Dazza AI', 'Email support'],
    icon: User,
    highlight: false,
  },
  {
    id: 'team',
    name: 'Team',
    price: 79,
    period: '/mo +GST',
    maxUsers: 5,
    features: ['Up to 5 users', 'All core modules', 'Jobs, Fleet, Forms', 'Dazza AI + Health Check', 'Priority support'],
    icon: Users,
    highlight: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 149,
    period: '/mo +GST',
    maxUsers: 10,
    features: ['Up to 10 users', 'All core modules', 'Jobs, Fleet, Forms', 'Dazza AI + Health Check', 'Dedicated support'],
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function planLabel(plan: string): string {
  const map: Record<string, string> = {
    solo: 'Solo', team: 'Team', business: 'Business',
    pro: 'Business', enterprise: 'Enterprise', trial: 'Free Trial', owner: 'Platform Owner',
  };
  return map[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
}

function planPrice(plan: string): string {
  const map: Record<string, string> = {
    solo: '$19/mo', team: '$79/mo', business: '$149/mo', pro: '$149/mo',
    enterprise: 'Custom', trial: 'Free', owner: '—',
  };
  return map[plan] ?? '—';
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, daysLeft }: { status: string; daysLeft: number | null }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
        <ShieldCheck size={12} /> Active
      </span>
    );
  }
  if (status === 'cancel_pending') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
        <CalendarClock size={12} /> Cancelling
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

// ── Cancel confirmation modal ─────────────────────────────────────────────────

function CancelConfirmModal({
  periodEnd,
  onConfirm,
  onClose,
  loading,
}: {
  periodEnd: string | null;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-red-100 rounded-xl">
            <Ban size={18} className="text-red-600" />
          </div>
          <h3 className="font-heading font-black text-lg text-slate-900">Cancel Subscription?</h3>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm text-amber-800 leading-relaxed">
            Your portal will remain <strong>fully active</strong> until the end of the current billing period
            {periodEnd ? ` (${fmtDate(periodEnd)})` : ''}.
            No data will be deleted. You can reactivate at any time before then.
          </p>
        </div>

        <ul className="flex flex-col gap-2 mb-6">
          {[
            'Access continues until billing period ends',
            'All your data is preserved',
            'You can reactivate before the period ends',
            'No immediate charges or refunds',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
              {item}
            </li>
          ))}
        </ul>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Keep Subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
            Yes, Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { isAdmin, isOwner } = usePermissions();
  const [searchParams] = useSearchParams();

  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const paymentSuccess = searchParams.get('success') === '1';
  const paymentCancelled = searchParams.get('cancelled') === '1';

  useEffect(() => { void fetchStatus(); }, []);

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

  async function handleManageBilling() {
    setPortalLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/customer-portal', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not open billing portal. Please try again.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Something went wrong opening the billing portal.');
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleCancelConfirm() {
    setCancelLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/cancel-subscription', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string; currentPeriodEnd?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not cancel subscription. Please try again.');
        return;
      }
      setActionMsg(data.message ?? 'Subscription set to cancel at period end.');
      setShowCancelModal(false);
      await fetchStatus();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleReactivate() {
    setReactivateLoading(true);
    setError('');
    setActionMsg('');
    try {
      const res = await fetch('/api/billing/reactivate-subscription', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not reactivate subscription. Please try again.');
        return;
      }
      setActionMsg(data.message ?? 'Subscription reactivated.');
      await fetchStatus();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setReactivateLoading(false);
    }
  }

  const currentPlanId = subInfo?.plan ?? 'trial';
  const isActive = subInfo?.status === 'active';
  const isCancelPending = subInfo?.status === 'cancel_pending';
  const hasPaidSub = isActive || isCancelPending;
  const canManage = isAdmin || isOwner;

  return (
    <div className="portal-page">
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

          {/* Banners */}
          <AnimatePresence>
            {paymentSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5"
              >
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">Subscription activated!</p>
                  <p className="text-xs text-emerald-600">Your plan is now active. Welcome aboard.</p>
                </div>
              </motion.div>
            )}
            {paymentCancelled && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5"
              >
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">Payment was cancelled. No charges were made.</p>
              </motion.div>
            )}
            {actionMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5"
              >
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800">{actionMsg}</p>
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5"
              >
                <AlertTriangle size={18} className="text-red-600 shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Cancel pending banner ── */}
          {isCancelPending && subInfo?.currentPeriodEnd && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
              <CalendarClock size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">
                  Subscription set to cancel on {fmtDate(subInfo.currentPeriodEnd)}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your portal remains fully active until then. You can reactivate before that date.
                </p>
              </div>
              {canManage && (
                <button
                  onClick={handleReactivate}
                  disabled={reactivateLoading}
                  className="shrink-0 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {reactivateLoading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Reactivate
                </button>
              )}
            </div>
          )}

          {/* ── Current plan card ── */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Plan</p>
                {loading ? (
                  <div className="h-7 w-40 bg-slate-100 rounded animate-pulse" />
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="font-heading font-black text-xl text-slate-900">
                      {planLabel(currentPlanId)}
                    </h2>
                    {subInfo && <StatusBadge status={subInfo.status} daysLeft={subInfo.daysLeft} />}
                  </div>
                )}
              </div>
              <button
                onClick={fetchStatus}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                title="Refresh status"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Billing detail grid */}
            {!loading && subInfo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-50 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Plan</p>
                  <p className="text-sm font-bold text-slate-800">{planLabel(currentPlanId)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Amount</p>
                  <p className="text-sm font-bold text-slate-800">{planPrice(currentPlanId)} +GST</p>
                </div>
                {subInfo.trialEndsAt && subInfo.status === 'trial' && (
                  <div className="bg-slate-50 rounded-xl p-3.5">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Trial Ends</p>
                    <p className="text-sm font-bold text-slate-800">{fmtDate(subInfo.trialEndsAt)}</p>
                  </div>
                )}
                {subInfo.currentPeriodEnd && hasPaidSub && (
                  <div className="bg-slate-50 rounded-xl p-3.5">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
                      {isCancelPending ? 'Access Until' : 'Next Billing Date'}
                    </p>
                    <p className="text-sm font-bold text-slate-800">{fmtDate(subInfo.currentPeriodEnd)}</p>
                  </div>
                )}
                <div className="bg-slate-50 rounded-xl p-3.5">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-bold text-slate-800 capitalize">
                    {subInfo.status === 'cancel_pending' ? 'Cancelling at period end' : subInfo.status.replace('_', ' ')}
                  </p>
                </div>
              </div>
            )}

            {/* Status alerts */}
            {subInfo?.status === 'trial' && (subInfo.daysLeft ?? 14) <= 5 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800 font-medium">
                  Trial expires in {subInfo.daysLeft} day{subInfo.daysLeft !== 1 ? 's' : ''}. Subscribe below to keep access.
                </p>
              </div>
            )}
            {subInfo?.status === 'trial_expired' && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                <XCircle size={14} className="text-red-600 shrink-0" />
                <p className="text-xs text-red-800 font-medium">
                  Your trial has expired. Subscribe to a plan below to restore access.
                </p>
              </div>
            )}
            {subInfo?.status === 'past_due' && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                <p className="text-xs text-red-800 font-medium">
                  Your last payment failed. Update your payment method to avoid losing access.
                </p>
              </div>
            )}

            {/* ── Management action buttons (owner/admin + paid sub only) ── */}
            {canManage && hasPaidSub && (
              <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                {/* Manage Billing — opens Stripe Customer Portal */}
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                  Manage Billing
                  <ExternalLink size={12} className="opacity-60" />
                </button>

                {/* Change Plan — opens Stripe Customer Portal (plan switching configured there) */}
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  Change Plan
                </button>

                {/* Cancel — only show if not already cancelling */}
                {isActive && !isCancelPending && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                  >
                    <Ban size={14} />
                    Cancel Subscription
                  </button>
                )}

                {/* Reactivate — only show if cancelling */}
                {isCancelPending && (
                  <button
                    onClick={handleReactivate}
                    disabled={reactivateLoading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {reactivateLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    Reactivate Subscription
                  </button>
                )}
              </div>
            )}

            {/* Past due — direct to portal */}
            {canManage && subInfo?.status === 'past_due' && (
              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  Update Payment Method
                  <ExternalLink size={12} className="opacity-60" />
                </button>
              </div>
            )}
          </div>

          {/* ── Plan cards ── */}
          {(!hasPaidSub || isOwner) && (
            <>
              <h2 className="font-heading font-bold text-base text-slate-800 mb-4">
                {hasPaidSub ? 'Change Plan' : 'Choose a Plan'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {PLANS.map((plan) => {
                  const Icon = plan.icon;
                  const isCurrent = hasPaidSub && currentPlanId === plan.id;
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
                      {plan.highlight && !isCurrent && (
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
                      ) : canManage ? (
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
                              {hasPaidSub ? 'Switch Plan' : 'Subscribe'}
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

          {/* Active sub — non-admin view */}
          {hasPaidSub && !canManage && (
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
            All prices exclude GST. Billed monthly in AUD. Cancel anytime.
            Payments processed securely by Stripe.
          </p>
        </div>
      </main>

      {/* Cancel confirmation modal */}
      <AnimatePresence>
        {showCancelModal && (
          <CancelConfirmModal
            periodEnd={subInfo?.currentPeriodEnd ?? null}
            onConfirm={handleCancelConfirm}
            onClose={() => setShowCancelModal(false)}
            loading={cancelLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
