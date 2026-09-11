import { useNavigate } from "react-router";
import { AlertTriangle, CalendarClock, CreditCard, X, RotateCcw, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSubscriptionGate } from '@/lib/useSubscriptionGate';
import { usePermissions } from '@/lib/usePermissions';

type ViewOnlyBannerProps = {
  variant?: 'desktop' | 'mobile';
};
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'the end of your billing period';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
export default function ViewOnlyBanner({ variant = 'mobile' }: ViewOnlyBannerProps) {
  const {
    isViewOnly,
    isCancelScheduled,
    isPastDueWarning,
    status,
    isLoading,
    currentPeriodEnd,
    graceDaysLeft
  } = useSubscriptionGate();
  const { role } = usePermissions();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const canManageBilling = role === 'owner' || role === 'admin';
  const visible = !isLoading && !dismissed && !!status && status !== 'active' && status !== 'trial' && status !== 'no_company';

  useEffect(() => {
    if (variant !== 'desktop' || !visible) {
      if (variant === 'desktop') document.documentElement.style.setProperty('--iwb-banner-h', '0px');
      return;
    }

    const banner = bannerRef.current;
    if (!banner) return;
    const updateHeight = () => {
      document.documentElement.style.setProperty('--iwb-banner-h', `${Math.ceil(banner.getBoundingClientRect().height)}px`);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--iwb-banner-h', '0px');
    };
  }, [variant, visible, status]);

  if (!visible) {
    return null;
  }

  const layoutClass = variant === 'desktop' ? 'hidden md:flex' : 'flex md:hidden';
  const billingAction = (label: string, Icon: typeof CreditCard, colourClass: string) => canManageBilling ? (
    <button onClick={() => navigate('/billing')} className={`shrink-0 flex items-center gap-1.5 bg-white font-semibold text-xs px-3 py-1.5 rounded-md transition-colors ${colourClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  ) : (
    <span className="shrink-0 text-xs font-semibold opacity-95">Contact your company owner</span>
  );

  // ── Cancel scheduled (full access, informational) ─────────────────────────
  if (isCancelScheduled) {
    return <div ref={bannerRef} role="status" className={`w-full bg-amber-500 text-white px-4 py-3 items-start gap-3 z-50 shadow-md ${layoutClass}`} style={{
      borderBottom: '2px solid rgba(0,0,0,0.12)'
    }}>
        <CalendarClock className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug">
            Your subscription is scheduled to cancel on {fmtDate(currentPeriodEnd)}.
          </p>
          <p className="text-xs mt-0.5 opacity-90 leading-snug">
            You have full access until then. Reactivate any time to keep your subscription.
          </p>
        </div>
        {billingAction('Reactivate', RotateCcw, 'text-amber-700 hover:bg-amber-50')}
        <button onClick={() => setDismissed(true)} className="shrink-0 p-1 rounded hover:bg-amber-400 transition-colors opacity-80 hover:opacity-100" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>;
  }

  // ── Past due within grace period (full access, urgent warning) ────────────
  if (isPastDueWarning) {
    const daysText = graceDaysLeft === 1 ? '1 day' : `${graceDaysLeft ?? 'a few'} days`;
    return <div ref={bannerRef} role="alert" className={`w-full bg-amber-600 text-white px-4 py-3 items-start gap-3 z-50 shadow-md ${layoutClass}`} style={{
      borderBottom: '2px solid rgba(0,0,0,0.15)'
    }}>
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug">
            Your last payment failed. Update your payment method within {daysText}.
          </p>
          <p className="text-xs mt-0.5 opacity-90 leading-snug">
            Your account remains fully active during this grace period. After that, it becomes view-only.
          </p>
        </div>
        {billingAction('Update Payment', CreditCard, 'text-amber-700 hover:bg-amber-50')}
        <button onClick={() => setDismissed(true)} className="shrink-0 p-1 rounded hover:bg-amber-500 transition-colors opacity-80 hover:opacity-100" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>;
  }

  // ── View-only states ──────────────────────────────────────────────────────
  if (!isViewOnly) return null;
  const viewOnlyMessages: Record<string, {
    title: string;
    body: string;
    cta: string;
    icon: typeof CreditCard;
  }> = {
    trial_expired: {
      title: 'Your free trial has ended.',
      body: 'Your account is now view-only. You can browse your data and download files, but cannot create or edit anything.',
      cta: 'Subscribe',
      icon: CreditCard
    },
    cancelled: {
      title: 'Your subscription has ended. Your account is now view-only.',
      body: 'Your records are still here if you choose to come back. Reactivate your subscription to restore full access.',
      cta: 'Reactivate',
      icon: RotateCcw
    },
    past_due: {
      title: 'Your subscription payment is overdue.',
      body: 'Your account is now view-only. Update your payment method to restore full access.',
      cta: 'Update Payment',
      icon: CreditCard
    },
    suspended: {
      title: 'Your account has been suspended.',
      body: 'Your account is now view-only. Contact support or subscribe to restore access.',
      cta: 'Go to Billing',
      icon: Info
    }
  };
  const msg = viewOnlyMessages[status ?? ''] ?? {
    title: 'Your subscription is inactive.',
    body: 'Your account is now view-only. Subscribe to continue creating and editing work.',
    cta: 'Subscribe',
    icon: CreditCard
  };
  const CtaIcon = msg.icon;
  return <div ref={bannerRef} role="alert" className={`w-full bg-red-600 text-white px-4 py-3 items-start gap-3 z-50 shadow-md ${layoutClass}`} style={{
    borderBottom: '2px solid rgba(0,0,0,0.2)'
  }}>
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug">{msg.title}</p>
        <p className="text-xs mt-0.5 opacity-90 leading-snug">{msg.body}</p>
      </div>
      {billingAction(msg.cta, CtaIcon, 'text-red-700 hover:bg-red-50')}
      {/* No dismiss on view-only — user needs to see this */}
    </div>;
}
