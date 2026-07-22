/**
 * ViewOnlyBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent top-of-portal banner for subscription state warnings.
 *
 * STATES HANDLED
 * ──────────────
 * cancel_at_period_end  — amber info banner: "cancels on [date], full access until then"
 *                         + Resume button
 * past_due (in grace)   — amber warning: "payment failed, N days to fix it"
 *                         + Update Payment button
 * trial_expired         — red view-only: "trial ended, subscribe to continue"
 * cancelled             — red view-only: "subscription ended, reactivate"
 * past_due (no grace)   — red view-only: "payment overdue, account view-only"
 * suspended             — red view-only: "account suspended"
 *
 * Renders nothing when subscription is active or loading.
 * Can be soft-dismissed (reappears on next page load).
 */

import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CreditCard, X, RotateCcw, Info } from 'lucide-react';
import { useState } from 'react';
import { useSubscriptionGate } from '@/lib/useSubscriptionGate';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'the end of your billing period';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function ViewOnlyBanner() {
  const { isViewOnly, isCancelScheduled, isPastDueWarning, status, isLoading, currentPeriodEnd, graceDaysLeft } =
    useSubscriptionGate();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed || !status || status === 'active' || status === 'trial' || status === 'no_company') {
    return null;
  }

  // ── Cancel scheduled (full access, informational) ─────────────────────────
  if (isCancelScheduled) {
    return (
      <div
        role="status"
        className="w-full bg-amber-500 text-white px-4 py-3 flex items-start gap-3 z-50 shadow-md"
        style={{ borderBottom: '2px solid rgba(0,0,0,0.12)' }}
      >
        <CalendarClock className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug">
            Your subscription is scheduled to cancel on {fmtDate(currentPeriodEnd)}.
          </p>
          <p className="text-xs mt-0.5 opacity-90 leading-snug">
            You have full access until then. Reactivate any time to keep your subscription.
          </p>
        </div>
        <button
          onClick={() => navigate('/billing')}
          className="shrink-0 flex items-center gap-1.5 bg-white text-amber-700 font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-amber-50 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reactivate
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded hover:bg-amber-400 transition-colors opacity-80 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Past due within grace period (full access, urgent warning) ────────────
  if (isPastDueWarning) {
    const daysText = graceDaysLeft === 1 ? '1 day' : `${graceDaysLeft ?? 'a few'} days`;
    return (
      <div
        role="alert"
        className="w-full bg-amber-600 text-white px-4 py-3 flex items-start gap-3 z-50 shadow-md"
        style={{ borderBottom: '2px solid rgba(0,0,0,0.15)' }}
      >
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug">
            Your last payment failed. Update your payment method within {daysText}.
          </p>
          <p className="text-xs mt-0.5 opacity-90 leading-snug">
            Your account remains fully active during this grace period. After that, it becomes view-only.
          </p>
        </div>
        <button
          onClick={() => navigate('/billing')}
          className="shrink-0 flex items-center gap-1.5 bg-white text-amber-700 font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-amber-50 transition-colors"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Update Payment
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded hover:bg-amber-500 transition-colors opacity-80 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── View-only states ──────────────────────────────────────────────────────
  if (!isViewOnly) return null;

  const viewOnlyMessages: Record<string, { title: string; body: string; cta: string; icon: typeof CreditCard }> = {
    trial_expired: {
      title: 'Your free trial has ended.',
      body: 'Your account is now view-only. You can browse your data and download files, but cannot create or edit anything.',
      cta: 'Subscribe',
      icon: CreditCard,
    },
    cancelled: {
      title: 'Your subscription has ended. Your account is now view-only.',
      body: 'Your records are still here if you choose to come back. Reactivate your subscription to restore full access.',
      cta: 'Reactivate',
      icon: RotateCcw,
    },
    past_due: {
      title: 'Your subscription payment is overdue.',
      body: 'Your account is now view-only. Update your payment method to restore full access.',
      cta: 'Update Payment',
      icon: CreditCard,
    },
    suspended: {
      title: 'Your account has been suspended.',
      body: 'Your account is now view-only. Contact support or subscribe to restore access.',
      cta: 'Go to Billing',
      icon: Info,
    },
  };

  const msg = viewOnlyMessages[status ?? ''] ?? {
    title: 'Your subscription is inactive.',
    body: 'Your account is now view-only. Subscribe to continue creating and editing work.',
    cta: 'Subscribe',
    icon: CreditCard,
  };

  const CtaIcon = msg.icon;

  return (
    <div
      role="alert"
      className="w-full bg-red-600 text-white px-4 py-3 flex items-start gap-3 z-50 shadow-md"
      style={{ borderBottom: '2px solid rgba(0,0,0,0.2)' }}
    >
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug">{msg.title}</p>
        <p className="text-xs mt-0.5 opacity-90 leading-snug">{msg.body}</p>
      </div>
      <button
        onClick={() => navigate('/billing')}
        className="shrink-0 flex items-center gap-1.5 bg-white text-red-700 font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
      >
        <CtaIcon className="h-3.5 w-3.5" />
        {msg.cta}
      </button>
      {/* No dismiss on view-only — user needs to see this */}
    </div>
  );
}
