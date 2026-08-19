/**
 * /prestart — Standalone Prestart Check Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1: Pick equipment from fleet list.
 * Step 2: Complete prestart form (km/hours, safe to operate, issues, notes).
 * Step 3: Done confirmation with option to start drive session.
 *
 * Can be deep-linked with ?vehicleId=X to skip step 1.
 * Orange theme to match the Prestart icon tile.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, ClipboardCheck, Loader2, Car, ChevronRight, CheckCircle2, XCircle, AlertTriangle, AlertCircle, Play, X } from 'lucide-react';
import { hapticSuccess, hapticError } from '@/lib/capacitor-plugins';

// ── Types ─────────────────────────────────────────────────────────────────────

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
type Step = 'pick' | 'form' | 'done';

// ── Helpers ───────────────────────────────────────────────────────────────────

function vehicleTypeIcon(type: string) {
  const t = type?.toLowerCase() ?? '';
  if (t === 'truck') return '🚛';
  if (t === 'plant') return '🚜';
  if (t === 'trailer') return '🚌';
  if (t === 'tool') return '🔧';
  return '🚗';
}

// ── Equipment Picker ──────────────────────────────────────────────────────────

function EquipmentPicker({
  vehicles,
  loading,
  onSelect
}: {
  vehicles: Vehicle[];
  loading: boolean;
  onSelect: (v: Vehicle) => void;
}) {
  return <div className="space-y-2">
      {loading ? <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-violet-400" />
        </div> : vehicles.length === 0 ? <div className="text-center py-16">
          <Car size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold text-sm">No fleet assets found</p>
          <p className="text-gray-400 text-xs mt-1">Add vehicles in Fleet management</p>
        </div> : vehicles.map((v, i) => <motion.button key={v.id} initial={{
      opacity: 0,
      y: 6
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      delay: i * 0.04
    }} onClick={() => onSelect(v)} className="w-full flex items-center gap-3 bg-white border border-gray-200 hover:bg-violet-50 hover:border-violet-200 active:bg-violet-100 rounded-2xl px-4 py-4 text-left transition-colors" style={{
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
    }}>
            <span className="text-2xl shrink-0">{vehicleTypeIcon(v.type)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 font-bold text-sm">{v.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {v.make_model && <span className="text-gray-400 text-xs">{v.make_model}</span>}
                {v.rego && !v.rego_not_applicable && <span className="text-gray-500 text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{v.rego}</span>}
                {v.current_driver && <span className="text-amber-600 text-xs font-semibold">In use · {v.current_driver}</span>}
              </div>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </motion.button>)}
    </div>;
}

// ── Prestart Form ─────────────────────────────────────────────────────────────

interface PrestartFormState {
  kmHours: string;
  safeToOperate: boolean;
  issueNeedsAttention: boolean;
  issueComment: string;
  notes: string;
}
function PrestartForm({
  vehicle,
  onDone
}: {
  vehicle: Vehicle;
  onDone: () => void;
}) {
  const [form, setForm] = useState<PrestartFormState>({
    kmHours: '',
    safeToOperate: true,
    issueNeedsAttention: false,
    issueComment: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function handleSubmit() {
    if (form.issueNeedsAttention && !form.issueComment.trim()) {
      setError('Please describe the issue');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fleet/${vehicle.id}/prestarts`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          kmHours: form.kmHours.trim() || undefined,
          safeToOperate: form.safeToOperate,
          issueNeedsAttention: form.issueNeedsAttention,
          issueComment: form.issueNeedsAttention ? form.issueComment.trim() : undefined,
          notes: form.notes.trim() || undefined
        })
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(d.error ?? 'Failed to save prestart');
        void hapticError();
        return;
      }
      void hapticSuccess();
      onDone();
    } catch {
      setError('Network error — please try again');
      void hapticError();
    } finally {
      setSaving(false);
    }
  }
  return <div className="space-y-5">
      {/* Vehicle badge */}
      <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3">
        <span className="text-2xl">{vehicleTypeIcon(vehicle.type)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-bold text-sm truncate">{vehicle.name}</p>
          {vehicle.rego && !vehicle.rego_not_applicable && <p className="text-gray-500 text-xs font-mono">{vehicle.rego}</p>}
        </div>
        <span className="text-violet-600 text-xs font-bold">Prestart</span>
      </div>

      {/* KM / Hours */}
      <div>
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-2">
          Current KM / Hours (optional)
        </label>
        <input type="text" inputMode="numeric" value={form.kmHours} onChange={e => setForm(f => ({
        ...f,
        kmHours: e.target.value
      }))} placeholder="e.g. 45230" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-violet-400 transition-colors" />
      </div>

      {/* Safe to operate */}
      <div>
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-2">
          Is the equipment safe to operate?
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setForm(f => ({
          ...f,
          safeToOperate: true,
          issueNeedsAttention: false
        }))} className={`flex items-center justify-center gap-2 rounded-xl py-3.5 border font-semibold text-sm transition-colors ${form.safeToOperate ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'}`}>
            <CheckCircle2 size={17} /> Yes, safe
          </button>
          <button type="button" onClick={() => setForm(f => ({
          ...f,
          safeToOperate: false,
          issueNeedsAttention: true
        }))} className={`flex items-center justify-center gap-2 rounded-xl py-3.5 border font-semibold text-sm transition-colors ${!form.safeToOperate ? 'bg-red-100 border-red-300 text-red-700' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'}`}>
            <XCircle size={17} /> Not safe
          </button>
        </div>
      </div>

      {/* Issue flag — only when safe */}
      {form.safeToOperate && <div>
          <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-2">
            Any issues to flag?
          </label>
          <button type="button" onClick={() => setForm(f => ({
        ...f,
        issueNeedsAttention: !f.issueNeedsAttention
      }))} className={`flex items-center gap-2.5 w-full rounded-xl px-4 py-3.5 border text-sm font-semibold transition-colors ${form.issueNeedsAttention ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'}`}>
            <AlertTriangle size={16} />
            {form.issueNeedsAttention ? 'Issue flagged — needs attention' : 'Flag an issue'}
          </button>
        </div>}

      {/* Issue comment */}
      <AnimatePresence>
        {form.issueNeedsAttention && <motion.div initial={{
        opacity: 0,
        height: 0
      }} animate={{
        opacity: 1,
        height: 'auto'
      }} exit={{
        opacity: 0,
        height: 0
      }}>
            <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-2">
              Describe the issue <span className="text-red-500">*</span>
            </label>
            <textarea value={form.issueComment} onChange={e => setForm(f => ({
          ...f,
          issueComment: e.target.value
        }))} placeholder="What's the issue?" rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-violet-400 resize-none transition-colors" />
          </motion.div>}
      </AnimatePresence>

      {/* Notes */}
      <div>
        <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-2">
          Notes (optional)
        </label>
        <textarea value={form.notes} onChange={e => setForm(f => ({
        ...f,
        notes: e.target.value
      }))} placeholder="Any other notes…" rows={2} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-violet-400 resize-none transition-colors" />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-red-600 text-sm flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={13} /></button>
          </motion.div>}
      </AnimatePresence>

      {/* Submit */}
      <button onClick={() => void handleSubmit()} disabled={saving} className="w-full flex items-center justify-center gap-2.5 bg-violet-500 hover:bg-violet-700 active:bg-violet-800 text-white font-bold py-4 rounded-2xl transition-colors shadow-md shadow-violet-200 disabled:opacity-60">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
        {saving ? 'Saving…' : 'Submit Prestart'}
      </button>
    </div>;
}

// ── Done State ────────────────────────────────────────────────────────────────

function DoneState({
  vehicle,
  onAnother
}: {
  vehicle: Vehicle;
  onAnother: () => void;
}) {
  const navigate = useNavigate();
  return <motion.div initial={{
    opacity: 0,
    scale: 0.96
  }} animate={{
    opacity: 1,
    scale: 1
  }} className="flex flex-col items-center text-center py-8 gap-5">
      <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center">
        <CheckCircle2 size={40} className="text-emerald-500" />
      </div>
      <div>
        <h2 className="text-gray-900 font-black text-xl">Prestart Complete</h2>
        <p className="text-gray-400 text-sm mt-1">{vehicle.name} · logged successfully</p>
      </div>

      {/* Start drive session CTA */}
      <button onClick={() => navigate('/fleet', {
      state: {
        openDriveModal: true
      }
    })} className="w-full flex items-center justify-center gap-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors shadow-md shadow-blue-200">
        <Play size={18} /> Start Drive Session
      </button>

      <button onClick={onAnother} className="w-full flex items-center justify-center gap-2 py-3.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-semibold rounded-2xl transition-colors text-sm">
        <ClipboardCheck size={15} className="text-violet-600" /> Do another prestart
      </button>

      <Link to="/fleet" className="text-gray-400 text-sm hover:text-gray-600 transition-colors">
        Back to Fleet
      </Link>
    </motion.div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PrestartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vehicleIdParam = searchParams.get('vehicleId');
  const [step, setStep] = useState<Step>('pick');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const res = await fetch('/api/fleet/vehicles', {
        credentials: 'include'
      });
      const data = (await res.json()) as {
        vehicles?: Vehicle[];
      };
      const list = data.vehicles ?? [];
      setVehicles(list);
      // Auto-select if vehicleId param provided
      if (vehicleIdParam) {
        const found = list.find(v => String(v.id) === vehicleIdParam);
        if (found) {
          setSelectedVehicle(found);
          setStep('form');
        }
      }
    } catch {
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  }, [vehicleIdParam]);
  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);
  function handleSelectVehicle(v: Vehicle) {
    setSelectedVehicle(v);
    setStep('form');
  }
  function handleDone() {
    setStep('done');
  }
  function handleAnother() {
    setSelectedVehicle(null);
    setStep('pick');
  }
  const stepTitle = step === 'pick' ? 'Select Equipment' : step === 'form' ? 'Daily Prestart' : 'Prestart Done';
  return <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden">
      <Helmet>
        <title>Prestart Check — IWILLBUILD</title>
        <meta name="description" content="Complete a daily prestart check for fleet equipment." />
        <link rel="canonical" href="https://iwillbuild.com/prestart" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-4 flex items-center gap-3 shrink-0" style={{
      paddingTop: 'max(env(safe-area-inset-top), 12px)',
      paddingBottom: '12px',
      boxShadow: '0 1px 0 rgba(0,0,0,0.05)'
    }}>
        <button onClick={() => {
        if (step === 'form') {
          setStep('pick');
          setSelectedVehicle(null);
        } else navigate('/fleet');
      }} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <ClipboardCheck size={15} className="text-violet-700" />
          </div>
          <div>
            <h1 className="text-gray-900 font-bold text-sm leading-tight">{stepTitle}</h1>
            <p className="text-gray-400 text-xs">IWILLBUILD</p>
          </div>
        </div>

        {/* Step indicator */}
        {step !== 'done' && <div className="flex items-center gap-1.5 shrink-0">
            {(['pick', 'form'] as Step[]).map((s, i) => <div key={s} className={`h-1.5 rounded-full transition-all ${step === s ? 'w-6 bg-violet-500' : i < (['pick', 'form'] as Step[]).indexOf(step) ? 'w-3 bg-violet-300' : 'w-3 bg-gray-200'}`} />)}
          </div>}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5" style={{
        paddingBottom: 'max(3rem, env(safe-area-inset-bottom))'
      }}>
          <AnimatePresence mode="wait">
            {step === 'pick' && <motion.div key="pick" initial={{
            opacity: 0,
            x: -16
          }} animate={{
            opacity: 1,
            x: 0
          }} exit={{
            opacity: 0,
            x: -16
          }} transition={{
            duration: 0.18
          }}>
                <p className="text-gray-500 text-sm mb-4">Choose the equipment you're completing a prestart for.</p>
                <EquipmentPicker vehicles={vehicles} loading={vehiclesLoading} onSelect={handleSelectVehicle} />
              </motion.div>}

            {step === 'form' && selectedVehicle && <motion.div key="form" initial={{
            opacity: 0,
            x: 16
          }} animate={{
            opacity: 1,
            x: 0
          }} exit={{
            opacity: 0,
            x: 16
          }} transition={{
            duration: 0.18
          }}>
                <PrestartForm vehicle={selectedVehicle} onDone={handleDone} />
              </motion.div>}

            {step === 'done' && selectedVehicle && <motion.div key="done" initial={{
            opacity: 0,
            x: 16
          }} animate={{
            opacity: 1,
            x: 0
          }} exit={{
            opacity: 0,
            x: 16
          }} transition={{
            duration: 0.18
          }}>
                <DoneState vehicle={selectedVehicle} onAnother={handleAnother} />
              </motion.div>}
          </AnimatePresence>
        </div>
      </div>
    </div>;
}
