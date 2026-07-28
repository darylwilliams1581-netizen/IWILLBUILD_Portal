import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Car, X, AlertCircle, Loader2, CheckCircle2, MapPin, Navigation, ExternalLink } from 'lucide-react';
import { isNative, getNativeGeo } from '@/lib/capacitor-plugins';

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

// ── Location permission helpers ───────────────────────────────────────────────

type LocPermResult = 'granted' | 'denied' | 'unavailable';

async function checkAndRequestLocationPermission(): Promise<LocPermResult> {
  // ── Native Capacitor path ──────────────────────────────────────────────────
  if (isNative()) {
    const geo = await getNativeGeo();
    if (!geo) return 'unavailable';
    try {
      const status = await geo.checkPermissions();
      // 'granted' or 'limited' (iOS precise/approximate)
      if (status.location === 'granted' || status.location === 'limited') return 'granted';
      if (status.location === 'denied') return 'denied';
      // 'prompt' — request it
      const requested = await geo.requestPermissions();
      if (requested.location === 'granted' || requested.location === 'limited') return 'granted';
      return 'denied';
    } catch {
      return 'unavailable';
    }
  }

  // ── Web browser path ───────────────────────────────────────────────────────
  if (!navigator.geolocation) return 'unavailable';

  // Use the Permissions API if available to check without prompting
  if (navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'granted') return 'granted';
      if (perm.state === 'denied') return 'denied';
      // 'prompt' — fall through to trigger the browser prompt
    } catch { /* Permissions API not supported */ }
  }

  // Trigger the browser geolocation prompt
  return new Promise<LocPermResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve('denied');
        else resolve('unavailable');
      },
      { timeout: 8_000, maximumAge: 60_000 }
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StartDrivingModal({ onClose, onStarted }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [locPermission, setLocPermission] = useState<LocPermResult | null>(null);
  const [checkingLoc, setCheckingLoc] = useState(false);

  useEffect(() => {
    fetch('/api/fleet/vehicles', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { vehicles?: Vehicle[] }) => setVehicles(d.vehicles ?? []))
      .catch(() => setError('Failed to load vehicles'))
      .finally(() => setLoading(false));
  }, []);

  async function handleStart() {
    if (!selected) return;
    setError('');

    // ── Step 1: ensure location permission ────────────────────────────────────
    setCheckingLoc(true);
    const perm = await checkAndRequestLocationPermission();
    setCheckingLoc(false);
    setLocPermission(perm);

    if (perm === 'denied') {
      // Don't block the session — GPS tracking just won't work.
      // Show a warning but still allow the user to proceed.
      setError('Location access denied — GPS tracking will be unavailable. You can still start driving.');
      // Don't return — let them proceed
    }

    // ── Step 2: start the session ─────────────────────────────────────────────
    setStarting(true);
    try {
      const res = await fetch('/api/fleet/driver-sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetAssetId: selected }),
      });
      const data = await res.json() as { ok?: boolean; session?: ActiveSession; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to start session');
      if (data.session) onStarted(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start driving session');
    } finally {
      setStarting(false);
    }
  }

  async function openSettings() {
    if (isNative()) {
      try {
        const { App } = await import('@capacitor/app');
        // @ts-expect-error openSettings available on some Capacitor versions
        await App.openSettings?.();
        return;
      } catch { /* fall through */ }
    }
  }

  const selectedVehicle = vehicles.find((v) => v.id === selected);
  const isBusy = starting || checkingLoc;

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
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {/* Location permission denied — persistent warning */}
          {locPermission === 'denied' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-sm text-amber-800">
              <Navigation size={14} className="shrink-0 mt-0.5 text-amber-500" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Location access denied</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-snug">GPS tracking won't work. Allow location access in Settings to enable tracking.</p>
                {isNative() && (
                  <button onClick={() => void openSettings()} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-amber-700 underline underline-offset-2">
                    Open Settings <ExternalLink size={10} />
                  </button>
                )}
              </div>
            </div>
          )}

          {error && locPermission !== 'denied' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">Select an asset to start your driving session.</p>

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
                const isSelected = selected === v.id;
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
                        {[v.make_model, v.rego_not_applicable ? null : v.rego].filter(Boolean).join(' · ') || 'No details'}
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
            disabled={!selected || isBusy}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {checkingLoc ? (
              <><Loader2 size={14} className="animate-spin" /> Checking location…</>
            ) : starting ? (
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
