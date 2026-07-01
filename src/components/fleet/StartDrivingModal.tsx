import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

export default function StartDrivingModal({ onClose, onStarted }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/fleet/vehicles', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { vehicles?: Vehicle[] }) => setVehicles(d.vehicles ?? []))
      .catch(() => setError('Failed to load vehicles'))
      .finally(() => setLoading(false));
  }, []);

  async function handleStart() {
    if (!selected) return;
    setStarting(true);
    setError('');
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

  const selectedVehicle = vehicles.find((v) => v.id === selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
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
        <div className="p-5 flex flex-col gap-4">
          {error && (
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
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!selected || starting}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Car size={14} />}
            {starting ? 'Starting…' : selectedVehicle ? `Drive ${selectedVehicle.name}` : 'Start Driving'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
