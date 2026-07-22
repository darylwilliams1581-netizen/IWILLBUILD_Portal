/**
 * FleetAnalyticsTab
 *
 * Settings tab for fleet session analytics toggles.
 * Shown under Settings → Fleet Analytics (admin/owner only).
 *
 * Toggles:
 *  - Track distance
 *  - Track drive time
 *  - Track max/avg speed
 *  - Enable speeding alerts (+ threshold km/h)
 *  - Enable collision alerts
 */
import { useEffect } from 'react';
import {
  Route, Clock, Gauge, AlertTriangle, Zap,
  Loader2, CheckCircle2, AlertCircle, Info,
} from 'lucide-react';
import { useFleetAnalytics, invalidateFleetAnalyticsCache } from '@/lib/useFleetAnalytics';

interface Props {
  isAdmin: boolean;
}

interface ToggleRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ icon, label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className={`flex items-start justify-between gap-4 py-4 border-b border-slate-100 last:border-0 ${
      disabled ? 'opacity-50 pointer-events-none' : ''
    }`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          checked ? 'bg-primary' : 'bg-slate-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function FleetAnalyticsTab({ isAdmin }: Props) {
  const { settings, loading, saving, error, save, reload } = useFleetAnalytics();

  // Run migration on mount to ensure tables exist
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/migrate-fleet-analytics', { method: 'POST', credentials: 'include' })
      .catch(() => { /* silent */ });
  }, [isAdmin]);

  async function toggle(key: keyof typeof settings, value: boolean) {
    const ok = await save({ [key]: value });
    if (ok) invalidateFleetAnalyticsCache();
  }

  async function updateThreshold(value: number) {
    await save({ speeding_threshold_kmh: value });
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-3 text-sm text-slate-500">
        <Info size={16} className="text-slate-400 shrink-0" />
        Fleet analytics settings are only visible to admins and owners.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-black text-slate-800">Fleet Analytics</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Control which metrics are collected during driving sessions. Disabling a toggle
          stops collection immediately — existing data is preserved.
        </p>
      </div>

      {/* Status bar */}
      {saving && (
        <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
          <Loader2 size={14} className="animate-spin" />
          Saving…
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="shrink-0" />
          {error}
          <button onClick={() => void reload()} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Tracking toggles */}
          <div className="bg-white rounded-xl border border-slate-200 px-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-4 pb-2">
              Data collection
            </p>

            <ToggleRow
              icon={<Clock size={15} className="text-blue-500" />}
              label="Track drive time"
              description="Records total active drive time for each session."
              checked={settings.track_drive_time}
              onChange={(v) => void toggle('track_drive_time', v)}
            />
            <ToggleRow
              icon={<Route size={15} className="text-green-500" />}
              label="Track distance"
              description="Calculates total distance (km) from GPS points."
              checked={settings.track_distance}
              onChange={(v) => void toggle('track_distance', v)}
            />
            <ToggleRow
              icon={<Gauge size={15} className="text-violet-500" />}
              label="Track speed (avg & max)"
              description="Records average and maximum speed in session summary only. Never shown on the live map."
              checked={settings.track_speed}
              onChange={(v) => void toggle('track_speed', v)}
            />
          </div>

          {/* Alert toggles */}
          <div className="bg-white rounded-xl border border-slate-200 px-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-4 pb-2">
              Alerts
            </p>

            <ToggleRow
              icon={<Zap size={15} className="text-amber-500" />}
              label="Speeding alerts"
              description="Highlights sessions where max speed exceeded the threshold."
              checked={settings.enable_speeding_alerts}
              onChange={(v) => void toggle('enable_speeding_alerts', v)}
            />

            {settings.enable_speeding_alerts && (
              <div className="pb-4 pl-11">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Speed threshold (km/h)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={30}
                    max={300}
                    value={settings.speeding_threshold_kmh}
                    onChange={(e) => void updateThreshold(parseInt(e.target.value, 10))}
                    className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-xs text-slate-400">km/h</span>
                </div>
              </div>
            )}

            <ToggleRow
              icon={<AlertTriangle size={15} className="text-red-500" />}
              label="Collision alerts"
              description="Flags sessions with detected collision events (requires device accelerometer)."
              checked={settings.enable_collision_alerts}
              onChange={(v) => void toggle('enable_collision_alerts', v)}
            />
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={15} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">
              <strong className="text-slate-700">No live speed display.</strong>{' '}
              Speed data is only used in session summaries and reports — it is never shown
              on the live map or to drivers during a session.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
