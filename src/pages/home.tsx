/**
 * HomeScreen — Light-theme icon launcher.
 * Clean white/light-grey background, solid vibrant icon tiles,
 * dark text — iOS-style feel, not dark like the drive app.
 */

import { useState, useEffect, useRef, type ComponentType, type ReactNode, type ChangeEvent } from 'react';
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Camera, Car, FileText, StickyNote, BookOpen, Clock, TrendingUp, User, DollarSign, Loader2, Plus, ImageIcon, LogIn, CheckCircle2, UserCheck, Navigation, ClipboardCheck, ShieldAlert, X, HardHat, ChevronRight, Layers, CalendarDays, LogOut, Settings, HardHat as HardHatIcon, Zap, RefreshCw, AlertTriangle, Search } from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { useSession, signOut } from '@/lib/auth/auth-client';
import JobPickerSheet from '@/components/JobPickerSheet';
import { invalidateMeCache } from '@/lib/usePermissions';
import { invalidateTerminologyCache } from '@/lib/useTerminology';
import { invalidateSubscriptionCache } from '@/lib/useSubscriptionGate';
import { invalidateSupportModeCache } from '@/lib/useSupportMode';
import StartDrivingModal from '@/components/fleet/StartDrivingModal';
import NotificationList from '@/components/NotificationList';
import MyTasksPanel from '@/components/notes/MyTasksPanel';
import PagedHomeScreen from '@/components/home/PagedHomeScreen';

import AppPermissionsOnboarding, { hasCompletedOnboarding } from '@/components/AppPermissionsOnboarding';
import TermsAcceptanceGate, { hasAcceptedTerms } from '@/components/TermsAcceptanceGate';
import { isNative } from '@/lib/capacitor-plugins';
// ── Types ─────────────────────────────────────────────────────────────────────

// ── Icon definitions ──────────────────────────────────────────────────────────
// Solid, saturated colours — light theme needs full-opacity backgrounds
// NOTE: Field/Safety/Tools/Management icons are now defined in src/lib/homeIcons.ts
// These local arrays remain for the PLATFORM section (platform owner only, not permission-controlled)

// ── Shared sheet backdrop + panel ─────────────────────────────────────────────

function Sheet({
  open,
  onClose,
  title,
  titleIcon: TitleIcon,
  titleIconClass,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon: ComponentType<{
    size?: number;
    className?: string;
  }>;
  titleIconClass: string;
  children: ReactNode;
}) {
  return <AnimatePresence>
      {open && <>
          <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 30,
        stiffness: 320
      }} className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl max-h-[88vh] flex flex-col overflow-hidden" style={{
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12)'
      }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <TitleIcon size={16} className={titleIconClass} />
                <span className="text-gray-900 font-bold text-sm">{title}</span>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            {/* Content */}
            <div className="overflow-y-auto flex-1 px-4 py-4">
              {children}
            </div>
          </motion.div>
        </>}
    </AnimatePresence>;
}

// ── Notes job picker sheet ────────────────────────────────────────────────────

interface JobOption {
  id: number;
  name: string;
  jobNumber?: string | null;
}
function NotesJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    setLoading(true);
    fetch('/api/jobs/search?status=active&limit=100', {
      credentials: 'include'
    }).then(r => r.json()).then((data: {
      jobs?: JobOption[];
    } | JobOption[]) => {
      setJobs(Array.isArray(data) ? data : data.jobs ?? []);
    }).catch(() => setJobs([])).finally(() => setLoading(false));
  }, [open]);
  const filtered = query.trim() ? jobs.filter(j => j.name.toLowerCase().includes(query.toLowerCase()) || (j.jobNumber ?? '').toLowerCase().includes(query.toLowerCase())) : jobs;
  function handleSelect(job: JobOption) {
    onClose();
    navigate(`/jobs/${job.id}/notes`);
  }
  return <AnimatePresence>
      {open && <>
          <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 30,
        stiffness: 320
      }} className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl flex flex-col overflow-hidden" style={{
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
        maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px) - 4rem)'
      }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-yellow-100 flex items-center justify-center">
                  <StickyNote size={15} className="text-yellow-500" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Select Job</h2>
                  <p className="text-gray-400 text-xs">Choose a job to view notes</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"><X size={14} /></button>
            </div>
            {/* Search — always visible */}
            <div className="px-4 pt-3 pb-1 shrink-0">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
                <Search size={14} className="text-gray-400 shrink-0" />
                <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search jobs, job numbers…" className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none min-w-0" />
                {query && <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loading ? <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-yellow-300 border-t-yellow-500 rounded-full animate-spin" />
                </div> : filtered.length === 0 ? <div className="text-center py-10">
                  <HardHat size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">{query ? 'No jobs match your search' : 'No active jobs found'}</p>
                </div> : filtered.map(job => <button key={job.id} onClick={() => handleSelect(job)} className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-yellow-50 hover:border-yellow-200 active:bg-yellow-100 rounded-2xl px-4 py-3.5 text-left transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
                    <StickyNote size={16} className="text-yellow-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                    {job.jobNumber && <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>}
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>)}
            </div>
            <div className="shrink-0" style={{
          height: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)'
        }} />
          </motion.div>
        </>}
    </AnimatePresence>;
}

// ── Delays job picker sheet ───────────────────────────────────────────────────

function DelaysJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return <JobPickerSheet open={open} onClose={onClose} title="Select Job" subtitle="Choose a job to view delays" iconBg="bg-red-100" iconFg="text-red-500" Icon={Clock} onSelect={job => navigate(`/jobs/${job.id}/delays`)} />;
}

// ── Log Cost sheet (worker receipt capture) ───────────────────────────────────

const COST_TYPES = [{
  value: 'MATERIAL',
  label: 'Material'
}, {
  value: 'LABOUR',
  label: 'Labour'
}, {
  value: 'PLANT',
  label: 'Plant / Equipment'
}, {
  value: 'SUBCONTRACTOR',
  label: 'Subcontractor'
}, {
  value: 'RECEIPT',
  label: 'Receipt / Purchase'
}, {
  value: 'OTHER',
  label: 'Other'
}];
function LogCostSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);

  // Form fields
  const [eventType, setEventType] = useState('MATERIAL');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoIsHeic, setPhotoIsHeic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track blob URL so we can revoke it on unmount / clear
  const photoBlobRef = useRef<string | null>(null);

  // Load jobs on open
  useEffect(() => {
    if (!open) return;
    setJobsLoading(true);
    fetch('/api/jobs/search?status=active&limit=100', {
      credentials: 'include'
    }).then(r => r.json()).then((data: {
      jobs?: JobOption[];
    } | JobOption[]) => {
      const list = Array.isArray(data) ? data : data.jobs ?? [];
      setJobs(list);
    }).catch(() => setJobs([])).finally(() => setJobsLoading(false));
  }, [open]);

  // Reset on close — also revoke any blob URL
  useEffect(() => {
    if (!open) {
      setSelectedJob(null);
      setEventType('MATERIAL');
      setDescription('');
      setAmount('');
      setEntryDate(new Date().toISOString().slice(0, 10));
      setReference('');
      // Revoke blob URL before clearing
      if (photoBlobRef.current) {
        URL.revokeObjectURL(photoBlobRef.current);
        photoBlobRef.current = null;
      }
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoIsHeic(false);
      setSaved(false);
      setError('');
    }
  }, [open]);
  function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    // Revoke previous blob URL to avoid memory leak
    if (photoBlobRef.current) {
      URL.revokeObjectURL(photoBlobRef.current);
      photoBlobRef.current = null;
    }

    // Detect HEIC — WKWebView cannot render HEIC in an <img> tag
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const isHeic = f.type === 'image/heic' || f.type === 'image/heif' || ext === 'heic' || ext === 'heif';
    setPhotoFile(f);
    setPhotoIsHeic(isHeic);
    if (isHeic) {
      // No preview available — show placeholder instead
      setPhotoPreview(null);
    } else {
      // Use createObjectURL — never FileReader.readAsDataURL which can OOM on iOS
      try {
        const url = URL.createObjectURL(f);
        photoBlobRef.current = url;
        setPhotoPreview(url);
      } catch {
        setPhotoPreview(null);
      }
    }

    // Reset input so the same file can be re-selected
    e.target.value = '';
  }
  async function handleSubmit() {
    if (!selectedJob) {
      setError('Please select a job');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (!amount || isNaN(parseFloat(amount))) {
      setError('Enter a valid amount');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('eventType', eventType);
      fd.append('description', description.trim());
      fd.append('qty', '1');
      fd.append('rate', String(parseFloat(amount)));
      fd.append('entryDate', entryDate);
      fd.append('reference', reference.trim());
      fd.append('status', 'pending');
      fd.append('sourceModule', 'worker-log');
      if (photoFile) fd.append('photo', photoFile);
      const res = await fetch(`/api/jobs/${selectedJob.id}/ledger`, {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      if (!res.ok) {
        const d = (await res.json()) as {
          error?: string;
        };
        throw new Error(d.error ?? 'Save failed');
      }
      setSaved(true);
      setTimeout(() => onClose(), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }
  return <AnimatePresence>
      {open && <>
          <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 30,
        stiffness: 320
      }} className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl flex flex-col overflow-hidden" style={{
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
        maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px) - 4rem)'
      }} onClick={e => e.stopPropagation()}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <DollarSign size={15} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Log a Cost</h2>
                  <p className="text-gray-400 text-xs">Snap a receipt or enter manually</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

              {/* Success state */}
              {saved ? <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                    <DollarSign size={24} className="text-emerald-600" />
                  </div>
                  <p className="text-gray-900 font-bold text-base">Cost logged!</p>
                  <p className="text-gray-400 text-sm text-center">Submitted for admin review</p>
                </div> : <>
                  {/* Step 1 — Job picker */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Job</p>
                    {jobsLoading ? <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                        <Loader2 size={14} className="animate-spin" /> Loading jobs…
                      </div> : jobs.length === 0 ? <p className="text-gray-400 text-sm py-2">No active jobs found.</p> : <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {jobs.map(job => <button key={job.id} onClick={() => setSelectedJob(job)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition-colors ${selectedJob?.id === job.id ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${selectedJob?.id === job.id ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                              {job.jobNumber && <p className="text-gray-400 text-xs font-mono">{job.jobNumber}</p>}
                            </div>
                          </button>)}
                      </div>}
                  </div>

                  {/* Step 2 — Cost details (shown once job selected) */}
                  {selectedJob && <motion.div initial={{
              opacity: 0,
              y: 8
            }} animate={{
              opacity: 1,
              y: 0
            }} className="space-y-3">
                      {/* Receipt photo */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Receipt Photo <span className="text-gray-300 font-normal normal-case">(optional)</span></p>
                        {/* No capture="environment" — let iOS show the full picker (camera + library).
                            capture= forces camera-only and can crash if permission not yet granted. */}
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handlePhoto} />
                        {photoFile ? <div className="relative w-full rounded-xl overflow-hidden border border-gray-200">
                            {photoPreview ? <img src={photoPreview} alt="Receipt" className="w-full h-36 object-cover" onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }} /> : photoIsHeic ? (/* HEIC cannot be previewed in WKWebView — show a placeholder */
                  <div className="w-full h-24 flex flex-col items-center justify-center gap-1.5 bg-slate-100">
                                <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded">HEIC</span>
                                <span className="text-xs text-slate-400">{photoFile.name}</span>
                                <span className="text-[10px] text-slate-400">Will upload correctly</span>
                              </div>) : <div className="w-full h-24 flex items-center justify-center bg-slate-100">
                                <span className="text-xs text-slate-400">{photoFile.name}</span>
                              </div>}
                            <button onClick={() => {
                    if (photoBlobRef.current) {
                      URL.revokeObjectURL(photoBlobRef.current);
                      photoBlobRef.current = null;
                    }
                    setPhotoFile(null);
                    setPhotoPreview(null);
                    setPhotoIsHeic(false);
                  }} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white">
                              <X size={12} />
                            </button>
                          </div> : <button onClick={() => fileInputRef.current?.click()} className="w-full h-24 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors">
                            <ImageIcon size={20} />
                            <span className="text-xs font-medium">Tap to attach receipt</span>
                          </button>}
                      </div>

                      {/* Type */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Cost Type</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {COST_TYPES.map(t => <button key={t.value} onClick={() => setEventType(t.value)} className={`rounded-xl px-2 py-2 text-xs font-semibold border transition-colors ${eventType === t.value ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                              {t.label}
                            </button>)}
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Description</p>
                        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What was purchased / done?" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors" />
                      </div>

                      {/* Amount + Date row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Amount (ex GST)</p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                            <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors" />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Date</p>
                          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors" />
                        </div>
                      </div>

                      {/* Reference */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Reference / Invoice # <span className="text-gray-300 font-normal normal-case">(optional)</span></p>
                        <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. INV-1234" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors" />
                      </div>

                      {/* Error */}
                      {error && <p className="text-red-500 text-xs font-medium bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                    </motion.div>}
                </>}
            </div>

            {/* Footer CTA */}
            {!saved && selectedJob && <div className="px-4 pt-3 border-t border-gray-100 shrink-0" style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)'
        }}>
                <button onClick={() => void handleSubmit()} disabled={saving} className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {saving ? 'Saving…' : 'Submit Cost'}
                </button>
                <p className="text-center text-gray-400 text-xs mt-2">Submitted as pending — admin will review</p>
              </div>}
          </motion.div>
        </>}
    </AnimatePresence>;
}

// ── Active status bar ─────────────────────────────────────────────────────────

interface ActiveStatus {
  jobSignIn: {
    jobId: number;
    jobName: string | null;
    jobNumber: string | null;
    signedInAt: string | null;
  } | null;
  driving: {
    sessionId: number;
    assetName: string | null;
    assetType: string | null;
    rego: string | null;
    startAt: string | null;
  } | null;
  drivingSessions?: Array<{
    sessionId: number;
    assetName: string | null;
    assetType: string | null;
    rego: string | null;
    startAt: string | null;
  }>;
}
function useActiveStatus(refreshKey: number) {
  const [status, setStatus] = useState<ActiveStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Clear stale state immediately so the widget disappears while we refetch
    setStatus(null);
    fetch('/api/me/active-status', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() as Promise<ActiveStatus & {
      ok: boolean;
    }> : null).then(data => {
      if (!cancelled) setStatus(data?.ok ? data : null);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return status;
}
function elapsed(isoStr: string | null): string {
  if (!isoStr) return '';
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}
function ActiveStatusBar({
  status,
  onJobSignOut,
  onDriveStop
}: {
  status: ActiveStatus | null;
  onJobSignOut: (jobId: number) => void;
  onDriveStop: (sessionId: number) => void;
}) {
  const hasJob = !!status?.jobSignIn;
  const sessions = status?.drivingSessions ?? (status?.driving ? [status.driving] : []);
  const hasDrive = sessions.length > 0;
  const [signingOut, setSigningOut] = useState(false);
  if (!hasJob && !hasDrive) return null;
  async function handleDirectSignOut(e: React.MouseEvent) {
    e.stopPropagation();
    if (!status?.jobSignIn || signingOut) return;
    setSigningOut(true);
    try {
      const res = await fetch(`/api/jobs/${status.jobSignIn.jobId}/signout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notSignedIn?: boolean;
        error?: string;
      };
      // Success OR already signed out — either way, dismiss the widget
      if (res.ok || data.notSignedIn) {
        onJobSignOut(status.jobSignIn.jobId);
      } else {
        // Real error — fall back to sheet
        onJobPress();
      }
    } catch {
      onJobPress();
    } finally {
      setSigningOut(false);
    }
  }
  return <motion.div initial={{
    opacity: 0,
    y: -6
  }} animate={{
    opacity: 1,
    y: 0
  }} exit={{
    opacity: 0,
    y: -6
  }} transition={{
    duration: 0.25
  }} className="px-4 py-2" style={{
    background: 'rgba(17,24,39,0.96)',
    borderBottom: '1px solid rgba(255,255,255,0.06)'
  }}>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        {/* Label */}
        <span className="text-white/30 text-[9px] font-bold uppercase tracking-[0.1em] shrink-0">
          Active
        </span>

        {/* Job sign-in pill — one tap signs out immediately */}
        {hasJob && <button onClick={handleDirectSignOut} disabled={signingOut} className="flex items-center gap-1.5 rounded-full px-3 py-1 shrink-0 active:opacity-70 transition-opacity disabled:opacity-50" style={{
        background: 'rgba(16,185,129,0.15)',
        border: '1px solid rgba(16,185,129,0.35)'
      }} aria-label="Sign out of job">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <HardHatIcon size={10} className="text-emerald-400 shrink-0" />
            <span className="text-emerald-300 text-[11px] font-semibold truncate max-w-[120px]">
              {status!.jobSignIn!.jobName ?? `Job #${status!.jobSignIn!.jobId}`}
            </span>
            {status!.jobSignIn!.signedInAt && <span className="text-emerald-500 text-[10px] font-medium shrink-0">
                {elapsed(status!.jobSignIn!.signedInAt)}
              </span>}
            {signingOut ? <span className="w-3 h-3 border border-emerald-400/60 border-t-transparent rounded-full animate-spin shrink-0" /> : <X size={11} strokeWidth={2.5} className="text-emerald-400/70 shrink-0" />}
          </button>}

        {/* One driving pill per active session */}
        {sessions.map(s => <button key={s.sessionId} onClick={() => onDriveStop(s.sessionId)} className="flex items-center gap-1.5 rounded-full px-3 py-1 shrink-0 active:scale-95 transition-all" style={{
        background: 'rgba(59,130,246,0.15)',
        border: '1px solid rgba(59,130,246,0.35)'
      }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <Navigation size={10} className="text-blue-400 shrink-0" />
            <span className="text-blue-300 text-[11px] font-semibold truncate max-w-[120px]">
              {s.assetName ?? 'Vehicle'}
            </span>
            {s.rego && <span className="text-blue-400/70 text-[10px] font-mono shrink-0">
                {s.rego}
              </span>}
            {s.startAt && <span className="text-blue-400 text-[10px] font-medium shrink-0">
                {elapsed(s.startAt)}
              </span>}
          </button>)}
      </div>
    </motion.div>;
}

// ── Forms + Progress job picker wrappers ──────────────────────────────────────

function FormsJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return <JobPickerSheet open={open} onClose={onClose} title="Job Forms" subtitle="Select a job to view forms" iconBg="bg-purple-100" iconFg="text-purple-600" Icon={FileText} onSelect={job => navigate(`/jobs/${job.id}/forms`)} />;
}
function ProgressJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return <JobPickerSheet open={open} onClose={onClose} title="Job Progress" subtitle="Select a job to update progress" iconBg="bg-cyan-100" iconFg="text-cyan-600" Icon={TrendingUp} onSelect={job => navigate(`/jobs/${job.id}/progress`)} />;
}
function SitePrestartJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return <JobPickerSheet open={open} onClose={onClose} title="Site Prestart" subtitle="Select a job to open its site prestart" iconBg="bg-lime-100" iconFg="text-lime-700" Icon={HardHat} onSelect={job => navigate(`/jobs/${job.id}/site-prestart`, {
    state: {
      returnTo: '/home'
    }
  })} />;
}
function RiskyJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return <JobPickerSheet open={open} onClose={onClose} title="Risk Assessment & Work Permits" subtitle="Select a job to start a risk assessment" iconBg="bg-rose-100" iconFg="text-rose-700" Icon={ShieldAlert} onSelect={job => navigate(`/jobs/${job.id}/risky`, {
    state: {
      returnTo: '/home'
    }
  })} />;
}

// ── Phone Job Card creation sheet ─────────────────────────────────────────────
// 3-step flow: form → completion (photos + sign-off) → done
// Keeps each step focused and field-first.
function PhoneJobCardSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'completion' | 'done'>('form');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [createdNum, setCreatedNum] = useState('');
  const [customers, setCustomers] = useState<{
    id: number;
    name: string;
  }[]>([]);
  const [team, setTeam] = useState<{
    id: string;
    name: string;
  }[]>([]);

  // Step 1: core fields
  const [form, setForm] = useState({
    customerId: '',
    customerNameOverride: '',
    siteAddress: '',
    serviceDate: new Date().toISOString().slice(0, 10),
    assignedUserId: '',
    workDescription: '',
    labourHours: '',
    labourRate: ''
  });

  // Step 2: completion fields
  const [completionSummary, setCompletionSummary] = useState('');
  const [authorisedBy, setAuthorisedBy] = useState('');
  const [approvalDate, setApprovalDate] = useState(new Date().toISOString().slice(0, 10));
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setStep('form');
    setError('');
    setCreatedId(null);
    setCreatedNum('');
    setForm({
      customerId: '',
      customerNameOverride: '',
      siteAddress: '',
      serviceDate: new Date().toISOString().slice(0, 10),
      assignedUserId: '',
      workDescription: '',
      labourHours: '',
      labourRate: ''
    });
    setCompletionSummary('');
    setAuthorisedBy('');
    setApprovalDate(new Date().toISOString().slice(0, 10));
    setPhotoFiles([]);
    setPhotoPreviewUrls([]);
    setPhotoUploadError(null);
    fetch('/api/customers?status=active&limit=200', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((d: {
      customers?: {
        id: number;
        name: string;
      }[];
    } | null) => setCustomers(d?.customers ?? [])).catch(() => {});
    fetch('/api/team/members', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((d: {
      members?: {
        id: string;
        name: string;
      }[];
    } | null) => setTeam(d?.members ?? [])).catch(() => {});
  }, [open]);
  function setF(k: keyof typeof form, v: string) {
    setForm(f => ({
      ...f,
      [k]: v
    }));
  }
  function handlePhotoFiles(files: FileList | null) {
    if (!files?.length) return;
    const newFiles = Array.from(files);
    setPhotoFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(f => {
      const url = URL.createObjectURL(f);
      setPhotoPreviewUrls(prev => [...prev, url]);
    });
  }
  function removePhoto(i: number) {
    URL.revokeObjectURL(photoPreviewUrls[i]);
    setPhotoFiles(prev => prev.filter((_, idx) => idx !== i));
    setPhotoPreviewUrls(prev => prev.filter((_, idx) => idx !== i));
  }
  async function handleCreate() {
    if (!form.workDescription.trim()) {
      setError('Work description is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        workDescription: form.workDescription,
        siteAddress: form.siteAddress || undefined,
        serviceDate: form.serviceDate || undefined,
        completionSummary: completionSummary || undefined,
        authorisedBy: authorisedBy || undefined,
        approvalDate: approvalDate || undefined,
        status: completionSummary || authorisedBy ? 'complete' : 'draft'
      };
      if (form.customerId) body.customerId = Number(form.customerId);else if (form.customerNameOverride) body.customerNameOverride = form.customerNameOverride;
      if (form.assignedUserId) {
        body.assignedUserId = form.assignedUserId;
        const m = team.find(t => t.id === form.assignedUserId);
        if (m) body.assignedName = m.name;
      }
      if (form.labourHours) body.labourHours = Number(form.labourHours);
      if (form.labourRate) body.labourRate = Number(form.labourRate);
      const res = await fetch('/api/job-cards', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as {
        jobCard?: {
          id: number;
          card_number: string;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const newId = data.jobCard!.id;
      setCreatedId(newId);
      setCreatedNum(data.jobCard!.card_number);

      // Upload photos if any — read the response and surface real errors
      let photoUploadError: string | null = null;
      if (photoFiles.length > 0) {
        try {
          const fd = new FormData();
          photoFiles.forEach(f => fd.append('photos', f));
          const photoRes = await fetch(`/api/job-cards/${newId}/photos`, {
            method: 'POST',
            credentials: 'include',
            body: fd
          });
          const photoData = (await photoRes.json()) as {
            photos?: unknown[];
            error?: string;
          };
          if (!photoRes.ok) {
            photoUploadError = photoData.error ?? `Upload failed (${photoRes.status})`;
            console.error(`[job-card photos] upload failed: ${photoUploadError}`);
          }
        } catch (photoErr) {
          photoUploadError = photoErr instanceof Error ? photoErr.message : 'Photo upload failed';
          console.error('[job-card photos] upload error:', photoErr);
        }
      }
      setPhotoUploadError(photoUploadError);
      setStep('done');
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }
  const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white';
  const labelCls = 'block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1';
  return <>
      {/* Backdrop */}
      <div className={`fixed inset-0 z-[65] bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} aria-hidden="true" />
      {/* Right-side sheet */}
      <div className={`fixed top-0 right-0 bottom-0 z-[70] w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-modal="true" aria-label="New Job Card">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0 safe-top">
          <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
            <Zap size={17} className="text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-tight">New Job Card</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {step === 'form' ? 'Step 1 of 2 — Details' : step === 'completion' ? 'Step 2 of 2 — Completion & Photos' : 'Created'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
      {step === 'done' ? (/* ── Done ── */
        <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-green-600" />
          </div>
          <div>
            <p className="text-[17px] font-bold text-gray-900">Job Card created</p>
            <p className="text-[13px] text-gray-400 mt-1 font-mono">{createdNum}</p>
            {photoFiles.length > 0 && !photoUploadError && <p className="text-[12px] text-green-600 mt-1">{photoFiles.length} photo{photoFiles.length !== 1 ? 's' : ''} attached</p>}
            {photoUploadError && <p className="text-[12px] text-amber-600 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg leading-snug">
                Job Card saved, but photos could not be uploaded. Open the Job Card to retry.
                <br /><span className="text-[11px] text-amber-500 font-mono">{photoUploadError}</span>
              </p>}
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <button onClick={() => {
              onClose();
              navigate(`/job-cards/${createdId}`);
            }} className="w-full py-3 rounded-xl bg-yellow-500 text-white font-bold text-[15px] hover:bg-yellow-600 transition-colors">
              Open Job Card
            </button>
            <button onClick={() => {
              onClose();
              navigate('/job-cards');
            }} className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-[14px] hover:bg-gray-200 transition-colors">
              View all Job Cards
            </button>
            <button onClick={onClose} className="w-full py-2 text-gray-400 text-[13px] font-medium hover:text-gray-600 transition-colors">
              Close
            </button>
          </div>
        </div>) : step === 'completion' ? (/* ── Step 2: Completion + Photos ── */
        <div className="flex flex-col gap-4 pb-6">
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-100 rounded-xl text-[12px] text-yellow-700">
            <CheckCircle2 size={13} className="shrink-0" />
            <span>Optional — add completion details and photos before saving</span>
          </div>

          {error && <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertTriangle size={14} className="shrink-0" />
              {error}
            </div>}

          {/* Labour */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Labour hours</label>
              <input type="number" min="0" step="0.25" value={form.labourHours} onChange={e => setF('labourHours', e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Rate ($/hr)</label>
              <input type="number" min="0" step="0.01" value={form.labourRate} onChange={e => setF('labourRate', e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
          </div>

          {/* Completion summary */}
          <div>
            <label className={labelCls}>Work completed / report</label>
            <textarea value={completionSummary} onChange={e => setCompletionSummary(e.target.value)} rows={3} placeholder="Summary of work completed…" className={`${inputCls} resize-none`} />
          </div>

          {/* Authorised by + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Authorised by</label>
              <input type="text" value={authorisedBy} onChange={e => setAuthorisedBy(e.target.value)} placeholder="Customer name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Sign date</label>
              <input type="date" value={approvalDate} onChange={e => setApprovalDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Photos */}
          <div>
            <label className={labelCls}>Photos</label>
            {/* No capture="environment" — lets iOS show the native picker:
                Take Photo / Photo Library / Browse Files.
                capture= forces camera-only and breaks if permission not yet granted. */}
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhotoFiles(e.target.files)} />
            {photoPreviewUrls.length > 0 && <div className="grid grid-cols-3 gap-2 mb-2">
                {photoPreviewUrls.map((url, i) => <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <X size={10} />
                    </button>
                  </div>)}
              </div>}
            <button onClick={() => photoInputRef.current?.click()} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-[13px] font-medium flex items-center justify-center gap-2 hover:border-yellow-300 hover:text-yellow-600 transition-colors">
              <Camera size={16} />
              {photoPreviewUrls.length > 0 ? 'Add more photos' : 'Take or choose photos'}
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <button onClick={() => void handleCreate()} disabled={saving} className="w-full py-4 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-[16px] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
              Save Job Card
            </button>
            <button onClick={() => setStep('form')} className="w-full py-2 text-gray-400 text-[13px] font-medium hover:text-gray-600 transition-colors">
              ← Back to details
            </button>
          </div>
        </div>) : (/* ── Step 1: Core form ── */
        <div className="flex flex-col gap-4 pb-6">
          {error && <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertTriangle size={14} className="shrink-0" />
              {error}
            </div>}

          {/* Customer — prefer existing record */}
          <div>
            <label className={labelCls}>Customer</label>
            <select value={form.customerId} onChange={e => setF('customerId', e.target.value)} className={inputCls}>
              <option value="">— Select customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!form.customerId && <input type="text" value={form.customerNameOverride} onChange={e => setF('customerNameOverride', e.target.value)} placeholder="Or type a one-off name…" className={`${inputCls} mt-2`} />}
          </div>

          {/* Site */}
          <div>
            <label className={labelCls}>Site address</label>
            <input type="text" value={form.siteAddress} onChange={e => setF('siteAddress', e.target.value)} placeholder="123 Main St" className={inputCls} />
          </div>

          {/* Service date */}
          <div>
            <label className={labelCls}>Service date</label>
            <input type="date" value={form.serviceDate} onChange={e => setF('serviceDate', e.target.value)} className={inputCls} />
          </div>

          {/* Work description */}
          <div>
            <label className={labelCls}>Work description <span className="text-red-500">*</span></label>
            <textarea value={form.workDescription} onChange={e => setF('workDescription', e.target.value)} rows={3} placeholder="Describe the work…" className={`${inputCls} resize-none`} />
          </div>

          {/* Assigned worker */}
          <div>
            <label className={labelCls}>Assigned worker</label>
            <select value={form.assignedUserId} onChange={e => setF('assignedUserId', e.target.value)} className={inputCls}>
              <option value="">— Unassigned —</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Next: completion step */}
          <button onClick={() => {
            if (!form.workDescription.trim()) {
              setError('Work description is required');
              return;
            }
            setError('');
            setStep('completion');
          }} className="w-full py-4 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-[16px] transition-colors flex items-center justify-center gap-2 mt-2">
            <CheckCircle2 size={18} />
            Next: Completion &amp; Photos
          </button>

          <button onClick={() => {
            if (!form.workDescription.trim()) {
              setError('Work description is required');
              return;
            }
            setError('');
            void handleCreate();
          }} disabled={saving} className="w-full py-3 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-[14px] transition-colors hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
            Save as Draft
          </button>
        </div>)}
        </div>{/* end scrollable body */}
      </div>{/* end sheet */}
    </>;
}
function ScheduleJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return <JobPickerSheet open={open} onClose={onClose} title="Job Schedule" subtitle="Select a job to view its schedule" iconBg="bg-violet-100" iconFg="text-violet-600" Icon={CalendarDays} onSelect={job => navigate(`/jobs/${job.id}/schedule`)} />;
}
function DrawingsJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return <JobPickerSheet open={open} onClose={onClose} title="Drawings" subtitle="Select a job to view its drawings" iconBg="bg-lime-100" iconFg="text-lime-600" Icon={Layers} onSelect={job => navigate(`/jobs/${job.id}/drawings`)} />;
}
function PrestartFleetPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<FleetOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/fleet/vehicles', {
      credentials: 'include'
    }).then(r => r.json()).then((data: {
      vehicles?: FleetOption[];
    } | FleetOption[]) => {
      setAssets(Array.isArray(data) ? data : data.vehicles ?? []);
    }).catch(() => setAssets([])).finally(() => setLoading(false));
  }, [open]);
  return <AnimatePresence>
      {open && <>
          <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 30,
        stiffness: 320
      }} className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl flex flex-col overflow-hidden" style={{
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
        maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px) - 4rem)'
      }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <ClipboardCheck size={15} className="text-violet-700" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Prestart Check</h2>
                  <p className="text-gray-400 text-xs">Select equipment to prestart</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
              {loading ? <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Loading fleet…
                </div> : assets.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">No fleet assets found</p> : assets.map(asset => <button key={asset.id} onClick={() => {
            onClose();
            navigate(`/prestart?vehicleId=${asset.id}`);
          }} className="w-full flex items-center gap-3 bg-gray-50 hover:bg-violet-50 border border-gray-200 hover:border-violet-200 rounded-xl px-3 py-3 text-left transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <ClipboardCheck size={16} className="text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{asset.name}</p>
                    <p className="text-gray-400 text-xs">
                      {[asset.type, asset.rego].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>)}
            </div>
            <div className="shrink-0" style={{
          height: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)'
        }} />
          </motion.div>
        </>}
    </AnimatePresence>;
}

// ── Sign In / Out sheet ───────────────────────────────────────────────────────

interface OnSiteUser {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  signed_in_at: string | null;
  actor_type: string;
}
interface SignInStatus {
  signedIn: boolean;
  lastAction: string | null;
  lastActionAt: string | null;
  currentlyOnSite: OnSiteUser[];
}
function SignInOutSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    role
  } = usePermissions();
  const isSupervisor = role === 'owner' || role === 'admin' || role === 'supervisor';
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);
  const [jobQuery, setJobQuery] = useState('');
  const [status, setStatus] = useState<SignInStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [forcingOut, setForcingOut] = useState<string | null>(null); // userId being forced out
  const [result, setResult] = useState<{
    type: 'signin' | 'signout' | null;
    name?: string;
  } | null>(null);
  const [error, setError] = useState('');

  // Load jobs on open
  useEffect(() => {
    if (!open) return;
    setJobsLoading(true);
    fetch('/api/jobs/search?status=active&limit=100', {
      credentials: 'include'
    }).then(r => r.json()).then((data: {
      jobs?: JobOption[];
    } | JobOption[]) => {
      const list = Array.isArray(data) ? data : data.jobs ?? [];
      setJobs(list);
    }).catch(() => setJobs([])).finally(() => setJobsLoading(false));
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedJob(null);
      setJobQuery('');
      setStatus(null);
      setResult(null);
      setError('');
    }
  }, [open]);

  // Load sign-in status when job selected
  async function loadStatus(jobId: number) {
    setStatusLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/signin-status`, {
        credentials: 'include'
      });
      if (res.status === 401) {
        // Session expired or not authenticated
        setError('Session expired — please sign in again to continue.');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Server error (${res.status})`);
      }
      const data = (await res.json()) as SignInStatus;
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sign-in status');
    } finally {
      setStatusLoading(false);
    }
  }
  function handleSelectJob(job: JobOption) {
    setSelectedJob(job);
    void loadStatus(job.id);
  }
  async function handleSignIn() {
    if (!selectedJob) return;
    setActing(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/signin`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actorType: 'employee'
        })
      });
      if (res.status === 401) {
        setError('Session expired — please close this and sign in again.');
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        alreadySignedIn?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Sign in failed');
      if (data.alreadySignedIn) {
        setError('You are already signed in to this job.');
      } else {
        setResult({
          type: 'signin',
          name: selectedJob.name
        });
      }
      void loadStatus(selectedJob.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setActing(false);
    }
  }
  async function handleSignOut() {
    if (!selectedJob) return;
    setActing(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/signout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      if (res.status === 401) {
        setError('Session expired — please close this and sign in again.');
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        notSignedIn?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Sign out failed');
      if (data.notSignedIn) {
        setError('You are not currently signed in to this job.');
      } else {
        setResult({
          type: 'signout',
          name: selectedJob.name
        });
      }
      void loadStatus(selectedJob.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign out failed');
    } finally {
      setActing(false);
    }
  }
  async function handleForceSignOut(userId: string, userName: string) {
    if (!selectedJob) return;
    setForcingOut(userId);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/signout-user`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          notes: 'Supervisor sign-out via home screen'
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Force sign-out failed');
      setResult({
        type: 'signout',
        name: userName
      });
      await loadStatus(selectedJob.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Force sign-out failed');
    } finally {
      setForcingOut(null);
    }
  }
  function formatTime(iso: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
  const isSignedIn = status?.signedIn ?? false;

  // Guard: ignore backdrop clicks that arrive within 300 ms of the sheet
  // opening — this prevents the same touch that opened the sheet from
  // immediately closing it via event bubbling / fast tap propagation.
  const openedAtRef = useRef<number>(0);
  useEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);
  function handleBackdropClick() {
    if (Date.now() - openedAtRef.current < 300) return;
    onClose();
  }
  return <AnimatePresence>
      {open && <>
          <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={handleBackdropClick} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={handleBackdropClick}>
            <motion.div initial={{
          opacity: 0,
          y: 40
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: 40
        }} transition={{
          type: 'spring',
          damping: 30,
          stiffness: 340
        }} className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl" style={{
          maxHeight: 'min(680px, calc(100dvh - 60px))'
        }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <LogIn size={17} className="text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-gray-900 font-bold text-base leading-tight">Site Sign In / Out</h2>
                    <p className="text-gray-400 text-xs leading-tight mt-0.5">Record your attendance on site</p>
                  </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0">
                  <X size={15} />
                </button>
              </div>

              <div className="h-px bg-gray-100 shrink-0 mx-4" />

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

              {/* Job picker */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Select Job</p>
                {jobsLoading ? <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                    <Loader2 size={14} className="animate-spin" /> Loading jobs…
                  </div> : <>
                    {/* Search */}
                    <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5 mb-2">
                      <Search size={14} className="text-gray-400 shrink-0" />
                      <input type="text" value={jobQuery} onChange={e => setJobQuery(e.target.value)} placeholder="Search jobs, job numbers…" className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none min-w-0" />
                      {jobQuery && <button onClick={() => setJobQuery('')} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                      {(() => {
                    const q = jobQuery.trim().toLowerCase();
                    const filtered = q ? jobs.filter(j => j.name.toLowerCase().includes(q) || (j.jobNumber ?? '').toLowerCase().includes(q)) : jobs;
                    if (filtered.length === 0) {
                      return <p className="text-center text-gray-400 text-sm py-3">{jobQuery ? 'No jobs match your search' : 'No active jobs found'}</p>;
                    }
                    return filtered.map(job => <button key={job.id} onClick={() => handleSelectJob(job)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition-colors ${selectedJob?.id === job.id ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${selectedJob?.id === job.id ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                              {job.jobNumber && <p className="text-gray-400 text-xs font-mono">{job.jobNumber}</p>}
                            </div>
                          </button>);
                  })()}
                    </div>
                  </>}
              </div>

              {/* Status + action — always renders once a job is selected */}
              {selectedJob && <motion.div initial={{
              opacity: 0,
              y: 6
            }} animate={{
              opacity: 1,
              y: 0
            }} className="space-y-3">

                  {/* Loading spinner */}
                  {statusLoading && <div className="flex items-center justify-center py-6">
                      <Loader2 size={20} className="animate-spin text-indigo-400" />
                    </div>}

                  {/* Current status card — show once we have status OR after a result */}
                  {!statusLoading && (status || result) && <div className={`rounded-2xl px-4 py-3.5 flex items-center gap-3 ${isSignedIn ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSignedIn ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                        {isSignedIn ? <CheckCircle2 size={20} className="text-emerald-600" /> : <LogOut size={20} className="text-gray-400" />}
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${isSignedIn ? 'text-emerald-700' : 'text-gray-500'}`}>
                          {isSignedIn ? 'Currently signed in' : 'Not signed in'}
                        </p>
                        {status?.lastActionAt && <p className="text-xs text-gray-400">
                            Last {status.lastAction} at {formatTime(status.lastActionAt)}
                          </p>}
                      </div>
                    </div>}

                  {/* Result flash */}
                  {result && <motion.div initial={{
                opacity: 0,
                scale: 0.95
              }} animate={{
                opacity: 1,
                scale: 1
              }} className={`rounded-2xl px-4 py-3 flex items-center gap-2.5 ${result.type === 'signin' ? 'bg-indigo-50 border border-indigo-200' : 'bg-violet-50 border border-violet-200'}`}>
                      <CheckCircle2 size={16} className={result.type === 'signin' ? 'text-indigo-500' : 'text-violet-600'} />
                      <p className={`text-sm font-semibold ${result.type === 'signin' ? 'text-indigo-700' : 'text-violet-800'}`}>
                        {result.type === 'signin' ? `Signed in to ${result.name}` : `Signed out${result.name ? ` — ${result.name}` : ''}`}
                      </p>
                    </motion.div>}

                  {/* Error — always visible */}
                  {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      <p className="text-red-600 text-xs font-medium flex-1">{error}</p>
                      <button onClick={() => {
                  setError('');
                  void loadStatus(selectedJob.id);
                }} className="text-red-400 hover:text-red-600 text-xs underline shrink-0">
                        Retry
                      </button>
                    </div>}

                  {/* Sign In / Sign Out buttons — ALWAYS shown once job selected, not gated on status */}
                  {!statusLoading && <div className="grid grid-cols-2 gap-2.5">
                      <button onClick={() => void handleSignIn()} disabled={acting || isSignedIn} className="h-12 rounded-2xl bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                        {acting && !isSignedIn ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
                        Sign In
                      </button>
                      <button onClick={() => void handleSignOut()} disabled={acting || !isSignedIn} className="h-12 rounded-2xl bg-violet-500 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                        {acting && isSignedIn ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                        Sign Out
                      </button>
                    </div>}

                  {/* Supervisor: on-site roster */}
                  {!statusLoading && isSupervisor && status && status.currentlyOnSite.length > 0 && <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                        <UserCheck size={12} />
                        On Site Now ({status.currentlyOnSite.length})
                      </p>
                      <div className="space-y-1.5">
                        {status.currentlyOnSite.map(u => <div key={u.user_id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                              <User size={14} className="text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 font-semibold text-sm truncate">
                                {u.user_name ?? u.user_email ?? 'Unknown'}
                              </p>
                              <p className="text-gray-400 text-xs">
                                Signed in {u.signed_in_at ? formatTime(u.signed_in_at) : ''}
                              </p>
                            </div>
                            <button onClick={() => void handleForceSignOut(u.user_id, u.user_name ?? u.user_email ?? 'User')} disabled={forcingOut === u.user_id} className="shrink-0 h-7 px-2.5 rounded-lg bg-violet-100 hover:bg-violet-200 active:bg-violet-300 disabled:opacity-40 text-violet-800 text-xs font-bold flex items-center gap-1 transition-colors">
                              {forcingOut === u.user_id ? <Loader2 size={11} className="animate-spin" /> : <LogOut size={11} />}
                              Sign out
                            </button>
                          </div>)}
                      </div>
                    </div>}

                  {!statusLoading && isSupervisor && status && status.currentlyOnSite.length === 0 && <p className="text-center text-gray-400 text-xs py-2">No one else currently on site</p>}
                </motion.div>}
            </div>

            {/* ── Footer: always-visible close + done button ── */}
            <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
              {result ? <button onClick={onClose} className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm">
                  <CheckCircle2 size={16} />
                  Done — Close
                </button> : <button onClick={onClose} className="w-full h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                  <X size={15} />
                  Close
                </button>}
            </div>
            <div className="shrink-0" style={{
            height: 'env(safe-area-inset-bottom, 0px)'
          }} />
            </motion.div>
          </div>
        </>}
    </AnimatePresence>;
}

// ── Costs job picker sheet ────────────────────────────────────────────────────

function CostsJobPickerSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs/search?status=active&limit=100', {
      credentials: 'include'
    }).then(r => r.json()).then((data: {
      jobs?: JobOption[];
    } | JobOption[]) => {
      const list = Array.isArray(data) ? data : data.jobs ?? [];
      setJobs(list);
    }).catch(() => setJobs([])).finally(() => setLoading(false));
  }, [open]);
  function handleSelect(job: JobOption) {
    onClose();
    navigate(`/jobs/${job.id}/costs`);
  }
  return <AnimatePresence>
      {open && <>
          <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 30,
        stiffness: 320
      }} className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl flex flex-col overflow-hidden" style={{
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
        maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px) - 4rem)'
      }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <BookOpen size={15} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Select Job</h2>
                  <p className="text-gray-400 text-xs">Choose a job to view costs</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loading ? <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
                </div> : jobs.length === 0 ? <div className="text-center py-10">
                  <HardHat size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No active jobs found</p>
                </div> : jobs.map(job => <button key={job.id} onClick={() => handleSelect(job)} className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-emerald-50 hover:border-emerald-200 active:bg-emerald-100 rounded-2xl px-4 py-3.5 text-left transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                      <BookOpen size={16} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                      {job.jobNumber && <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>}
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </button>)}
            </div>
            <div className="shrink-0" style={{
          height: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)'
        }} />
          </motion.div>
        </>}
    </AnimatePresence>;
}

// ── Profile sheet ─────────────────────────────────────────────────────────────
function ProfileSheet({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    session
  } = useSession();
  const {
    me
  } = usePermissions();
  const navigate = useNavigate();
  const name = session?.user?.name ?? me?.user?.name ?? 'User';
  const email = session?.user?.email ?? me?.user?.email ?? '';
  const company = me?.company?.name ?? '';
  async function handleSignOut() {
    await signOut();
    invalidateMeCache();
    invalidateTerminologyCache();
    invalidateSubscriptionCache();
    invalidateSupportModeCache();
    navigate('/login');
  }
  return <AnimatePresence>
      {open && <>
          <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 30,
        stiffness: 320
      }} className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl overflow-hidden" style={{
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12)'
      }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="px-5 py-4 pb-8">
              {/* Avatar + name */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <User size={24} className="text-violet-600" />
                </div>
                <div>
                  <p className="text-gray-900 font-bold text-base">{name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{email}</p>
                  {company && <p className="text-gray-400 text-xs mt-0.5">{company}</p>}
                </div>
              </div>
              {/* Actions */}
              <div className="space-y-2">
                <button onClick={() => {
              onClose();
              navigate('/settings');
            }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors text-gray-700 text-sm font-medium">
                  <Settings size={16} className="text-gray-400" />
                  Settings
                </button>
                <button onClick={() => void handleSignOut()} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 transition-colors text-red-600 text-sm font-medium">
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </div>
          </motion.div>
        </>}
    </AnimatePresence>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigate = useNavigate();
  const {
    isPlatformOwner,
    me,
    loading,
    role
  } = usePermissions();
  const {
    session
  } = useSession();

  // ── Native permissions onboarding ─────────────────────────────────────────
  // ── Terms acceptance gate — shown once on first use (web + native) ───────────
  const [showTermsGate, setShowTermsGate] = useState(() => !hasAcceptedTerms());

  // Show permissions onboarding AFTER terms are accepted (native only)
  const [showPermOnboarding, setShowPermOnboarding] = useState(false);
  useEffect(() => {
    if (!isNative() || hasCompletedOnboarding()) return;
    // Only start the timer once terms have been accepted
    if (showTermsGate) return;
    const t = setTimeout(() => setShowPermOnboarding(true), 1500);
    return () => clearTimeout(t);
  }, [showTermsGate]);

  // ── Home icon permissions ──────────────────────────────────────────────────
  const [iconPermissions, setIconPermissions] = useState<string[] | null>(null);
  useEffect(() => {
    const userId = me?.user?.id ?? session?.user?.id;
    if (!userId || loading) return;
    fetch(`/api/team/members/${userId}/icon-permissions`, {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((data: {
      allowedKeys?: string[] | null;
    } | null) => {
      setIconPermissions(data?.allowedKeys ?? null);
    }).catch(() => setIconPermissions(null));
  }, [me?.user?.id, session?.user?.id, loading]);

  // Determine if this is a solo user (only member of their company)
  const [isSolo, setIsSolo] = useState(false);
  useEffect(() => {
    if (!me?.user?.id || loading) return;
    fetch('/api/team/members', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((data: {
      members?: unknown[];
    } | null) => {
      setIsSolo((data?.members?.length ?? 0) <= 1);
    }).catch(() => setIsSolo(false));
  }, [me?.user?.id, loading]);
  const [dashOpen, setDashOpen] = useState(false); // kept for ?panel=dashboard handler below
  const [notesOpen, setNotesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notesPickerOpen, setNotesPickerOpen] = useState(false);
  const [delaysPickerOpen, setDelaysPickerOpen] = useState(false);
  const [costsPickerOpen, setCostsPickerOpen] = useState(false);
  const [logCostOpen, setLogCostOpen] = useState(false);
  const [signInOutOpen, setSignInOutOpen] = useState(false);
  const [formsPickerOpen, setFormsPickerOpen] = useState(false); // kept for any residual references
  const [quotesPickerOpen, setQuotesPickerOpen] = useState(false);
  const [progressPickerOpen, setProgressPickerOpen] = useState(false);
  const [drawingsPickerOpen, setDrawingsPickerOpen] = useState(false);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [prestartPickerOpen, setPrestartPickerOpen] = useState(false);
  const [sitePrestartPickerOpen, setSitePrestartPickerOpen] = useState(false);
  const [riskyPickerOpen, setRiskyPickerOpen] = useState(false);
  const [jobCardOpen, setJobCardOpen] = useState(false);
  const [activeStatusKey, setActiveStatusKey] = useState(0);
  const activeStatus = useActiveStatus(activeStatusKey);
  const name = session?.user?.name ?? me?.user?.name ?? '';
  const firstName = name.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  function handleNavigate(href: string) {
    if (href === '?panel=notes') {
      setNotesOpen(true);
      return;
    }
    if (href === '?panel=notes-picker') {
      setNotesPickerOpen(true);
      return;
    }
    if (href === '?panel=delays-picker') {
      setDelaysPickerOpen(true);
      return;
    }
    if (href === '?panel=costs-picker') {
      setCostsPickerOpen(true);
      return;
    }
    if (href === '?panel=log-cost') {
      setLogCostOpen(true);
      return;
    }
    if (href === '?panel=signin') {
      setSignInOutOpen(true);
      return;
    }
    if (href === '?panel=quotes-picker') {
      setQuotesPickerOpen(true);
      return;
    }
    if (href === '?panel=progress-picker') {
      setProgressPickerOpen(true);
      return;
    }
    if (href === '?panel=drawings-picker') {
      setDrawingsPickerOpen(true);
      return;
    }
    if (href === '?panel=schedule-picker') {
      setSchedulePickerOpen(true);
      return;
    }
    if (href === '?panel=drive-picker') {
      setDrivePickerOpen(true);
      return;
    }
    if (href === '?panel=prestart-picker') {
      setPrestartPickerOpen(true);
      return;
    }
    if (href === '?panel=site-prestart-picker') {
      setSitePrestartPickerOpen(true);
      return;
    }
    if (href === '?panel=risky-picker') {
      setRiskyPickerOpen(true);
      return;
    }
    // job-card now navigates directly to /job-cards
    if (href === '?panel=dashboard') {
      setDashOpen(true);
      return;
    }
    navigate(href);
  }
  if (loading) {
    return <div className="flex-1 flex items-center justify-center min-h-0" style={{
      background: '#edf0f5'
    }}>
        <div className="w-8 h-8 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
      </div>;
  }
  return <>
      {/* Terms & Acceptable Use gate — shown once on first use (web + native) */}
      {showTermsGate && (
        <TermsAcceptanceGate
          onAccepted={() => setShowTermsGate(false)}
        />
      )}

      {/* Permissions onboarding — shown once on native after terms accepted */}
      {showPermOnboarding && <AppPermissionsOnboarding onDone={() => setShowPermOnboarding(false)} />}

      <div className="flex-1 flex flex-col relative overflow-hidden min-h-0" style={{
      background: '#edf0f5'
    }}>
      {/* Very subtle noise texture — reduced opacity so it doesn't compete with tile colours */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.035) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        opacity: 0.28
      }} />
      {/* Warm glow — top right */}
      <div className="absolute pointer-events-none" style={{
        top: '-120px',
        right: '-120px',
        width: '420px',
        height: '420px',
        background: 'radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 60%)'
      }} />
      {/* Cool glow — bottom left */}
      <div className="absolute pointer-events-none" style={{
        bottom: '40px',
        left: '-100px',
        width: '320px',
        height: '320px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 60%)'
      }} />
      {/* Watermark logo — very faint, just enough to brand the background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'url(/airo-assets/images/uploads/background-f38wenbvln-1784434100763-file-ir3u9cpvlv)',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center 38%',
        backgroundSize: '40%',
        opacity: 0.028
      }} />

      {/* All content above the overlay */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
      <Helmet>
        <title>Home — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD field launcher — quick access to camera, drive, forms, job costs and more." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/home" />
      </Helmet>
      <h1 className="sr-only">IWILLBUILD Home</h1>

      {/* ── Top bar ── */}
      <div className="px-4 pb-3" style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
          background: 'linear-gradient(150deg, #0d1117 0%, #161d2e 55%, #1a1208 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 8px 28px rgba(0,0,0,0.35)'
        }}>
        {/* Row 1: date pill — full width, no weather widget */}
        <div className="flex items-center mb-2.5">
          <span className="text-white/70 text-[11px] font-semibold tracking-[0.06em] uppercase px-2.5 py-1 rounded-full bg-white/10 border border-white/15">{dateStr}</span>
        </div>
        {/* Row 2: greeting — large, bold, personal */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/50 text-[11px] font-medium leading-tight mb-0.5">{greeting}</p>
            <p className="font-extrabold text-[22px] leading-tight tracking-[-0.03em] truncate" style={{
                background: 'linear-gradient(100deg, #ffffff 0%, #c4b5fd 55%, #fb923c 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
              {firstName}
            </p>
          </div>
          {/* System logo badge — display only */}
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 mb-0.5 overflow-hidden">
            <img src="/airo-assets/images/logo/primary" alt="IWILLBUILD" className="w-full h-full object-contain" />
          </div>
        </div>
      </div>

      {/* ── Active status sub-header ── */}
      <AnimatePresence>
        {(activeStatus?.jobSignIn || activeStatus?.driving || (activeStatus?.drivingSessions?.length ?? 0) > 0) && <ActiveStatusBar status={activeStatus} onJobSignOut={() => setActiveStatusKey(k => k + 1)} onDriveStop={async sessionId => {
            await fetch(`/api/fleet/driver-sessions/${sessionId}/stop`, {
              method: 'POST',
              credentials: 'include'
            });
            setActiveStatusKey(k => k + 1);
          }} />}
      </AnimatePresence>

      {/* ── Paged home screen (Dashboard / Field / Manage) ── */}
      {/* PagedHomeScreen handles its own scroll per page and the page dots */}
      <PagedHomeScreen iconPermissions={iconPermissions} role={role ?? ''} isSolo={isSolo} isPlatformOwner={isPlatformOwner} userId={session?.user?.id ?? me?.user?.id ?? ''} onNavigate={handleNavigate} />

      {/* ── Sheets ── */}

      <Sheet open={notesOpen} onClose={() => setNotesOpen(false)} title="Notes & Tasks" titleIcon={StickyNote} titleIconClass="text-yellow-500">
        <MyTasksPanel userRole={role ?? ''} />
      </Sheet>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <NotesJobPickerSheet open={notesPickerOpen} onClose={() => setNotesPickerOpen(false)} />
      <DelaysJobPickerSheet open={delaysPickerOpen} onClose={() => setDelaysPickerOpen(false)} />
      <CostsJobPickerSheet open={costsPickerOpen} onClose={() => setCostsPickerOpen(false)} />
      <LogCostSheet open={logCostOpen} onClose={() => setLogCostOpen(false)} />
      <SignInOutSheet open={signInOutOpen} onClose={() => {
          setSignInOutOpen(false);
          setActiveStatusKey(k => k + 1);
        }} />
      <JobPickerSheet open={quotesPickerOpen} onClose={() => setQuotesPickerOpen(false)} title="Estimates" subtitle="Select a job to view its estimates" iconBg="bg-violet-100" iconFg="text-violet-700" Icon={FileText} onSelect={job => {
          setQuotesPickerOpen(false);
          navigate(`/jobs/${job.id}/quotes`);
        }} />
      <ProgressJobPickerSheet open={progressPickerOpen} onClose={() => setProgressPickerOpen(false)} />
      <DrawingsJobPickerSheet open={drawingsPickerOpen} onClose={() => setDrawingsPickerOpen(false)} />
      <ScheduleJobPickerSheet open={schedulePickerOpen} onClose={() => setSchedulePickerOpen(false)} />
      {drivePickerOpen && <StartDrivingModal onClose={() => setDrivePickerOpen(false)} onStarted={() => {
          setDrivePickerOpen(false);
          setActiveStatusKey(k => k + 1);
        }} />}
      <PrestartFleetPickerSheet open={prestartPickerOpen} onClose={() => setPrestartPickerOpen(false)} />
      <SitePrestartJobPickerSheet open={sitePrestartPickerOpen} onClose={() => setSitePrestartPickerOpen(false)} />
      <RiskyJobPickerSheet open={riskyPickerOpen} onClose={() => setRiskyPickerOpen(false)} />
      <PhoneJobCardSheet open={jobCardOpen} onClose={() => setJobCardOpen(false)} />
      </div>{/* end z-10 content wrapper */}

    </div>
    </>;
}
