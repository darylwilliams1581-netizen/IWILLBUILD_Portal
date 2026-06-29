/**
 * Checkout Cancel Page
 *
 * Displayed when user cancels Stripe checkout.
 * No payment was made.
 *
 * URL: /checkout/cancel
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';

import { clearFunnelSession, getCheckoutSnapshot } from '@/lib/analytics/funnel-session';
import { track } from '@/lib/analytics/track';

export default function CheckoutCancel() {
  const { t } = useTranslation();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const snapshot = getCheckoutSnapshot();
    track('airo.website.stripe.checkout_cancel', 'action', 'checkout_cancel', {
      page_path: window.location.pathname,
      ...(snapshot ?? {}),
    });
    clearFunnelSession();
  }, []);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Helmet>
        <title>Checkout Cancelled — IWILLBUILD</title>
        <meta name="description" content="Your checkout was cancelled. No payment was made." />
        <link rel="canonical" href="https://iwillbuild.com/checkout/cancel" />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Checkout Cancelled — IWILLBUILD" />
        <meta property="og:description" content="Your checkout was cancelled. No payment was made." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/checkout/cancel" />
        <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
      </Helmet>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {/* Cancel Icon */}
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('stripe.payment_cancelled_title')}</h1>

        <p className="text-gray-600 mb-6">
          {t('stripe.payment_cancelled_message')}
        </p>

        <div className="space-y-3">
          <Link
            to="/"
            className="block w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {t('stripe.btn_continue_shopping')}
          </Link>

          <Link
            to="/"
            className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {t('stripe.btn_go_home')}
          </Link>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          {t('stripe.need_help_text')}{' '}
          <a href="mailto:support@example.com" className="text-blue-600 hover:underline">
            {t('stripe.contact_support_link')}
          </a>
        </p>
      </div>
    </div>
  );
}
