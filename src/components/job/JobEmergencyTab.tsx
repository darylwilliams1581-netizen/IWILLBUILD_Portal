/**
 * JobEmergencyTab
 *
 * Main tab component for the Emergency section of a job.
 * Shows:
 *  - Active alert banner (if any)
 *  - "Trigger Emergency Beacon" button
 *  - Full alert log with ack/resolve controls
 *  - Offline queue status
 *
 * Runs the DB migration on mount (idempotent).
 */
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  AlertTriangle, Loader2, RefreshCw, WifiOff, Siren,
} from 'lucide-react';
import EmergencyBeaconFlow from './EmergencyBeaconFlow';
import EmergencyAlertLog from './EmergencyAlertLog';
import { type EmergencyAlert } from './emergency-types';
import { useOfflineQueue } from '@/lib/useOfflineQueue';
import type { EmergencyAlertPayload } from './emergency-types';

interface Props {
  jobId: number;
  userRole: string;
}

export default function JobEmergencyTab({ jobId, userRole }: Props) {
  const [alerts,      setAlerts]      = useState<EmergencyAlert[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState('');
  const [showBeacon,  setShowBeacon]  = useState(false);
  const [isOnline,    setIsOnline]    = useState(navigator.onLine);

  // Offline queue — syncs pending alerts when back online
  const { pendingCount } = useOfflineQueue<EmergencyAlertPayload>(
    'emergency-alerts',
    async (payload) => {
      const res = await fetch('/api/emergency-alerts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json() as { ok: boolean; alert: EmergencyAlert };
      // Add synced alert to the list
      setAlerts((prev) => [data.alert, ...prev]);
    },
  );

  // Track online/offline
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Run migration on mount (idempotent — safe to call every time)
  useEffect(() => {
    fetch('/api/migrate-emergency-alerts', { method: 'POST', credentials: 'include' })
      .catch(() => { /* silent */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/emergency-alerts?jobId=${jobId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load alerts');
      const data = await res.json() as { ok: boolean; alerts: EmergencyAlert[] };
      setAlerts(data.alerts ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const activeAlerts = alerts.filter((a) => a.status === 'active');

  function handleSent(alert: EmergencyAlert) {
    setAlerts((prev) => [alert, ...prev]);
    setShowBeacon(false);
  }

  function handleUpdate(updated: EmergencyAlert) {
    setAlerts((prev) => prev.map((a) => a.id === updated.id ? updated : a));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <WifiOff size={15} className="shrink-0 text-amber-600" />
          <span>
            <strong>You are offline.</strong> Emergency alerts will be queued and sent automatically when your connection is restored.
          </span>
        </div>
      )}

      {/* Pending offline queue banner */}
      {pendingCount > 0 && isOnline && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <WifiOff size={15} className="shrink-0 text-amber-600" />
          <span>
            {pendingCount} alert{pendingCount > 1 ? 's' : ''} pending sync from offline queue…
          </span>
          <Loader2 size={13} className="animate-spin ml-auto text-amber-600" />
        </div>
      )}

      {/* Active alert banner */}
      {activeAlerts.length > 0 && (
        <div className="flex items-start gap-3 bg-red-600 rounded-xl px-4 py-3.5 text-white">
          <div className="relative flex h-3 w-3 shrink-0 mt-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </div>
          <div>
            <p className="font-black text-sm">
              {activeAlerts.length} Active Emergency Alert{activeAlerts.length > 1 ? 's' : ''}
            </p>
            <p className="text-red-100 text-xs mt-0.5">
              Scroll down to acknowledge or resolve.
            </p>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-bold text-sm text-slate-700">Emergency Alerts</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {alerts.length} total · {activeAlerts.length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowBeacon(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-black px-4 py-2 rounded-xl transition-colors shadow-sm shadow-red-200"
          >
            <Siren size={14} />
            Emergency Beacon
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle size={20} className="text-red-500" />
          <p className="text-sm text-slate-600">{loadError}</p>
          <button
            onClick={() => void load()}
            className="text-xs text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <EmergencyAlertLog
          alerts={alerts}
          userRole={userRole}
          onUpdate={handleUpdate}
        />
      )}

      {/* Beacon flow modal */}
      <AnimatePresence>
        {showBeacon && (
          <EmergencyBeaconFlow
            jobId={jobId}
            onClose={() => setShowBeacon(false)}
            onSent={handleSent}
            onQueued={() => { setShowBeacon(false); void load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
