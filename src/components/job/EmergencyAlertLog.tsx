/**
 * EmergencyAlertLog
 *
 * Displays the audit trail of emergency alerts for a job.
 * Shows: who triggered, when, reason, note, location, status, ack/resolve info.
 * Admins/supervisors can acknowledge or resolve active alerts.
 */
import { useState } from 'react';
import {
  AlertTriangle, MapPin, MapPinOff, CheckCircle2,
  Clock, User, Loader2, WifiOff, ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { type EmergencyAlert, reasonLabel, reasonEmoji } from './emergency-types';

interface Props {
  alerts: EmergencyAlert[];
  userRole: string;
  onUpdate: (updated: EmergencyAlert) => void;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600" />
        </span>
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
      <CheckCircle2 size={10} />
      Resolved
    </span>
  );
}

export default function EmergencyAlertLog({ alerts, userRole, onUpdate }: Props) {
  const [actioning, setActioning] = useState<number | null>(null);
  const [actionError, setActionError] = useState<Record<number, string>>({});

  const canAction = userRole === 'admin' || userRole === 'owner' || userRole === 'supervisor';

  async function doAction(alertId: number, action: 'acknowledge' | 'resolve') {
    setActioning(alertId);
    setActionError((prev) => ({ ...prev, [alertId]: '' }));
    try {
      const res = await fetch(`/api/emergency-alerts/${alertId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed');
      }
      const data = await res.json() as { ok: boolean; alert: EmergencyAlert };
      onUpdate(data.alert);
    } catch (err) {
      setActionError((prev) => ({
        ...prev,
        [alertId]: err instanceof Error ? err.message : 'Action failed',
      }));
    } finally {
      setActioning(null);
    }
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-slate-200">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
          <ShieldCheck size={22} className="text-slate-400" />
        </div>
        <p className="font-bold text-sm text-slate-600">No emergency alerts</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          All clear. Emergency alerts will appear here if triggered.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={`bg-white rounded-xl border overflow-hidden ${
              alert.status === 'active'
                ? 'border-red-200 shadow-sm shadow-red-100'
                : 'border-slate-200'
            }`}
          >
            {/* Alert header */}
            <div className={`flex items-start justify-between gap-3 px-4 py-3 ${
              alert.status === 'active' ? 'bg-red-50' : 'bg-slate-50'
            }`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl leading-none">{reasonEmoji(alert.reason)}</span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-800">
                      {reasonLabel(alert.reason)}
                    </span>
                    <StatusBadge status={alert.status} />
                    {alert.offline_queued && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        <WifiOff size={10} />
                        Offline sync
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fmtDateTime(alert.created_at)}
                  </p>
                </div>
              </div>
            </div>

            {/* Alert body */}
            <div className="px-4 py-3 flex flex-col gap-2">
              {/* Initiated by */}
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <User size={12} className="text-slate-400 shrink-0" />
                <span>
                  Triggered by <strong>{alert.initiated_by_name}</strong>
                </span>
              </div>

              {/* Note */}
              {alert.note && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-700 italic">
                  "{alert.note}"
                </div>
              )}

              {/* Location */}
              <div className="flex items-center gap-2 text-xs">
                {alert.location_denied ? (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <MapPinOff size={12} className="shrink-0" />
                    Location permission denied at time of alert
                  </span>
                ) : alert.lat !== null && alert.lng !== null ? (
                  <a
                    href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-blue-600 hover:underline"
                  >
                    <MapPin size={12} className="shrink-0" />
                    View on map
                    {alert.location_accuracy_m !== null && (
                      <span className="text-slate-400 ml-1">
                        (±{Math.round(Number(alert.location_accuracy_m))}m)
                      </span>
                    )}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <MapPin size={12} className="shrink-0" />
                    No location data
                  </span>
                )}
              </div>

              {/* Acknowledged */}
              {alert.acknowledged_at && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock size={12} className="text-slate-400 shrink-0" />
                  Acknowledged by <strong className="text-slate-700">{alert.acknowledged_by_name}</strong>
                  {' '}at {fmtTime(alert.acknowledged_at)}
                </div>
              )}

              {/* Resolved */}
              {alert.resolved_at && (
                <div className="flex items-center gap-2 text-xs text-green-700">
                  <CheckCircle2 size={12} className="shrink-0" />
                  Resolved by <strong>{alert.resolved_by_name}</strong>
                  {' '}at {fmtTime(alert.resolved_at)}
                </div>
              )}

              {/* Error */}
              {actionError[alert.id] && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  {actionError[alert.id]}
                </p>
              )}

              {/* Action buttons — admin/owner/supervisor only, active alerts only */}
              {canAction && alert.status === 'active' && (
                <div className="flex gap-2 mt-1 pt-2 border-t border-slate-100">
                  {!alert.acknowledged_at && (
                    <button
                      onClick={() => doAction(alert.id, 'acknowledge')}
                      disabled={actioning === alert.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      {actioning === alert.id ? <Loader2 size={11} className="animate-spin" /> : <Clock size={11} />}
                      Acknowledge
                    </button>
                  )}
                  <button
                    onClick={() => doAction(alert.id, 'resolve')}
                    disabled={actioning === alert.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
                  >
                    {actioning === alert.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                    Mark Resolved
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
