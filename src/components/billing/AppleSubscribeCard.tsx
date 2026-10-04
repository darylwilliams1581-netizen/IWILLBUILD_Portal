import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  getAppleProducts,
  manageAppleSubscription,
  purchaseAppleSubscription,
  restoreAppleSubscription,
  type AppleProduct,
} from '@/lib/apple-store';

export default function AppleSubscribeCard() {
  const [products, setProducts] = useState<AppleProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAppleProducts()
      .then((next) => {
        if (!cancelled) {
          setProducts(next.sort((a, b) => a.seatCount - b.seatCount));
          setSelectedProductId(next.find((item) => item.subscribed)?.id ?? next[0]?.id ?? '');
        }
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
    const selected = products.find((item) => item.id === selectedProductId);
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await purchaseAppleSubscription(selected.id);
      if (result.status === 'purchased') {
        setProducts((current) => current.map((item) => ({ ...item, subscribed: item.id === result.productId })));
        setNotice(`Apple updated your plan to ${selected.seatCount} seat${selected.seatCount === 1 ? '' : 's'}. Apple manages renewal and cancellation.`);
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
      setProducts((current) => current.map((item) => ({ ...item, subscribed: item.id === result.productId })));
      if (result.productId) setSelectedProductId(result.productId);
      setNotice(result.subscribed ? 'Your Apple subscription is restored.' : 'This Apple ID has no active IWILLBUILD subscription.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apple could not restore the purchase.');
    } finally {
      setBusy(false);
    }
  }

  const selectedProduct = products.find((item) => item.id === selectedProductId) ?? null;
  const currentProduct = products.find((item) => item.subscribed) ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Company plan</p>
      <h2 className="mt-1 text-xl font-black">IWILLBUILD Company</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Choose a monthly Apple subscription for the number of people in your company. The Owner manages team access; Apple bills and manages the subscription.
      </p>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading the App Store price…</p> : null}
      {products.length > 0 ? <div className="mt-4 grid max-h-96 gap-2 overflow-y-auto">
        {products.map((item) => <button
          key={item.id}
          type="button"
          onClick={() => setSelectedProductId(item.id)}
          aria-pressed={selectedProductId === item.id}
          className={`flex min-h-[56px] items-center justify-between rounded-xl border px-4 py-3 text-left ${selectedProductId === item.id ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-600' : 'border-slate-200 bg-white'}`}
        >
          <span>
            <span className="block text-sm font-bold">{item.seatCount} seat{item.seatCount === 1 ? '' : 's'}{item.subscribed ? ' · Current plan' : ''}</span>
            <span className="block text-xs text-slate-500">{item.displayName}</span>
          </span>
          <span className="text-sm font-bold">{item.displayPrice}<span className="font-medium text-slate-500"> / month</span></span>
        </button>)}
      </div> : null}
      {currentProduct ? <p className="mt-3 text-sm font-semibold text-emerald-700">Current Apple plan: {currentProduct.seatCount} seat{currentProduct.seatCount === 1 ? '' : 's'}.</p> : null}
      {notice ? <p className="mt-3 text-sm text-slate-700">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 grid gap-2">
        <button
          type="button"
          disabled={busy || loading || !selectedProduct || selectedProduct.subscribed}
          onClick={() => void subscribe()}
          className="min-h-[48px] rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Please wait…' : currentProduct ? `Change to ${selectedProduct?.seatCount ?? ''} seats` : 'Subscribe with Apple'}
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
        Payment is charged to your Apple ID and renews monthly. Apple applies any upgrade or downgrade and manages cancellation in Apple Settings. Your selected tier sets the maximum number of team seats.
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        <Link to="/terms" className="underline">Terms</Link>
        {' · '}
        <Link to="/privacy" className="underline">Privacy</Link>
      </p>
    </section>
  );
}
