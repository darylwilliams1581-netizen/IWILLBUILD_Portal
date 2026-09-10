/**
 * ViewOnlyBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a subscription-state banner in two variants:
 *
 *   variant="desktop"  — rendered INSIDE DesktopTopBar (fixed, md+).
 *                        Sits as a second row below the topbar content row.
 *                        Sets --iwb-banner-h on <body> so .lg-portal
 *                        padding-top grows to accommodate it.
 *                        Hidden on mobile (DesktopTopBar is already hidden).
 *
 *   variant="mobile"   — rendered in normal document flow via RootLayout.
 *                        Only visible below md breakpoint (md:hidden).
 *                        No CSS-var side-effect needed — it's in normal flow.
 *
 * Role-aware CTA:
 *   owner / admin  → navigate to /billing
 *   member / viewer → plain text "Contact your company owner"
 */

import { useNavigate } from "react-router";
import { AlertTriangle, CalendarClock, CreditCard, X, RotateCcw, Info } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSubscriptionGate } from '@/lib/useSubscriptionGate';
import { usePermissions } from '@/lib/usePermissions';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'the end of your billing period';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface ViewOnlyBannerProps {
  /** "desktop" — fixed second row inside DesktopTopBar; sets --iwb-banner-h.
   *  "mobile"  — normal-flow, hidden on md+. */
  variant?: 'desktop' | 'mobile';
}

export default function ViewOnlyBanner({ variant = 'mobile' }: ViewOnlyBannerProps) {
  const {
    isViewOnly,
    isCancelScheduled,
    isPastDueWarning,
    status,
    isLoading,
    currentPeriodEnd,
    graceDaysLeft,
  } = useSubscriptionGate();

  const { isOwner, isAdmin } = usePermissions();
  const canManageBilling = isOwner || isAdmin;

  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // ── Visibility gate ───────────────────────────────────────────────────────
  const isVisible =
    !isLoading &&
    !dismissed &&
    !!status &&
    status !== 'active' &&
    status !== 'trial' &&
    status !== 'no_company';

  // ── CSS variable side-effect (desktop variant only) ───────────────────────
  // Sets --iwb-banner-h on <body> so .lg-portal padding-top grows to fit.
  useEffect(() => {
    if (variant !== 'desktop') return;
    if (typeof document === 'undefined') return;

    function updateVar() {
      const h =
        isVisible && bannerRef.current
          ? bannerRef.current.getBoundingClientRect().height
          : 0;
      document.body.style.setProperty('--iwb-banner-h', `${h}px`);
    }

    updateVar();

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateVar) : null;
    if (ro && bannerRef.current) ro.observe(bannerRef.current);

    return () => {
      ro?.disconnect();
      if (typeof document !== 'undefined') {
        document.body.style.setProperty('--iwb-banner-h', '0px');
      }
    };
  }, [variant, isVisible]);

  if (!isVisible) return null;

  // ── Wrapper classes ───────────────────────────────────────────────────────
  // desktop: always shown (DesktopTopBar hides itself on mobile)
  // mobile:  only shown below md
  const wrapperBase = 'w-full flex items-center gap-3 px-4 py-2';
  const wrapperClass =
    variant === 'desktop'
      ? wrapperBase
      : `${wrapperBase} md:hidden shadow-md`;

  // ── CTA component ─────────────────────────────────────────────────────────
  function BillingCta({
    label,
    icon: Icon,
    textColor,
    hoverBg,
  }: {
    label: string;
    icon: typeof CreditCard;
    textColor: string;
    hoverBg: string;
  }) {
    if (!canManageBilling) {
      return (
        <span className="shrink-0 text-xs font-semibold opacity-90 whitespace-nowrap">
          Contact your company owner
        </span>
      );
    }
    return (
      <button
        onClick={() => navigate('/billing')}
        className={`shrink-0 flex items-center gap-1.5 bg-white font-semibold text-xs px-3 py-1.5 rounded-md transition-colors ${textColor} ${hoverBg}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }

  // ── Cancel scheduled (amber, informational) ───────────────────────────────
  if (isCancelScheduled) {
    return (
      <div
        ref={bannerRef}
        role="status"
        className={`${wrapperClass} bg-amber-500 text-white`}
        style={{ borderBottom: `1px solid hsl(var(--banner-border-amber))` }}
      >
        <CalendarClock className="h-4 w-4 shrink-0" />
        <p className="flex-1 min-w-0 font-semibold text-xs leading-snug">
          Subscription cancels {fmtDate(currentPeriodEnd)}. Full access until then.
        </p>
        <BillingCta
          label="Reactivate"
          icon={RotateCcw}
          textColor="text-amber-700"
          hoverBg="hover:bg-amber-50"
        />
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded hover:bg-amber-400 transition-colors opacity-80 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Past due within grace period (amber-600, urgent) ─────────────────────
  if (isPastDueWarning) {
    const daysText = graceDaysLeft === 1 ? '1 day' : `${graceDaysLeft ?? 'a few'} days`;
    return (
      <div
        ref={bannerRef}
        role="alert"
        className={`${wrapperClass} bg-amber-600 text-white`}
        style={{ borderBottom: `1px solid hsl(var(--banner-border-amber-dark))` }}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="flex-1 min-w-0 font-semibold text-xs leading-snug">
          Payment failed — update within {daysText} to keep full access.
        </p>
        <BillingCta
          label="Update Payment"
          icon={CreditCard}
          textColor="text-amber-700"
          hoverBg="hover:bg-amber-50"
        />
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded hover:bg-amber-500 transition-colors opacity-80 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── View-only states (red) ────────────────────────────────────────────────
  if (!isViewOnly) return null;

  const viewOnlyMessages: Record<string, {
    title: string;
    cta: string;
    icon: typeof CreditCard;
  }> = {
    trial_expired: {
      title: 'Your free trial has ended — account is now view-only.',
      cta: 'Subscribe',
      icon: CreditCard,
    },
    cancelled: {
      title: 'Subscription ended — account is now view-only.',
      cta: 'Reactivate',
      icon: RotateCcw,
    },
    past_due: {
      title: 'Payment overdue — account is now view-only.',
      cta: 'Update Payment',
      icon: CreditCard,
    },
    suspended: {
      title: 'Account suspended — view-only access only.',
      cta: 'Go to Billing',
      icon: Info,
    },
  };

  const msg = viewOnlyMessages[status ?? ''] ?? {
    title: 'Subscription inactive — account is now view-only.',
    cta: 'Subscribe',
    icon: CreditCard,
  };

  return (
    <div
      ref={bannerRef}
      role="alert"
      className={`${wrapperClass} bg-red-600 text-white`}
      style={{ borderBottom: `1px solid hsl(var(--banner-border-red))` }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="flex-1 min-w-0 font-semibold text-xs leading-snug">{msg.title}</p>
      <BillingCta
        label={msg.cta}
        icon={msg.icon}
        textColor="text-red-700"
        hoverBg="hover:bg-red-50"
      />
      {/* No dismiss on view-only — user must always see this */}
    </div>
  );
}
