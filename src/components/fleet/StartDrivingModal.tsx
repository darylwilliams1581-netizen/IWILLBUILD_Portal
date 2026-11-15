/**
 * StartDrivingModal
 *
 * Step 1 — vehicle selection.
 * Step 2 — starting odometer (required when the selected vehicle has logbook recording enabled).
 *
 * A stable request ID and odometer are retained before sending. The server creates
 * the session and logbook capture together; retries reuse the original request.
 *
 * GPS permission is NOT checked here — the Drive screen handles that entirely.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Car, X, AlertCircle, Loader2, CheckCircle2, MapPin, BookOpen } from 'lucide-react';
import { useFieldSheetScrollLock } from '@/lib/useFieldSheetScrollLock';
import { startLogbookDrive } from '@/lib/fleet-drive-logbook';

interface Vehicle {
  id: number;
  name: string;
  type: string;
  make_model: string | null;
  rego: string | null;
  rego_not_applicable: boolean;
  status: string;
  logbook_active: boolean | number | null;
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

/** Parse a raw odometer string. Returns null if invalid. */
function parseOdometer(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return isFinite(n) && n >= 0 ? n : null;
}

export default function StartDrivingModal({ onClose, onStarted }: Props) {
  useFieldSheetScrollLock(true);


  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [error,    setError]    = useState('');

  // Step 2 — odometer (only shown when selected vehicle has logbook active)
  const [step, setStep]               = useState<'select' | 'odometer'>('select');
  const [odometer, setOdometer]       = useState('');
  const [odometerError, setOdometerError] = useState('');
  const [savingOdo, setSavingOdo]     = useState(false);

  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);

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

  const selectedVehicle = vehicles.find((v) => v.id === selected);
  const logbookActive   = !!(selectedVehicle?.logbook_active);

  /** Called after vehicle selection — advance to odometer step if logbook is active. */
  function handleNext() {
    if (!selected) return;
    setError('');
    if (logbookActive) {
      setStep('odometer');
    } else {
      void startSession(null);
    }
  }

  /**
   * Persist the request ID and reading before starting the server session.
   * Retry uses that same request if its response is lost.
   */
  async function handleOdometerConfirm() {
    setOdometerError('');
    const odo = parseOdometer(odometer);
    if (odo === null) {
      setOdometerError('Enter a valid odometer reading (e.g. 45230)');
      return;
    }

    await startSession(odo);
  }

  async function startSession(odo: number | null) {
    if (!selected || starting) return;
    setError('');setStarting(true);setSavingOdo(true);
    try {
      const session=await startLogbookDrive(selected,odo===null?null:String(odo));
      onStarted(session);
    } catch(e) {
      const message=e instanceof Error?e.message:'Could not start drive';
      setError(message);setOdometerError(message);
    } finally {setStarting(false);setSavingOdo(false);}
  }

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
              {step === 'odometer' ? <BookOpen size={16} className="text-primary" /> : <Car size={16} className="text-primary" />}
            </div>
            <div>
              <h2 className="font-heading font-bold text-base">
                {step === 'odometer' ? 'Starting odometer' : 'Start Driving'}
              </h2>
              {step === 'odometer' && selectedVehicle && (
                <p className="text-xs text-muted-foreground">{selectedVehicle.name}</p>
              )}
            </div>
          </div>
          <button
            onClick={step === 'odometer' ? () => setStep('select') : onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={step === 'odometer' ? 'Back' : 'Close'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <AnimatePresence mode="wait" initial={false}>
          {step === 'select' ? (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="p-5 flex flex-col gap-4 overflow-y-auto flex-1"
            >
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
                      <div
                        key={v.id}
                        role="button"
                        tabIndex={isCheckedOut ? -1 : 0}
                        aria-pressed={isSelected}
                        aria-disabled={isCheckedOut}
                        onPointerDown={(e) => {
                          if (!isCheckedOut) {
                            e.preventDefault();
                            setSelected(v.id);
                          }
                        }}
                        onKeyDown={(e) => { if (!isCheckedOut && (e.key === 'Enter' || e.key === ' ')) setSelected(v.id); }}
                        className={`w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-150 select-none ${
                          isCheckedOut
                            ? 'border-border bg-slate-50 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30 cursor-pointer'
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
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="odometer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="p-5 flex flex-col gap-4 overflow-y-auto flex-1"
            >
              {(error || odometerError) && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{odometerError || error}</span>
                </div>
              )}

              <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5 text-xs text-violet-800">
                <BookOpen size={13} className="shrink-0 mt-0.5" />
                <span>Logbook recording is enabled for this vehicle. A starting odometer reading is required before the drive can begin.</span>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">
                  Starting odometer (km) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={odometer}
                  onChange={e => { setOdometer(e.target.value); setOdometerError(''); }}
                  placeholder="e.g. 45230"
                  className="w-full px-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">Required while logbook recording is enabled.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border shrink-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          {step === 'select' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNext}
                disabled={!selected || starting}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {starting ? (
                  <><Loader2 size={14} className="animate-spin" /> Starting…</>
                ) : logbookActive && selected ? (
                  <><BookOpen size={14} /> Next</>
                ) : (
                  <><Car size={14} /> {selectedVehicle ? `Drive ${selectedVehicle.name}` : 'Start Driving'}</>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => void handleOdometerConfirm()}
                disabled={savingOdo || starting}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {(savingOdo || starting) ? (
                  <><Loader2 size={14} className="animate-spin" /> {savingOdo ? 'Saving…' : 'Starting…'}</>
                ) : (
                  <><Car size={14} /> Start Driving</>
                )}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
