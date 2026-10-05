import { useEffect, useState } from 'react';
import {
  getAppleProduct,
  manageAppleSubscription,
  purchaseAppleSubscription,
  restoreAppleSubscription,
  type AppleProduct,
} from '@/lib/apple-store';
import { openExternalUrl, WEB_PORTAL_URL } from '@/lib/native-routing';

function labelledStorePrice(price: string, currency?: string): string {
  const code = (currency || '').toUpperCase();
  const amount = price.replace(/^(?:US|A)?\$/, '');
  if (code === 'AUD') return `A$${amount} AUD`;
  if (code === 'USD') return `US$${amount} USD`;
  return code ? `${price} ${code}` : price;
}

function storefrontName(countryCode?: string): string {
  if (!countryCode) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

function productPriceLabel(product: AppleProduct): string {
  const currency = (product.currencyCode || '').toUpperCase();
  const country = storefrontName(product.storefrontCountryCode);
  const amount = `${labelledStorePrice(product.displayPrice, product.currencyCode)}${currency ? ` ${currency}` : ''}`;
  return country ? `${amount} / month · ${country} App Store` : `${amount} / month`;
}

export default function AppleSubscribeCard() {
  const [product, setProduct] = useState<AppleProduct | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
        One company subscription, paid by Apple. This app does not take a card payment.
      </p>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading the App Store price…</p> : null}
      {product ? (
        <p className="mt-4 text-3xl font-black">{productPriceLabel(product)}</p>
      ) : null}
      {product?.subscribed ? <p className="mt-3 text-sm font-semibold text-emerald-700">This Apple ID is already subscribed.</p> : null}
      {notice ? <p className="mt-3 text-sm text-slate-700">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 grid gap-2">
        <button
          type="button"
          disabled={busy || loading || !product || product.subscribed}
          onClick={() => void subscribe()}
          className="min-h-[48px] rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Please wait…' : product ? `Subscribe — ${productPriceLabel(product)}` : 'Subscribe'}
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
          Manage in Apple Settings
        </button>
      </div>
      <p className="mt-4 text-[11px] leading-5 text-slate-500">
        Payment is charged to your Apple ID. The plan renews each month unless you cancel at least 24 hours before the period ends. Cancel and restore from Apple Settings.
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        <button type="button" onClick={() => openExternalUrl(`${WEB_PORTAL_URL}/terms`)} className="underline">Terms</button>
        {' · '}
        <button type="button" onClick={() => openExternalUrl(`${WEB_PORTAL_URL}/privacy`)} className="underline">Privacy</button>
      </p>
    </section>
  );
}
