import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Car, X, AlertCircle, Loader2, CheckCircle2, MapPin } from 'lucide-react';

interface Vehicle {
  id: number;
  name: string;
  type: string;
  make_model: string | null;
  rego: string | null;
  rego_not_applicable: boolean;
  status: string;
  current_driver: string | null;
}

interface Props {
  onClose: () => void;
  onStarted: (session: ActiveSession) => void;
}

export interface ActiveSession {
  id: number;
  fleet_asset_id: number;
  asset_name: string;
  driver_name: string;
  start_at: string;
  status: string;
  source: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
//
// Design decision (Build 8 fix):
//   The modal's ONLY job is vehicle selection + session creation.
//   Location permission is NOT checked here — it is handled entirely by the
//   active Drive screen (driver.tsx) via useGpsPermission + DriverGpsStatus.
//
//   Reason: on iOS, calling geo.requestPermissions() inside a modal can block
//   indefinitely if the Geolocation plugin is not fully registered, or if the
//   user has already denied and the OS silently ignores the request. This caused
//   the "Checking location…" hang that prevented sessions from ever starting.
//
//   The Drive screen already has the full permission state machine:
//     - 'prompt'      → "Enable Location" button → triggers OS dialog
//     - 'denied'      → "Open Settings" deep-link
//     - 'waiting_fix' → "Waiting for GPS fix" indicator
//     - 'granted'     → heartbeat loop starts
//
//   The session can exist and be useful (time tracking, job logging, costs)
//   even when GPS is unavailable. Blocking session creation on GPS is wrong.

export default function StartDrivingModal({ onClose, onStarted }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000); // 10s timeout

    fetch('/api/fleet/vehicles', { credentials: 'include', signal: ac.signal })
      .then((r) => r.json())
      .then((d: { vehicles?: Vehicle[] }) => setVehicles(d.vehicles ?? []))
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load vehicles — check your connection');
        }
      })
      .finally(() => { clearTimeout(timer); setLoading(false); });

    return () => { ac.abort(); clearTimeout(timer); };
  }, []);

  async function handleStart() {
    if (!selected || starting) return;
    setError('');
    setStarting(true);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12_000); // 12s — generous for slow mobile

    try {
      const res = await fetch('/api/fleet/driver-sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetAssetId: selected }),
        signal: ac.signal,
      });
      const data = await res.json() as { ok?: boolean; session?: ActiveSession; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to start session');
      if (data.session) onStarted(data.session);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Request timed out — check your connection and try again');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start driving session');
      }
    } finally {
      clearTimeout(timer);
      setStarting(false);
    }
  }

  const selectedVehicle = vehicles.find((v) => v.id === selected);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col"
        style={{ maxHeight: 'min(92dvh, 640px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Car size={16} className="text-primary" />
            </div>
            <h2 className="font-heading font-bold text-base">Start Driving</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Select an asset to start your driving session.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No active fleet assets found. Add assets in Fleet first.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {vehicles.map((v) => {
                const isCheckedOut = !!v.current_driver;
                const isSelected   = selected === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => !isCheckedOut && setSelected(v.id)}
                    disabled={isCheckedOut}
                    className={`w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-150 ${
                      isCheckedOut
                        ? 'border-border bg-slate-50 opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border hover:border-primary/40 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Car size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{v.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[v.make_model, v.rego_not_applicable ? null : v.rego]
                          .filter(Boolean)
                          .join(' · ') || 'No details'}
                      </p>
                    </div>
                    {isCheckedOut ? (
                      <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 shrink-0">
                        <MapPin size={10} />
                        <span className="truncate max-w-[80px]">{v.current_driver}</span>
                      </div>
                    ) : isSelected ? (
                      <CheckCircle2 size={16} className="text-primary shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border shrink-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleStart()}
            disabled={!selected || starting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {starting ? (
              <><Loader2 size={14} className="animate-spin" /> Starting…</>
            ) : (
              <><Car size={14} /> {selectedVehicle ? `Drive ${selectedVehicle.name}` : 'Start Driving'}</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
