/**
 * ViewOnlyBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a persistent banner when the company is in view-only mode
 * (trial_expired, past_due, cancelled, suspended).
 *
 * The banner is sticky at the top of the portal content area and links
 * directly to the Billing page so users can subscribe immediately.
 *
 * Usage: render inside the portal layout, below the sidebar/header.
 * The banner renders nothing when the subscription is active or loading.
 */

import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CreditCard, X } from 'lucide-react';
import { useState } from 'react';
import { useSubscriptionGate } from '@/lib/useSubscriptionGate';

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  trial_expired: {
    title: 'Your free trial has ended.',
    body: 'Your account is now view-only. You can browse your data and download files, but cannot create or edit anything until you subscribe.',
  },
  past_due: {
    title: 'Your subscription payment is overdue.',
    body: 'Your account is now view-only. Update your payment method to restore full access.',
  },
  cancelled: {
    title: 'Your subscription has been cancelled.',
    body: 'Your account is now view-only. Subscribe again to continue creating and editing work.',
  },
  suspended: {
    title: 'Your account has been suspended.',
    body: 'Your account is now view-only. Contact support or subscribe to restore access.',
  },
};

export default function ViewOnlyBanner() {
  const { isViewOnly, status, isLoading } = useSubscriptionGate();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !isViewOnly || dismissed || !status) return null;

  const msg = STATUS_MESSAGES[status] ?? {
    title: 'Your subscription is inactive.',
    body: 'Your account is now view-only. Subscribe to continue creating and editing work.',
  };

  return (
    <div
      role="alert"
      className="w-full bg-amber-500 text-white px-4 py-3 flex items-start gap-3 z-50 shadow-md"
      style={{ borderBottom: '2px solid rgba(0,0,0,0.15)' }}
    >
      {/* Icon */}
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug">{msg.title}</p>
        <p className="text-xs mt-0.5 opacity-90 leading-snug">{msg.body}</p>
      </div>

      {/* Subscribe CTA */}
      <button
        onClick={() => navigate('/billing')}
        className="shrink-0 flex items-center gap-1.5 bg-white text-amber-700 font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-amber-50 transition-colors"
      >
        <CreditCard className="h-3.5 w-3.5" />
        Subscribe
      </button>

      {/* Dismiss (soft — banner reappears on next page load) */}
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 rounded hover:bg-amber-400 transition-colors opacity-80 hover:opacity-100"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
