const COST_CATEGORIES = [
  { value: 'materials',   label: 'Materials' },
  { value: 'labour',      label: 'Labour' },
  { value: 'equipment',   label: 'Equipment' },
  { value: 'subcontract', label: 'Subcontract' },
  { value: 'other',       label: 'Other' },
];
/**
 * /driver — Drive Session Screen
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure drive flow: select equipment → active session card → end session.
 * Prestart has been split to /prestart.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Truck, Play, Square, ChevronRight, Loader2, AlertCircle,
  Clock, MapPin, LogOut, X, Car, ClipboardCheck, CheckCircle2,
  XCircle, Calculator, Layers, HardHat, LayoutDashboard, LogIn,
  Receipt, Rocket, DollarSign, Camera, Users, User, Upload,
} from 'lucide-react';
import BuildersCalc from '../components/estimating/BuildersCalc';
import TakeoffPad from '../components/estimating/TakeoffPad';
import { useDriverSession } from '@/lib/useDriverSession';
import { hapticImpact, hapticSuccess, hapticError } from '@/lib/capacitor-plugins';
import DriverGpsStatus from '@/components/driver/DriverGpsStatus';

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

function VehiclePicker({ vehicles, loading, onSelect, onClose }: {
  vehicles: Vehicle[];
  loading: boolean;
  onSelect: (v: Vehicle) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full bg-white rounded-t-3xl border-t border-gray-200 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
              <Car size={15} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-gray-900 font-bold text-base">Select Equipment</h2>
              <p className="text-gray-400 text-xs mt-0.5">Choose what you're driving</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-10">
              <Car size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No vehicles available</p>
            </div>
          ) : vehicles.map(v => (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              disabled={!!v.current_driver}
              className={`w-full flex items-center gap-3 bg-gray-50 border rounded-2xl px-4 py-3.5 text-left transition-colors ${
                v.current_driver
                  ? 'opacity-50 cursor-not-allowed border-gray-200'
                  : 'border-gray-200 hover:bg-blue-50 hover:border-blue-200 active:bg-blue-100'
              }`}
            >
              <span className="text-2xl">{vehicleTypeIcon(v.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-semibold text-sm">{v.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {v.make_model && <span className="text-gray-400 text-xs">{v.make_model}</span>}
                  {v.rego && !v.rego_not_applicable && (
                    <span className="text-gray-500 text-xs bg-gray-200 px-1.5 py-0.5 rounded font-mono">{v.rego}</span>
                  )}
                </div>
                {v.current_driver && (
                  <p className="text-amber-600 text-xs mt-0.5">In use by {v.current_driver}</p>
                )}
              </div>
              {!v.current_driver && <ChevronRight size={16} className="text-gray-300 shrink-0" />}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Stop Confirmation Sheet ───────────────────────────────────────────────────

function StopConfirm({ sessionName, elapsed, onConfirm, onCancel, stopping }: {
  sessionName: string;
  elapsed: string;
  onConfirm: () => void;
  onCancel: () => void;
  stopping: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full bg-white rounded-t-3xl border-t border-gray-200 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-red-100 border border-red-200 flex items-center justify-center mx-auto mb-3">
            <Square size={22} className="text-red-500" />
          </div>
          <h2 className="text-gray-900 font-bold text-lg">End Drive Session?</h2>
          <p className="text-gray-400 text-sm mt-1">{sessionName} · {elapsed}</p>
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
          <button onClick={onCancel} className="w-full py-4 text-gray-400 font-semibold rounded-2xl hover:text-gray-700 transition-colors">
            Keep Driving
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Tool Sheet ────────────────────────────────────────────────────────────────

function ToolSheet({ title, icon, onClose, children }: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full bg-white rounded-t-3xl border-t border-gray-200 flex flex-col"
        style={{ maxHeight: '94vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">{icon}</div>
            <h2 className="text-gray-900 font-bold text-base">{title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </motion.div>
    </motion.div>
  );
}

interface CostJob { id: number; name: string; jobNumber?: string | null; }

function JobCostSheet({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs]               = useState<CostJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<CostJob | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount]           = useState('');
  const [category, setCategory]       = useState('materials');
  const [files, setFiles]             = useState<File[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/jobs', { credentials: 'include' });
        const data = await res.json() as { jobs?: CostJob[] };
        setJobs(data.jobs ?? []);
      } catch { setJobs([]); }
      finally { setJobsLoading(false); }
    })();
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...picked].slice(0, 5));
    e.target.value = '';
  }

  async function handleSubmit() {
    if (!selectedJob) { setError('Please select a job.'); return; }
    if (!description.trim()) { setError('Please add a description.'); return; }
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('jobId', String(selectedJob.id));
      form.append('description', description.trim());
      form.append('amount', amount || '0');
      form.append('category', category);
      form.append('source', 'driver_app');
      files.forEach(f => form.append('receipts', f));
      const res = await fetch('/api/job-costs', { method: 'POST', credentials: 'include', body: form });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Upload failed');
      }
      void hapticSuccess();
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (e) {
      setError(String((e as Error).message ?? 'Failed to save cost'));
      void hapticError();
    } finally { setUploading(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="w-full bg-white rounded-t-3xl border-t border-gray-200 flex flex-col" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center"><Receipt size={15} className="text-amber-600" /></div>
            <h2 className="text-gray-900 font-bold text-base">Job Cost</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 transition-colors"><X size={18} /></button>
        </div>
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5 py-10">
            <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center"><CheckCircle2 size={32} className="text-emerald-500" /></div>
            <p className="text-gray-900 font-bold text-lg">Cost saved!</p>
            <p className="text-gray-400 text-sm text-center">Receipt uploaded and cost recorded.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Select Job</p>
                {jobsLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {jobs.map(job => (
                      <button key={job.id} onClick={() => setSelectedJob(job)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${selectedJob?.id === job.id ? 'bg-amber-50 border-amber-300 text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${selectedJob?.id === job.id ? 'bg-amber-500' : 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{job.name}</p>
                          {job.jobNumber && <p className="text-xs text-gray-400 font-mono">{job.jobNumber}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Category</p>
                <div className="flex flex-wrap gap-2">
                  {COST_CATEGORIES.map(c => (
                    <button key={c.value} onClick={() => setCategory(c.value)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${category === c.value ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'}`}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Description <span className="text-red-500">*</span></p>
                <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Timber framing — Bunnings" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-400 transition-colors" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Amount (optional)</p>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-amber-400 transition-colors" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Receipts / Photos (up to 5)</p>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple capture="environment" onChange={handleFileChange} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} disabled={files.length >= 5} className="w-full flex items-center justify-center gap-2.5 bg-gray-50 border border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-40 text-gray-400 hover:text-amber-600 font-semibold py-4 rounded-xl transition-colors text-sm">
                  <Camera size={16} /> Take Photo / Upload Receipt
                </button>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <Upload size={13} className="text-amber-500 shrink-0" />
                        <span className="text-gray-600 text-xs flex-1 truncate">{f.name}</span>
                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"><AlertCircle size={14} className="text-red-500 shrink-0" /><p className="text-red-600 text-sm">{error}</p></div>}
            </div>
            <div className="px-5 pb-8 pt-3 shrink-0 border-t border-gray-100">
              <button onClick={() => void handleSubmit()} disabled={uploading} className="w-full flex items-center justify-center gap-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold py-4 rounded-2xl transition-colors disabled:opacity-60">
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Receipt size={18} />}
                {uploading ? 'Saving…' : 'Save Cost'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Attendance Sheet ──────────────────────────────────────────────────────────

interface AttendanceJob { id: number; name: string; jobNumber?: string | null; }
interface OnSiteEntry { user_id: string; signed_in_at: string; user_name: string | null; user_email: string | null; }
interface AttendanceStatus {
  signedIn: boolean; lastAction: string | null; lastActionAt: string | null;
  currentlyOnSite: OnSiteEntry[];
}

function AttendanceSheet({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs]               = useState<AttendanceJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<AttendanceJob | null>(null);
  const [status, setStatus]           = useState<AttendanceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [actioning, setActioning]     = useState(false);
  const [message, setMessage]         = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/jobs', { credentials: 'include' });
        const data = await res.json() as { jobs?: AttendanceJob[] };
        setJobs(data.jobs ?? []);
      } catch { setJobs([]); }
      finally { setJobsLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedJob) { setStatus(null); return; }
    setStatusLoading(true);
    setMessage(null);
    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${selectedJob.id}/signin-status`, { credentials: 'include' });
        if (res.ok) setStatus(await res.json() as AttendanceStatus);
      } catch { /* ignore */ }
      finally { setStatusLoading(false); }
    })();
  }, [selectedJob]);

  async function handleAction(action: 'signin' | 'signout') {
    if (!selectedJob) return;
    setActioning(true); setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/${action}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { ok: boolean; message?: string };
      setMessage({ text: data.message ?? (res.ok ? 'Done.' : 'Failed.'), ok: res.ok });
      if (res.ok) {
        const s = await fetch(`/api/jobs/${selectedJob.id}/signin-status`, { credentials: 'include' });
        if (s.ok) setStatus(await s.json() as AttendanceStatus);
        if (action === 'signin') void hapticSuccess(); else void hapticImpact('medium');
      } else void hapticError();
    } catch { setMessage({ text: 'Request failed. Try again.', ok: false }); void hapticError(); }
    finally { setActioning(false); }
  }

  const signedIn = status?.signedIn ?? false;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="w-full bg-white rounded-t-3xl border-t border-gray-200 flex flex-col" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center"><LogIn size={15} className="text-emerald-600" /></div>
            <h2 className="text-gray-900 font-bold text-base">Job Attendance</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Select Job</p>
            {jobsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-3"><Loader2 size={14} className="animate-spin" /> Loading jobs…</div>
            ) : jobs.length === 0 ? (
              <p className="text-gray-400 text-sm py-3">No active jobs found.</p>
            ) : (
              <div className="space-y-2">
                {jobs.map(job => (
                  <button key={job.id} onClick={() => setSelectedJob(job)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${selectedJob?.id === job.id ? 'bg-orange-50 border-orange-300 text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${selectedJob?.id === job.id ? 'bg-orange-500' : 'bg-gray-300'}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{job.name}</p>
                      {job.jobNumber && <p className="text-xs text-gray-400 font-mono">{job.jobNumber}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedJob && (
            <div className="space-y-3">
              <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${statusLoading ? 'bg-gray-50 border-gray-200' : signedIn ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                {statusLoading
                  ? <Loader2 size={16} className="animate-spin text-gray-400" />
                  : <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${signedIn ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                }
                <div>
                  <p className={`text-sm font-bold ${signedIn ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {statusLoading ? 'Checking…' : signedIn ? 'Signed in' : 'Not signed in'}
                  </p>
                  {status?.lastActionAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Last: {status.lastAction} at {new Date(status.lastActionAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
              {message && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${message.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
                  {message.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {message.text}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pb-2">
                <button onClick={() => void handleAction('signin')} disabled={actioning || statusLoading || signedIn} className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition-colors">
                  {actioning ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Sign In
                </button>
                <button onClick={() => void handleAction('signout')} disabled={actioning || statusLoading || !signedIn} className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 border border-gray-200 text-gray-700 font-bold py-4 rounded-2xl transition-colors">
                  {actioning ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Sign Out
                </button>
              </div>
              {status && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200">
                    <Users size={13} className="text-emerald-500" />
                    <span className="text-xs font-bold text-gray-700">Currently on Site</span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />Live
                    </span>
                  </div>
                  {status.currentlyOnSite.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Nobody on site yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {status.currentlyOnSite.map(p => (
                        <div key={p.user_id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                            <User size={12} className="text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.user_name ?? p.user_email ?? 'Unknown'}</p>
                            <p className="text-xs text-gray-400">{new Date(p.signed_in_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <span className="text-xs font-bold text-emerald-600">On site</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DriverPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, refresh, stopSession } = useDriverSession();

  const [showPicker, setShowPicker]             = useState(false);
  const [vehicles, setVehicles]                 = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading]   = useState(false);
  const [starting, setStarting]                 = useState(false);
  const [stopping, setStopping]                 = useState(false);
  const [showStopConfirm, setShowStopConfirm]   = useState(false);
  const [actionError, setActionError]           = useState('');
  const [showBuildersCalc, setShowBuildersCalc] = useState(false);
  const [showTakeoffPad, setShowTakeoffPad]     = useState(false);
  const [showAttendance, setShowAttendance]     = useState(false);
  const [showJobCost, setShowJobCost]           = useState(false);
  const [elapsed, setElapsed]                   = useState('00m 00s');
  const [elapsedHours, setElapsedHours]         = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartedRef = useRef(false);

  // Live elapsed timer
  useEffect(() => {
    if (session?.start_at) {
      const update = () => {
        setElapsed(formatElapsed(session.start_at));
        setElapsedHours((Date.now() - new Date(session.start_at).getTime()) / 3600000);
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

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const res = await fetch('/api/fleet/vehicles', { credentials: 'include' });
      const data = await res.json() as { vehicles?: Vehicle[] };
      setVehicles(data.vehicles ?? []);
    } catch { setVehicles([]); }
    finally { setVehiclesLoading(false); }
  }, []);

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

  // Auto-select vehicle from ?vehicleId= query param (launched from home Drive picker)
  useEffect(() => {
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId || autoStartedRef.current || session) return;
    autoStartedRef.current = true;
    void (async () => {
      setVehiclesLoading(true);
      try {
        const res = await fetch('/api/fleet/vehicles', { credentials: 'include' });
        const data = await res.json() as { vehicles?: Vehicle[] };
        const list = data.vehicles ?? [];
        setVehicles(list);
        const match = list.find(v => String(v.id) === vehicleId);
        if (match && !match.current_driver) {
          void handleStartSession(match);
        } else {
          setShowPicker(true);
        }
      } catch {
        setVehicles([]);
        setShowPicker(true);
      } finally {
        setVehiclesLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStopSession() {    if (!session) return;
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
        <title>Drive — IWILLBUILD</title>
        <meta name="description" content="Start and stop drive sessions for fleet equipment." />
        <link rel="canonical" href="https://iwillbuild.com/driver" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen bg-gray-50 flex flex-col">
        <h1 className="sr-only">Drive — IWILLBUILD</h1>

        {/* ── Top bar ── */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2.5">
            <Link to="/home" className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors shrink-0" aria-label="Back to home">
              <ChevronRight size={16} className="text-gray-500 rotate-180" />
            </Link>
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
              <Car size={15} className="text-white" />
            </div>
            <div>
              <p className="text-gray-900 font-bold text-sm leading-tight">Drive</p>
              <p className="text-gray-400 text-xs">IWILLBUILD</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DriverGpsStatus variant="pill" active={sessionActive} />
            <Link to="/home" className="text-gray-400 hover:text-gray-600 p-1"><LogOut size={16} /></Link>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

            {/* ── Session card ── */}
            <div
              className={`rounded-2xl border overflow-hidden transition-colors ${sessionActive ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              <div className="px-5 pt-5 pb-4">

                {/* Header row: icon + ACTIVE SESSION • LIVE + elapsed pill */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Car size={14} className={sessionActive ? 'text-blue-500' : 'text-gray-400'} />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {sessionActive ? 'Active Session' : 'No Active Session'}
                      </span>
                      {sessionActive && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-blue-500 text-xs font-bold">LIVE</span>
                        </span>
                      )}
                    </div>

                    {sessionActive ? (
                      <>
                        <h2 className="text-gray-900 font-black text-xl leading-tight">{session.asset_name}</h2>
                        <p className="text-gray-500 text-sm mt-0.5">{session.driver_name}</p>
                      </>
                    ) : (
                      <h2 className="text-gray-700 font-bold text-lg">Ready to drive?</h2>
                    )}
                  </div>

                  {/* Elapsed pill — top right */}
                  {sessionActive && (
                    <div className="bg-blue-100 border border-blue-200 rounded-xl px-3 py-2 text-center shrink-0 min-w-[72px]">
                      <p className="text-blue-600 font-black text-lg leading-none tabular-nums">{elapsed}</p>
                      <p className="text-blue-400 text-xs mt-0.5">elapsed</p>
                    </div>
                  )}
                </div>

                {/* Started + GPS row */}
                {sessionActive && (
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <Clock size={12} />
                      <span className="text-xs">
                        Started {new Date(session.start_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}
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
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mx-5 mb-3">
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      <AlertCircle size={14} className="text-red-500 shrink-0" />
                      <p className="text-red-600 text-sm flex-1">{actionError}</p>
                      <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stale session warning */}
              {sessionActive && elapsedHours >= 8 && (
                <div className="mx-5 mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-amber-700 text-xs font-semibold">Session looks stale</p>
                    <p className="text-amber-600 text-xs mt-0.5">Running for {elapsed}. If you forgot to end it, close it now.</p>
                  </div>
                </div>
              )}

              {/* CTA button */}
              <div className="px-4 pb-4">
                {sessionActive ? (
                  <button
                    onClick={() => setShowStopConfirm(true)}
                    className="w-full flex items-center justify-center gap-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold py-4 rounded-2xl transition-colors shadow-lg shadow-red-200"
                  >
                    <Square size={18} className="fill-white" /> End Drive Session
                  </button>
                ) : (
                  <button
                    onClick={async () => { await loadVehicles(); setShowPicker(true); }}
                    disabled={starting}
                    className="w-full flex items-center justify-center gap-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors shadow-lg shadow-blue-200 disabled:opacity-60"
                  >
                    {starting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="fill-white" />}
                    {starting ? 'Starting…' : 'Start Drive Session'}
                  </button>
                )}
              </div>
            </div>

            {/* ── GPS status card (when active) ── */}
            <AnimatePresence>
              {sessionActive && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }}>
                  <DriverGpsStatus variant="card" active={true} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Quick access ── */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">Quick Access</p>

              {/* Prestart link */}
              <button
                onClick={() => navigate('/prestart')}
                className="flex items-center gap-4 bg-white border border-gray-200 rounded-2xl px-5 py-4 mb-3 w-full hover:bg-orange-50 hover:border-orange-200 active:bg-orange-100 transition-colors text-left"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shrink-0 shadow-md shadow-amber-200">
                  <ClipboardCheck size={22} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-bold text-base leading-tight">Prestart Check</p>
                  <p className="text-gray-400 text-xs mt-0.5">Complete daily vehicle prestart</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>

              {/* Home */}
              <Link
                to="/home"
                className="flex items-center gap-4 bg-white border border-gray-200 rounded-2xl px-5 py-4 mb-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center shrink-0 shadow-md shadow-orange-200">
                  <LayoutDashboard size={22} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-bold text-base leading-tight">Home</p>
                  <p className="text-gray-400 text-xs mt-0.5">Portal overview &amp; activity</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </Link>

              {/* Tools row */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {([
                  { label: 'Builders Calc', bg: 'bg-blue-500',   icon: <Calculator size={20} className="text-white" />, onClick: () => setShowBuildersCalc(true) },
                  { label: 'Take-off Pad',  bg: 'bg-violet-500', icon: <Layers size={20} className="text-white" />,     onClick: () => setShowTakeoffPad(true) },
                  { label: 'Job Cost',      bg: 'bg-amber-500',  icon: <Receipt size={20} className="text-white" />,    onClick: () => setShowJobCost(true) },
                ] as const).map(t => (
                  <button key={t.label} onClick={t.onClick} className="flex flex-col items-center gap-2.5 bg-white border border-gray-200 rounded-2xl py-5 px-3 hover:bg-gray-50 active:bg-gray-100 transition-colors" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div className={`w-11 h-11 rounded-2xl ${t.bg} flex items-center justify-center`}>{t.icon}</div>
                    <span className="text-gray-700 text-xs font-bold text-center leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>

              {/* Secondary row */}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setShowAttendance(true)} className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-xl py-3.5 px-2 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center"><LogIn size={16} className="text-white" /></div>
                  <span className="text-gray-600 text-xs font-semibold text-center leading-tight">Attendance</span>
                </button>
                <Link to="/safety" className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-xl py-3.5 px-2 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center"><HardHat size={16} className="text-white" /></div>
                  <span className="text-gray-600 text-xs font-semibold text-center leading-tight">Safety</span>
                </Link>
                <Link to="/fleet" className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-xl py-3.5 px-2 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center"><Truck size={16} className="text-white" /></div>
                  <span className="text-gray-600 text-xs font-semibold text-center leading-tight">Fleet</span>
                </Link>
              </div>
            </div>

            {/* ── Launch ── */}
            <Link to="/jobs" className="flex items-center justify-center gap-3 w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-black py-5 rounded-2xl transition-colors shadow-lg shadow-orange-500/25">
              <Rocket size={20} />
              <span className="text-base">Launch</span>
            </Link>

            <div className="h-8" />
          </div>
        </div>
      </div>

      {/* ── Sheets ── */}
      <AnimatePresence>
        {showPicker && (
          <VehiclePicker
            vehicles={vehicles}
            loading={vehiclesLoading}
            onSelect={v => { setShowPicker(false); void handleStartSession(v); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
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
      <AnimatePresence>
        {showJobCost && <JobCostSheet onClose={() => setShowJobCost(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showAttendance && <AttendanceSheet onClose={() => setShowAttendance(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showBuildersCalc && (
          <ToolSheet title="Builders Calc" icon={<Calculator size={16} className="text-blue-400" />} onClose={() => setShowBuildersCalc(false)}>
            <BuildersCalc />
          </ToolSheet>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTakeoffPad && (
          <ToolSheet title="Take-off Pad" icon={<Layers size={16} className="text-violet-400" />} onClose={() => setShowTakeoffPad(false)}>
            <TakeoffPad />
          </ToolSheet>
        )}
      </AnimatePresence>
    </>
  );
}
