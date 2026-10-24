import { useEffect, useState } from 'react';
import {
  getAppleProduct,
  manageAppleSubscription,
  purchaseAppleSubscription,
  restoreAppleSubscription,
  type AppleProduct,
} from '@/lib/apple-store';
import { isNativeApp, openExternalUrl, WEB_PORTAL_URL } from '@/lib/native-routing';
import { invalidateSubscriptionCache } from '@/lib/useSubscriptionGate';

interface AppleSubscribeCardProps {
  onSubscriptionActivated?: () => void;
}

const AUSTRALIAN_MONTHLY_PRICE = 'A$20.90 AUD / month';
const APPLE_TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

function labelledStorePrice(price: string, currency?: string): string {
  const code = (currency || '').toUpperCase();
  const amount = price.replace(/^(?:US|A)?\$/, '');
  if (code === 'AUD') return `A$${amount} AUD`;
  if (code === 'USD') return `US$${amount} USD`;
  return code ? `${price} ${code}` : price;
}

function storefrontName(countryCode?: string): string {
  const code = (countryCode || '').toUpperCase();
  if (code === 'USA' || code === 'US') return 'United States';
  if (code === 'AUS' || code === 'AU') return 'Australia';
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function productPriceLabel(product: AppleProduct): string {
  const country = storefrontName(product.storefrontCountryCode);
  const amount = labelledStorePrice(product.displayPrice, product.currencyCode);
  return country ? `${amount} / month · ${country} App Store` : `${amount} / month`;
}

function openLegal(url: string) {
  if (isNativeApp) {
    openExternalUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function AppleSubscribeCard({ onSubscriptionActivated }: AppleSubscribeCardProps) {
  const [product, setProduct] = useState<AppleProduct | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const productStorefront = storefrontName(product?.storefrontCountryCode);
  const usesAustralianStorefront = ['AU', 'AUS'].includes((product?.storefrontCountryCode || '').toUpperCase());

  useEffect(() => {
    let cancelled = false;
    getAppleProduct()
      .then((next) => {
        if (!cancelled) setProduct(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The App Store subscription is not available yet.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    const purchaseProduct = product;
    if (!purchaseProduct) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await purchaseAppleSubscription();
      if (result.status === 'purchased') {
        setProduct((current) => current ? { ...current, subscribed: true } : current);
        setNotice(`Subscribed at ${productPriceLabel(purchaseProduct)}. Apple manages renewal and cancellation.`);
        invalidateSubscriptionCache();
        onSubscriptionActivated?.();
      } else if (result.status === 'pending') {
        setNotice('Apple is still approving this purchase.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apple could not complete the purchase.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await restoreAppleSubscription();
      setProduct((current) => current ? { ...current, subscribed: result.subscribed } : current);
      if (result.subscribed) {
        invalidateSubscriptionCache();
        onSubscriptionActivated?.();
      }
      setNotice(result.subscribed && product
        ? `Your Apple subscription is restored: ${productPriceLabel(product)}.`
        : result.subscribed
          ? 'Your Apple subscription is restored.'
          : 'This Apple ID has no active IWILLBUILD subscription.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apple could not restore the purchase.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Company plan</p>
      <h2 className="mt-1 text-xl font-black">{product?.displayName || 'IWILLBUILD Company'}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        IWILLBUILD is free until you subscribe. One subscription covers the owner and two workers. Apple handles payment.
      </p>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading the App Store price…</p> : null}
      {product ? (
        <p className="mt-4 text-3xl font-black">{AUSTRALIAN_MONTHLY_PRICE}</p>
      ) : null}
      {product && productStorefront && !usesAustralianStorefront ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          This is the Australian price. Apple will show the price for your {productStorefront} App Store storefront before purchase.
        </p>
      ) : null}
      {product?.subscribed ? <p className="mt-3 text-sm font-semibold text-emerald-700">This Apple ID is already subscribed.</p> : null}
      {notice ? <p className="mt-3 text-sm text-slate-700">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-4 text-sm leading-6">
        <a
          href={APPLE_TERMS_URL}
          className="font-semibold text-violet-700 underline"
          onClick={(event) => {
            event.preventDefault();
            openLegal(APPLE_TERMS_URL);
          }}
        >
          Terms of Use
        </a>
        {' · '}
        <a
          href={`${WEB_PORTAL_URL}/privacy`}
          className="font-semibold text-violet-700 underline"
          onClick={(event) => {
            event.preventDefault();
            openLegal(`${WEB_PORTAL_URL}/privacy`);
          }}
        >
          Privacy Policy
        </a>
      </p>
      <div className="mt-5 grid gap-2">
        <button
          type="button"
          disabled={busy || loading || !product || product.subscribed}
          onClick={() => void subscribe()}
          className="min-h-[48px] rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Please wait…' : product ? `Subscribe — ${AUSTRALIAN_MONTHLY_PRICE}` : 'Subscribe'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void restore()}
          className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold"
        >
          Restore purchases
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void manageAppleSubscription().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not open Apple subscription settings.'))}
          className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold"
        >
          Manage / cancel Apple subscription
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Apple handles cancellation. This opens your Apple subscription settings, where you can cancel renewal. Deleting your IWILLBUILD account does not cancel an Apple subscription.
      </p>
      <p className="mt-4 text-[11px] leading-5 text-slate-500">
        Payment is charged to your Apple ID. The plan renews each month unless you cancel at least 24 hours before the period ends. Cancel and restore from Apple Settings.
      </p>
    </section>
  );
}
