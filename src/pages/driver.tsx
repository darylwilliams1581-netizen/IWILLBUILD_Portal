/**
 * /driver — Driver Mobile App View
 * ─────────────────────────────────────────────────────────────────────────────
 * Optimised for phone screens. Shows:
 *   - Session start / stop with vehicle picker
 *   - Live GPS status (accuracy, speed, heading)
 *   - Current job details
 *   - Drive time elapsed + distance (from session data)
 *   - Quick links to job, safety forms, prestart
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Truck,
  Play,
  Square,
  ChevronRight,
  Loader2,
  AlertCircle,
  Clock,
  MapPin,
  FileText,
  LogOut,
  X,
  Car,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calculator,
  Layers,
  HardHat,
  LayoutDashboard,
} from 'lucide-react';
import BuildersCalc from '../components/estimating/BuildersCalc';
import TakeoffPad from '../components/estimating/TakeoffPad';
import { useDriverSession } from '@/lib/useDriverSession';
import { hapticImpact, hapticSuccess, hapticError } from '@/lib/capacitor-plugins';
import DriverJobCard from '@/components/driver/DriverJobCard';
import DriverGpsStatus from '@/components/driver/DriverGpsStatus';
import type { Job } from '@/lib/jobs-api';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(startAt: string): string {
  const ms = Date.now() - new Date(startAt).getTime();
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function vehicleTypeIcon(type: string) {
  const t = type?.toLowerCase() ?? '';
  if (t === 'truck')   return '🚛';
  if (t === 'plant')   return '🚜';
  if (t === 'trailer') return '🚌';
  if (t === 'tool')    return '🔧';
  return '🚗';
}

// ── Vehicle Picker Sheet ──────────────────────────────────────────────────────

interface VehiclePickerProps {
  vehicles: Vehicle[];
  loading: boolean;
  onSelect: (v: Vehicle) => void;
  onClose: () => void;
}

function VehiclePicker({ vehicles, loading, onSelect, onClose }: VehiclePickerProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full bg-gray-900 rounded-t-3xl border-t border-gray-800 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div>
            <h2 className="text-white font-bold text-base">Select Vehicle</h2>
            <p className="text-gray-500 text-xs mt-0.5">Choose the vehicle you're driving</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-orange-400" />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-10">
              <Car size={32} className="text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No vehicles available</p>
            </div>
          ) : (
            vehicles.map(v => (
              <button
                key={v.id}
                onClick={() => onSelect(v)}
                disabled={!!v.current_driver}
                className={`w-full flex items-center gap-3 bg-gray-800 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                  v.current_driver
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-gray-750 active:bg-gray-700'
                }`}
              >
                <span className="text-2xl">{vehicleTypeIcon(v.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{v.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {v.make_model && (
                      <span className="text-gray-500 text-xs">{v.make_model}</span>
                    )}
                    {v.rego && !v.rego_not_applicable && (
                      <span className="text-gray-600 text-xs bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                        {v.rego}
                      </span>
                    )}
                  </div>
                  {v.current_driver && (
                    <p className="text-amber-400 text-xs mt-0.5">In use by {v.current_driver}</p>
                  )}
                </div>
                {!v.current_driver && (
                  <ChevronRight size={16} className="text-gray-600 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Stop Confirmation Sheet ───────────────────────────────────────────────────

interface StopConfirmProps {
  sessionName: string;
  elapsed: string;
  onConfirm: () => void;
  onCancel: () => void;
  stopping: boolean;
}

function StopConfirm({ sessionName, elapsed, onConfirm, onCancel, stopping }: StopConfirmProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full bg-gray-900 rounded-t-3xl border-t border-gray-800 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
            <Square size={22} className="text-red-400" />
          </div>
          <h2 className="text-white font-bold text-lg">End Drive Session?</h2>
          <p className="text-gray-400 text-sm mt-1">
            {sessionName} · {elapsed}
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onConfirm}
            disabled={stopping}
            className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold py-4 rounded-2xl transition-colors disabled:opacity-60"
          >
            {stopping ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} />}
            {stopping ? 'Ending session…' : 'End Session'}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-4 text-gray-400 font-semibold rounded-2xl hover:text-white transition-colors"
          >
            Keep Driving
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Tool Sheet (Builders Calc / Take-off Pad) ─────────────────────────────────

interface ToolSheetProps {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

function ToolSheet({ title, icon, onClose, children }: ToolSheetProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full bg-gray-950 rounded-t-3xl border-t border-gray-800 flex flex-col"
        style={{ maxHeight: '94vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gray-800 flex items-center justify-center">
              {icon}
            </div>
            <h2 className="text-white font-bold text-base">{title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Prestart Sheet ────────────────────────────────────────────────────────────

interface PrestartSheetProps {
  vehicleId: number;
  vehicleName: string;
  onClose: () => void;
  onDone: () => void;
}

function PrestartSheet({ vehicleId, vehicleName, onClose, onDone }: PrestartSheetProps) {
  const [form, setForm] = useState({
    kmHours: '',
    safeToOperate: true,
    issueNeedsAttention: false,
    issueComment: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [done, setDone]     = useState(false);

  async function handleSubmit() {
    if (form.issueNeedsAttention && !form.issueComment.trim()) {
      setError('Please describe the issue');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/fleet/${vehicleId}/prestarts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kmHours: form.kmHours.trim() || undefined,
          safeToOperate: form.safeToOperate,
          issueNeedsAttention: form.issueNeedsAttention,
          issueComment: form.issueNeedsAttention ? form.issueComment.trim() : undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? 'Failed to save prestart');
        return;
      }
      setDone(true);
      setTimeout(onDone, 1200);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full bg-gray-900 rounded-t-3xl border-t border-gray-800 max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <ClipboardCheck size={16} className="text-orange-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Daily Prestart</h2>
              <p className="text-gray-500 text-xs">{vehicleName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Done state */}
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <p className="text-white font-bold text-lg">Prestart Complete</p>
            <p className="text-gray-400 text-sm">Logged successfully</p>
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* KM / Hours */}
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-2">
                  Current KM / Hours (optional)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.kmHours}
                  onChange={e => setForm(f => ({ ...f, kmHours: e.target.value }))}
                  placeholder="e.g. 45230"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Safe to operate */}
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-2">
                  Is the vehicle safe to operate?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, safeToOperate: true, issueNeedsAttention: false }))}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3 border font-semibold text-sm transition-colors ${
                      form.safeToOperate
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-gray-800 border-gray-700 text-gray-400'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    Yes, safe
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, safeToOperate: false, issueNeedsAttention: true }))}
                    className={`flex items-center justify-center gap-2 rounded-xl py-3 border font-semibold text-sm transition-colors ${
                      !form.safeToOperate
                        ? 'bg-red-500/10 border-red-500/50 text-red-400'
                        : 'bg-gray-800 border-gray-700 text-gray-400'
                    }`}
                  >
                    <XCircle size={16} />
                    Not safe
                  </button>
                </div>
              </div>

              {/* Issue flag */}
              {form.safeToOperate && (
                <div>
                  <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-2">
                    Any issues to flag?
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, issueNeedsAttention: !f.issueNeedsAttention }))}
                    className={`flex items-center gap-2.5 w-full rounded-xl px-4 py-3 border text-sm font-semibold transition-colors ${
                      form.issueNeedsAttention
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                        : 'bg-gray-800 border-gray-700 text-gray-400'
                    }`}
                  >
                    <AlertTriangle size={16} />
                    {form.issueNeedsAttention ? 'Issue flagged — needs attention' : 'Flag an issue'}
                  </button>
                </div>
              )}

              {/* Issue comment */}
              {form.issueNeedsAttention && (
                <div>
                  <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-2">
                    Describe the issue <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={form.issueComment}
                    onChange={e => setForm(f => ({ ...f, issueComment: e.target.value }))}
                    placeholder="What's the issue?"
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide block mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any other notes…"
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2.5">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="px-5 pb-8 pt-3 shrink-0 border-t border-gray-800">
              <button
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-4 rounded-2xl transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
                {saving ? 'Saving…' : 'Submit Prestart'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DriverPage() {
  const { session, refresh, stopSession } = useDriverSession();

  // Vehicle picker
  const [showPicker, setShowPicker]     = useState(false);
  const [vehicles, setVehicles]         = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  // Session start/stop state
  const [starting, setStarting]         = useState(false);
  const [stopping, setStopping]         = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [actionError, setActionError]   = useState('');

  // Prestart
  const [showPrestart, setShowPrestart] = useState(false);
  const [prestartVehicle, setPrestartVehicle] = useState<Vehicle | null>(null);
  const [pickerMode, setPickerMode] = useState<'drive' | 'prestart'>('drive');

  // Tool sheets
  const [showBuildersCalc, setShowBuildersCalc] = useState(false);
  const [showTakeoffPad, setShowTakeoffPad]     = useState(false);

  // Elapsed timer
  const [elapsed, setElapsed]           = useState('00m 00s');
  const [elapsedHours, setElapsedHours] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Selected job (for display alongside session)
  const [selectedJob, setSelectedJob]   = useState<Job | null>(null);

  // ── Elapsed timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (session?.start_at) {
      const update = () => {
        setElapsed(formatElapsed(session.start_at));
        const ms = Date.now() - new Date(session.start_at).getTime();
        setElapsedHours(ms / 3600000);
      };
      update();
      elapsedRef.current = setInterval(update, 1000);
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      setElapsed('00m 00s');
      setElapsedHours(0);
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [session?.start_at]);

  // ── Load vehicles ───────────────────────────────────────────────────────
  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const res = await fetch('/api/fleet/vehicles', { credentials: 'include' });
      const data = await res.json() as { vehicles: Vehicle[] };
      setVehicles(data.vehicles ?? []);
    } catch {
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  // ── Start session ───────────────────────────────────────────────────────
  async function handleStartSession(vehicle: Vehicle) {
    setShowPicker(false);
    setStarting(true);
    setActionError('');
    void hapticImpact('medium');
    try {
      const res = await fetch('/api/fleet/driver-sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleetAssetId: vehicle.id }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setActionError(data.error ?? 'Failed to start session');
        void hapticError();
      } else {
        void hapticSuccess();
        await refresh();
      }
    } catch {
      setActionError('Network error — please try again');
      void hapticError();
    } finally {
      setStarting(false);
    }
  }

  // ── Stop session ────────────────────────────────────────────────────────
  async function handleStopSession() {
    if (!session) return;
    setStopping(true);
    void hapticImpact('heavy');
    try {
      await stopSession(session.id);
      void hapticSuccess();
      setShowStopConfirm(false);
    } catch {
      setActionError('Failed to end session — please try again');
      void hapticError();
    } finally {
      setStopping(false);
    }
  }

  const sessionActive = !!session;

  return (
    <>
      <Helmet>
        <title>Driver — IWILLBUILD</title>
        <meta name="description" content="Driver mobile view — start and stop drive sessions, track GPS, and view current job details." />
        <link rel="canonical" href="https://iwillbuild.com/driver" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Full-screen dark shell — no sidebar on mobile driver view */}
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <h1 className="sr-only">Driver App — IWILLBUILD</h1>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Link
              to="/dashboard"
              className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 active:bg-gray-600 flex items-center justify-center transition-colors shrink-0"
              aria-label="Back to dashboard"
            >
              <ChevronRight size={16} className="text-gray-400 rotate-180" />
            </Link>
            <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center">
              <span className="text-white font-black text-xs">IW</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Driver</p>
              <p className="text-gray-500 text-xs">IWILLBUILD</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* GPS pill — always visible */}
            <DriverGpsStatus variant="pill" active={sessionActive} />
            {/* Portal link */}
            <Link to="/dashboard" className="text-gray-500 hover:text-gray-300 p-1">
              <LogOut size={16} />
            </Link>
          </div>
        </div>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

            {/* ── Session card ─────────────────────────────────────────────── */}
            <div className={`rounded-2xl border overflow-hidden transition-colors ${
              sessionActive
                ? 'bg-orange-950/30 border-orange-800/50'
                : 'bg-gray-900 border-gray-800'
            }`}>

              {/* Session header */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Truck size={14} className={sessionActive ? 'text-orange-400' : 'text-gray-500'} />
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {sessionActive ? 'Active Session' : 'No Active Session'}
                      </span>
                      {sessionActive && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                          <span className="text-orange-400 text-xs font-semibold">LIVE</span>
                        </span>
                      )}
                    </div>

                    {sessionActive ? (
                      <>
                        <h2 className="text-white font-black text-xl leading-tight">
                          {session.asset_name}
                        </h2>
                        <p className="text-gray-400 text-sm mt-0.5">{session.driver_name}</p>
                      </>
                    ) : (
                      <h2 className="text-gray-300 font-bold text-lg">Ready to drive?</h2>
                    )}
                  </div>

                  {/* Elapsed time badge */}
                  {sessionActive && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2 text-center shrink-0">
                      <p className="text-orange-300 font-black text-lg leading-none tabular-nums">{elapsed}</p>
                      <p className="text-orange-500/70 text-xs mt-0.5">elapsed</p>
                    </div>
                  )}
                </div>

                {/* Session stats row */}
                {sessionActive && (
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <Clock size={12} />
                      <span className="text-xs">
                        Started {new Date(session.start_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <MapPin size={12} />
                      <span className="text-xs">GPS tracking active</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action error */}
              <AnimatePresence>
                {actionError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mx-5 mb-3"
                  >
                    <div className="flex items-center gap-2 bg-red-950/50 border border-red-800/50 rounded-xl px-3 py-2.5">
                      <AlertCircle size={14} className="text-red-400 shrink-0" />
                      <p className="text-red-300 text-sm flex-1">{actionError}</p>
                      <button onClick={() => setActionError('')} className="text-red-500 hover:text-red-300">
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stale session warning */}
              {sessionActive && elapsedHours >= 8 && (
                <div className="mx-5 mb-3 flex items-start gap-2 bg-amber-950/50 border border-amber-700/50 rounded-xl px-3 py-2.5">
                  <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-amber-300 text-xs font-semibold">Session looks stale</p>
                    <p className="text-amber-400/70 text-xs mt-0.5">This session has been running for {elapsed}. If you forgot to end it, close it now.</p>
                  </div>
                </div>
              )}

              {/* CTA button */}
              <div className="px-5 pb-5 space-y-2.5">
                {sessionActive ? (
                  <button
                    onClick={() => setShowStopConfirm(true)}
                    className="w-full flex items-center justify-center gap-2.5 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 border border-red-500/40 text-red-400 font-bold py-4 rounded-2xl transition-colors"
                  >
                    <Square size={18} />
                    End Drive Session
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await loadVehicles();
                      setPickerMode('drive');
                      setShowPicker(true);
                    }}
                    disabled={starting}
                    className="w-full flex items-center justify-center gap-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-4 rounded-2xl transition-colors shadow-lg shadow-orange-500/20 disabled:opacity-60"
                  >
                    {starting ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Play size={18} />
                    )}
                    {starting ? 'Starting…' : 'Start Drive Session'}
                  </button>
                )}

                {/* Prestart button — always visible */}
                <button
                  onClick={async () => {
                    if (sessionActive && session) {
                      // Use the current session's vehicle directly
                      setPrestartVehicle({ id: session.fleet_asset_id, name: session.asset_name } as Vehicle);
                      setShowPrestart(true);
                    } else {
                      // Pick a vehicle first, then open prestart
                      setPickerMode('prestart');
                      await loadVehicles();
                      setShowPicker(true);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2.5 bg-gray-800 hover:bg-gray-750 active:bg-gray-700 border border-gray-700 text-gray-300 font-semibold py-3.5 rounded-2xl transition-colors"
                >
                  <ClipboardCheck size={17} className="text-orange-400" />
                  Start Prestart
                </button>
              </div>
            </div>

            {/* ── GPS status card (full, when session active) ──────────────── */}
            <AnimatePresence>
              {sessionActive && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <DriverGpsStatus variant="card" active={true} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Current job card ─────────────────────────────────────────── */}
            <DriverJobCard
              onJobSelect={setSelectedJob}
              compact
            />

            {/* ── Quick actions ─────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">Quick Access</p>

              {/* Dashboard — full-width hero button */}
              <Link
                to="/dashboard"
                className="flex items-center gap-4 bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4 mb-3 hover:bg-gray-800 active:bg-gray-750 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                  <LayoutDashboard size={22} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-base leading-tight">Dashboard</p>
                  <p className="text-gray-500 text-xs mt-0.5">Portal overview &amp; activity</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 shrink-0" />
              </Link>

              {/* Tools row — Builders Calc + Take-off Pad */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={() => setShowBuildersCalc(true)}
                  className="flex flex-col items-center gap-2.5 bg-gray-900 border border-gray-800 rounded-2xl py-5 px-3 hover:bg-gray-800 active:bg-gray-750 transition-colors"
                >
                  <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                    <Calculator size={20} className="text-blue-400" />
                  </div>
                  <span className="text-white text-xs font-bold text-center leading-tight">Builders Calc</span>
                </button>

                <button
                  onClick={() => setShowTakeoffPad(true)}
                  className="flex flex-col items-center gap-2.5 bg-gray-900 border border-gray-800 rounded-2xl py-5 px-3 hover:bg-gray-800 active:bg-gray-750 transition-colors"
                >
                  <div className="w-11 h-11 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                    <Layers size={20} className="text-violet-400" />
                  </div>
                  <span className="text-white text-xs font-bold text-center leading-tight">Take-off Pad</span>
                </button>
              </div>

              {/* Secondary row — Jobs, Safety, Fleet */}
              <div className="grid grid-cols-3 gap-2">
                <Link
                  to={selectedJob ? `/jobs/${selectedJob.id}` : '/jobs'}
                  className="flex flex-col items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl py-3.5 px-2 hover:bg-gray-800 active:bg-gray-750 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
                    <FileText size={16} className="text-sky-400" />
                  </div>
                  <span className="text-gray-300 text-xs font-semibold text-center leading-tight">
                    {selectedJob ? 'Job' : 'Jobs'}
                  </span>
                </Link>

                <Link
                  to="/safety"
                  className="flex flex-col items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl py-3.5 px-2 hover:bg-gray-800 active:bg-gray-750 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <HardHat size={16} className="text-emerald-400" />
                  </div>
                  <span className="text-gray-300 text-xs font-semibold text-center leading-tight">Safety</span>
                </Link>

                <Link
                  to="/fleet"
                  className="flex flex-col items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl py-3.5 px-2 hover:bg-gray-800 active:bg-gray-750 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Truck size={16} className="text-orange-400" />
                  </div>
                  <span className="text-gray-300 text-xs font-semibold text-center leading-tight">Fleet</span>
                </Link>
              </div>
            </div>

            {/* Bottom safe area padding for phones */}
            <div className="h-8" />
          </div>
        </div>
      </div>

      {/* ── Vehicle picker sheet ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPicker && (
          <VehiclePicker
            vehicles={vehicles}
            loading={vehiclesLoading}
            onSelect={v => {
              setShowPicker(false);
              if (pickerMode === 'prestart') {
                setPrestartVehicle(v);
                setShowPrestart(true);
              } else {
                void handleStartSession(v);
              }
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Stop confirmation sheet ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showStopConfirm && session && (
          <StopConfirm
            sessionName={session.asset_name}
            elapsed={elapsed}
            onConfirm={handleStopSession}
            onCancel={() => setShowStopConfirm(false)}
            stopping={stopping}
          />
        )}
      </AnimatePresence>

      {/* ── Prestart sheet ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPrestart && prestartVehicle && (
          <PrestartSheet
            vehicleId={prestartVehicle.id}
            vehicleName={prestartVehicle.name}
            onClose={() => setShowPrestart(false)}
            onDone={() => setShowPrestart(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Builders Calc sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBuildersCalc && (
          <ToolSheet
            title="Builders Calc"
            icon={<Calculator size={16} className="text-blue-400" />}
            onClose={() => setShowBuildersCalc(false)}
          >
            <BuildersCalc />
          </ToolSheet>
        )}
      </AnimatePresence>

      {/* ── Take-off Pad sheet ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTakeoffPad && (
          <ToolSheet
            title="Take-off Pad"
            icon={<Layers size={16} className="text-violet-400" />}
            onClose={() => setShowTakeoffPad(false)}
          >
            <TakeoffPad />
          </ToolSheet>
        )}
      </AnimatePresence>
    </>
  );
}
