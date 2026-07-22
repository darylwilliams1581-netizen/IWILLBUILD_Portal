/**
 * PushNotificationSettings
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings panel for enabling/disabling PWA push notifications.
 * Handles the full permission + subscription lifecycle:
 *   1. Check browser support
 *   2. Request Notification permission
 *   3. Subscribe via PushManager using VAPID public key
 *   4. POST /api/push/subscribe to save on server
 *   5. DELETE /api/push/subscribe to unsubscribe
 */
import { useState, useEffect } from 'react';
import { Bell, BellOff, BellRing, Loader2, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import { usePermissionExplainer } from '@/lib/usePermissionExplainer';
import PermissionExplainerModal from '@/components/PermissionExplainerModal';

type PermState = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushNotificationSettings() {
  const [permState, setPermState] = useState<PermState>('loading');
  const [subscribed, setSubscribed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

  const permExplainer = usePermissionExplainer();

  useEffect(() => {
    void init();
  }, []);

  async function init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermState('unsupported');
      return;
    }
    const perm = Notification.permission as NotificationPermission;
    if (perm === 'denied') { setPermState('denied'); return; }
    if (perm === 'granted') {
      setPermState('granted');
      // Check if already subscribed
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch { /* ignore */ }
    } else {
      setPermState('default');
    }
  }

  async function handleEnable() {
    // Show pre-permission explainer if not yet seen
    if (permExplainer.shouldShow('notifications')) {
      setShowExplainer(true);
      return;
    }
    await doEnable();
  }

  async function doEnable() {
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPermState('denied');
        setError('Notification permission was denied. Enable it in your browser settings.');
        setWorking(false);
        return;
      }
      setPermState('granted');

      // 2. Get VAPID public key
      const keyRes = await fetch('/api/push/vapid-key');
      const { publicKey } = await keyRes.json() as { publicKey?: string };
      if (!publicKey) throw new Error('Push notifications not configured on server');

      // 3. Subscribe via PushManager
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 4. Save subscription on server
      const subJson = subscription.toJSON();
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save subscription on server');

      setSubscribed(true);
      setSuccess('Push notifications enabled. You\'ll be notified for job assignments, invoice payments, and form submissions.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable push notifications');
    } finally {
      setWorking(false);
    }
  }

  async function handleDisable() {
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Revoke on server first
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        // Unsubscribe from browser
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setSuccess('Push notifications disabled for this device.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable push notifications');
    } finally {
      setWorking(false);
    }
  }

  if (permState === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 size={14} className="animate-spin" />
        Checking notification status…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Notifications pre-permission explainer */}
      <PermissionExplainerModal
        type="notifications"
        open={showExplainer}
        denied={permState === 'denied'}
        onNotNow={() => {
          permExplainer.markShown('notifications');
          setShowExplainer(false);
        }}
        onEnable={async () => {
          permExplainer.markShown('notifications');
          setShowExplainer(false);
          await doEnable();
        }}
      />
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            subscribed ? 'bg-emerald-50' : 'bg-slate-100'
          }`}>
            {subscribed
              ? <BellRing size={16} className="text-emerald-600" />
              : <BellOff size={16} className="text-slate-400" />
            }
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Push Notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {permState === 'unsupported'
                ? 'Not supported in this browser'
                : permState === 'denied'
                ? 'Blocked — enable in browser settings'
                : subscribed
                ? 'Enabled on this device'
                : 'Disabled on this device'
              }
            </p>
          </div>
        </div>

        {/* Toggle button */}
        {permState !== 'unsupported' && permState !== 'denied' && (
          <button
            onClick={subscribed ? () => void handleDisable() : () => void handleEnable()}
            disabled={working}
            className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 ${
              subscribed
                ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                : 'bg-primary text-white border-primary hover:bg-orange-600'
            }`}
          >
            {working
              ? <Loader2 size={13} className="animate-spin" />
              : subscribed
              ? <BellOff size={13} />
              : <Bell size={13} />
            }
            {working ? 'Working…' : subscribed ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>

      {/* What triggers notifications */}
      {permState !== 'unsupported' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-600">You'll be notified when:</p>
          <ul className="flex flex-col gap-1.5">
            {[
              { icon: '🔧', text: 'A job is assigned to you' },
              { icon: '💰', text: 'An invoice is marked as paid' },
              { icon: '📋', text: 'An external form is submitted' },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-2 text-xs text-slate-500">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Unsupported */}
      {permState === 'unsupported' && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <Smartphone size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Push notifications require a modern browser with service worker support.
            Try Chrome, Edge, or Firefox on desktop, or Chrome on Android.
          </p>
        </div>
      )}

      {/* Denied */}
      {permState === 'denied' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertCircle size={14} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">
            Notifications are blocked by your browser. To enable them, click the lock icon
            in your address bar and allow notifications for this site, then reload the page.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertCircle size={14} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-700">{success}</p>
        </div>
      )}
    </div>
  );
}
