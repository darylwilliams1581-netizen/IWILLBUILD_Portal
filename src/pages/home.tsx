/**
 * HomeScreen — Light-theme icon launcher.
 * Clean white/light-grey background, solid vibrant icon tiles,
 * dark text — iOS-style feel, not dark like the drive app.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, Car, FileText, StickyNote, BookOpen,
  Clock, TrendingUp, Calculator, Receipt, Users,
  HardHat, CalendarDays, Truck, FolderOpen, UserCircle,
  Map, Building2, Layers, Settings, CreditCard, Bot,
  ShieldCheck, LayoutDashboard, X, ChevronUp, ChevronRight, LogOut,
  User, DollarSign, Loader2, Plus, ImageIcon, LogIn, CheckCircle2, UserCheck,
  HardHat as HardHatIcon, Navigation, ClipboardCheck,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { useSession, signOut } from '@/lib/auth/auth-client';
import { invalidateMeCache } from '@/lib/usePermissions';
import { invalidateTerminologyCache } from '@/lib/useTerminology';
import { invalidateSubscriptionCache } from '@/lib/useSubscriptionGate';
import { invalidateSupportModeCache } from '@/lib/useSupportMode';
import KpiWidgets from '@/components/dashboard/KpiWidgets';
import StartDrivingModal from '@/components/fleet/StartDrivingModal';
import MyTasksPanel from '@/components/notes/MyTasksPanel';
import NotificationBell from '@/components/NotificationBell';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppIcon {
  label: string;
  icon: React.ElementType;
  href: string;
  /** Solid bg colour class for the tile */
  bg: string;
  /** Icon colour class */
  fg: string;
  badge?: number;
}

// ── Icon definitions ──────────────────────────────────────────────────────────
// Solid, saturated colours — light theme needs full-opacity backgrounds

const FIELD_ICONS: AppIcon[] = [
  { label: 'Camera',    icon: Camera,         href: '?panel=camera',            bg: 'bg-orange-500',   fg: 'text-white' },
  { label: 'Sign In',   icon: LogIn,          href: '?panel=signin',            bg: 'bg-indigo-500',   fg: 'text-white' },
  { label: 'Drive',     icon: Car,            href: '?panel=drive-picker',      bg: 'bg-blue-500',     fg: 'text-white' },
  { label: 'Prestart',  icon: ClipboardCheck, href: '?panel=prestart-picker',   bg: 'bg-amber-500',    fg: 'text-white' },
  { label: 'Forms',     icon: FileText,       href: '?panel=forms-picker',      bg: 'bg-purple-500',   fg: 'text-white' },
  { label: 'Notes',     icon: StickyNote,     href: '?panel=notes-picker',      bg: 'bg-yellow-400',   fg: 'text-white' },
  { label: 'Log Cost',  icon: DollarSign,     href: '?panel=log-cost',          bg: 'bg-emerald-500',  fg: 'text-white' },
  { label: 'Delays',    icon: Clock,          href: '?panel=delays-picker',     bg: 'bg-red-500',      fg: 'text-white' },
  { label: 'Progress',  icon: TrendingUp,     href: '?panel=progress-picker',   bg: 'bg-cyan-500',     fg: 'text-white' },
  { label: 'Schedule',  icon: CalendarDays,   href: '?panel=schedule-picker',   bg: 'bg-violet-500',   fg: 'text-white' },
];

const ESTIMATING_ICONS: AppIcon[] = [
  { label: 'Estimating', icon: Calculator, href: '/estimating', bg: 'bg-indigo-500', fg: 'text-white' },
  { label: 'Invoices',   icon: Receipt,    href: '/invoices',   bg: 'bg-teal-500',   fg: 'text-white' },
  { label: 'Customers',  icon: Users,      href: '/customers',  bg: 'bg-pink-500',   fg: 'text-white' },
];

const ADMIN_ICONS: AppIcon[] = [
  { label: 'Jobs',      icon: HardHat,     href: '/jobs',                  bg: 'bg-orange-500',   fg: 'text-white' },
  { label: 'Ledger',    icon: BookOpen,    href: '?panel=costs-picker',    bg: 'bg-emerald-600',  fg: 'text-white' },
  { label: 'Scheduler', icon: CalendarDays,href: '/scheduler',             bg: 'bg-blue-600',     fg: 'text-white' },
  { label: 'Fleet',     icon: Truck,       href: '/fleet',                 bg: 'bg-slate-600',    fg: 'text-white' },
  { label: 'Files',     icon: FolderOpen,  href: '/files',                 bg: 'bg-amber-500',    fg: 'text-white' },
  { label: 'Team',      icon: UserCircle,  href: '/team',                  bg: 'bg-violet-500',   fg: 'text-white' },
  { label: 'Plans',     icon: Map,         href: '/plan-manager',          bg: 'bg-lime-500',     fg: 'text-white' },
  { label: 'Assets',    icon: Building2,   href: '/studio/asset-manager',  bg: 'bg-rose-500',     fg: 'text-white' },
  { label: 'Studio',    icon: Layers,      href: '/studio',                bg: 'bg-fuchsia-500',  fg: 'text-white' },
  { label: 'Safety',    icon: ShieldCheck, href: '/studio?tab=safety',     bg: 'bg-green-600',    fg: 'text-white' },
];

const PLATFORM_ICONS: AppIcon[] = [
  { label: 'Settings',  icon: Settings,    href: '/settings',      bg: 'bg-slate-500',    fg: 'text-white' },
  { label: 'Billing',   icon: CreditCard,  href: '/billing',       bg: 'bg-emerald-600',  fg: 'text-white' },
  { label: 'Dazza AI',  icon: Bot,         href: '/dazza-ai',      bg: 'bg-cyan-600',     fg: 'text-white' },
  { label: 'Console',   icon: ShieldCheck, href: '/owner-console', bg: 'bg-red-600',      fg: 'text-white' },
];

// ── Single icon tile ──────────────────────────────────────────────────────────

function IconTile({ item, onNavigate }: { item: AppIcon; onNavigate: (href: string) => void }) {
  const Icon = item.icon;
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={() => onNavigate(item.href)}
      className="flex flex-col items-center gap-1.5 group"
    >
      <div
        className={`w-[60px] h-[60px] rounded-[16px] ${item.bg} ${item.fg} flex items-center justify-center relative shadow-md`}
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.13)' }}
      >
        <Icon size={26} strokeWidth={1.9} />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </div>
      <span className="text-[11px] text-gray-600 font-medium text-center leading-tight max-w-[68px]">
        {item.label}
      </span>
    </motion.button>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, icons, onNavigate }: { label: string; icons: AppIcon[]; onNavigate: (href: string) => void }) {
  return (
    <div className="px-5">
      <p className="text-[11px] font-semibold text-gray-400 mb-3 px-0.5 uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-4 gap-x-3 gap-y-5">
        {icons.map((item) => (
          <IconTile key={item.label} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

// ── Shared sheet backdrop + panel ─────────────────────────────────────────────

function Sheet({
  open, onClose, title, titleIcon: TitleIcon, titleIconClass, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon: React.ElementType;
  titleIconClass: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[88vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
          >
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
        </>
      )}
    </AnimatePresence>
  );
}

// ── Camera job-picker sheet ───────────────────────────────────────────────────

interface JobOption { id: string; name: string; jobNumber?: string | null; }

function CameraJobPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100')
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        const list = Array.isArray(data) ? data : (data.jobs ?? []);
        setJobs(list);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSelect(job: JobOption) {
    onClose();
    navigate(`/jobs/${job.id}?tab=photos`);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Camera size={15} className="text-orange-500" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Select Job</h2>
                  <p className="text-gray-400 text-xs">Choose a job to add photos to</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Job list */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-10">
                  <HardHat size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No active jobs found</p>
                </div>
              ) : (
                jobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => handleSelect(job)}
                    className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-orange-50 hover:border-orange-200 active:bg-orange-100 rounded-2xl px-4 py-3.5 text-left transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                      <Camera size={16} className="text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                      {job.jobNumber && (
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>

            {/* Safe area spacer */}
            <div className="h-4 shrink-0" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Notes job picker sheet ────────────────────────────────────────────────────

function NotesJobPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        const list = Array.isArray(data) ? data : (data.jobs ?? []);
        setJobs(list);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSelect(job: JobOption) {
    onClose();
    navigate(`/jobs/${job.id}/notes`);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
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
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-yellow-300 border-t-yellow-500 rounded-full animate-spin" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-10">
                  <HardHat size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No active jobs found</p>
                </div>
              ) : (
                jobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => handleSelect(job)}
                    className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-yellow-50 hover:border-yellow-200 active:bg-yellow-100 rounded-2xl px-4 py-3.5 text-left transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
                      <StickyNote size={16} className="text-yellow-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                      {job.jobNumber && (
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="h-4 shrink-0" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Delays job picker sheet ───────────────────────────────────────────────────

function DelaysJobPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        const list = Array.isArray(data) ? data : (data.jobs ?? []);
        setJobs(list);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSelect(job: JobOption) {
    onClose();
    navigate(`/jobs/${job.id}/delays`);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
                  <Clock size={15} className="text-red-500" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Select Job</h2>
                  <p className="text-gray-400 text-xs">Choose a job to view delays</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-10">
                  <HardHat size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No active jobs found</p>
                </div>
              ) : (
                jobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => handleSelect(job)}
                    className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-red-50 hover:border-red-200 active:bg-red-100 rounded-2xl px-4 py-3.5 text-left transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                      <Clock size={16} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                      {job.jobNumber && (
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="h-4 shrink-0" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Log Cost sheet (worker receipt capture) ───────────────────────────────────

const COST_TYPES = [
  { value: 'MATERIAL',      label: 'Material' },
  { value: 'LABOUR',        label: 'Labour' },
  { value: 'PLANT',         label: 'Plant / Equipment' },
  { value: 'SUBCONTRACTOR', label: 'Subcontractor' },
  { value: 'RECEIPT',       label: 'Receipt / Purchase' },
  { value: 'OTHER',         label: 'Other' },
];

function LogCostSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load jobs on open
  useEffect(() => {
    if (!open) return;
    setJobsLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        const list = Array.isArray(data) ? data : (data.jobs ?? []);
        setJobs(list);
      })
      .catch(() => setJobs([]))
      .finally(() => setJobsLoading(false));
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedJob(null);
      setEventType('MATERIAL');
      setDescription('');
      setAmount('');
      setEntryDate(new Date().toISOString().slice(0, 10));
      setReference('');
      setPhotoFile(null);
      setPhotoPreview(null);
      setSaved(false);
      setError('');
    }
  }, [open]);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function handleSubmit() {
    if (!selectedJob) { setError('Please select a job'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    if (!amount || isNaN(parseFloat(amount))) { setError('Enter a valid amount'); return; }
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
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
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
              {saved ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                    <DollarSign size={24} className="text-emerald-600" />
                  </div>
                  <p className="text-gray-900 font-bold text-base">Cost logged!</p>
                  <p className="text-gray-400 text-sm text-center">Submitted for admin review</p>
                </div>
              ) : (
                <>
                  {/* Step 1 — Job picker */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Job</p>
                    {jobsLoading ? (
                      <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                        <Loader2 size={14} className="animate-spin" /> Loading jobs…
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {jobs.map(job => (
                          <button
                            key={job.id}
                            onClick={() => setSelectedJob(job)}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition-colors ${
                              selectedJob?.id === job.id
                                ? 'bg-emerald-50 border-emerald-300'
                                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${selectedJob?.id === job.id ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                              {job.jobNumber && <p className="text-gray-400 text-xs font-mono">{job.jobNumber}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 2 — Cost details (shown once job selected) */}
                  {selectedJob && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      {/* Receipt photo */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Receipt Photo <span className="text-gray-300 font-normal normal-case">(optional)</span></p>
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={handlePhoto} />
                        {photoPreview ? (
                          <div className="relative w-full h-36 rounded-xl overflow-hidden border border-gray-200">
                            <img src={photoPreview} alt="Receipt" className="w-full h-full object-cover" />
                            <button
                              onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-24 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
                          >
                            <ImageIcon size={20} />
                            <span className="text-xs font-medium">Tap to attach receipt</span>
                          </button>
                        )}
                      </div>

                      {/* Type */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Cost Type</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {COST_TYPES.map(t => (
                            <button
                              key={t.value}
                              onClick={() => setEventType(t.value)}
                              className={`rounded-xl px-2 py-2 text-xs font-semibold border transition-colors ${
                                eventType === t.value
                                  ? 'bg-emerald-500 text-white border-emerald-500'
                                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Description</p>
                        <input
                          type="text"
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          placeholder="What was purchased / done?"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors"
                        />
                      </div>

                      {/* Amount + Date row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Amount (ex GST)</p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={amount}
                              onChange={e => setAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-7 pr-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors"
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Date</p>
                          <input
                            type="date"
                            value={entryDate}
                            onChange={e => setEntryDate(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors"
                          />
                        </div>
                      </div>

                      {/* Reference */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Reference / Invoice # <span className="text-gray-300 font-normal normal-case">(optional)</span></p>
                        <input
                          type="text"
                          value={reference}
                          onChange={e => setReference(e.target.value)}
                          placeholder="e.g. INV-1234"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white transition-colors"
                        />
                      </div>

                      {/* Error */}
                      {error && (
                        <p className="text-red-500 text-xs font-medium bg-red-50 rounded-xl px-3 py-2">{error}</p>
                      )}
                    </motion.div>
                  )}
                </>
              )}
            </div>

            {/* Footer CTA */}
            {!saved && selectedJob && (
              <div className="px-4 pb-6 pt-3 border-t border-gray-100 shrink-0">
                <button
                  onClick={() => void handleSubmit()}
                  disabled={saving}
                  className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {saving ? 'Saving…' : 'Submit Cost'}
                </button>
                <p className="text-center text-gray-400 text-xs mt-2">Submitted as pending — admin will review</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
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
    fetch('/api/me/active-status', { credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<ActiveStatus & { ok: boolean }> : null)
      .then(data => { if (!cancelled && data?.ok) setStatus(data); })
      .catch(() => {});
    return () => { cancelled = true; };
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
  onJobPress,
  onDriveStop,
}: {
  status: ActiveStatus | null;
  onJobPress: () => void;
  onDriveStop: (sessionId: number) => void;
}) {
  const hasJob      = !!status?.jobSignIn;
  const sessions    = status?.drivingSessions ?? (status?.driving ? [status.driving] : []);
  const hasDrive    = sessions.length > 0;

  if (!hasJob && !hasDrive) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className="bg-white border-b border-gray-100 px-4 py-2.5"
    >
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        {/* Label */}
        <span className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest shrink-0 mr-0.5">
          Active
        </span>

        {/* Job sign-in pill */}
        {hasJob && (
          <button
            onClick={onJobPress}
            className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 shrink-0 hover:bg-emerald-100 active:bg-emerald-200 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <HardHatIcon size={11} className="text-emerald-600 shrink-0" />
            <span className="text-emerald-700 text-xs font-semibold truncate max-w-[120px]">
              {status!.jobSignIn!.jobName ?? `Job #${status!.jobSignIn!.jobId}`}
            </span>
            {status!.jobSignIn!.signedInAt && (
              <span className="text-emerald-500 text-[10px] font-medium shrink-0">
                {elapsed(status!.jobSignIn!.signedInAt)}
              </span>
            )}
          </button>
        )}

        {/* One driving pill per active session */}
        {sessions.map(s => (
          <button
            key={s.sessionId}
            onClick={() => onDriveStop(s.sessionId)}
            className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 shrink-0 hover:bg-blue-100 active:bg-blue-200 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <Navigation size={11} className="text-blue-600 shrink-0" />
            <span className="text-blue-700 text-xs font-semibold truncate max-w-[120px]">
              {s.assetName ?? 'Vehicle'}
            </span>
            {s.rego && (
              <span className="text-blue-400 text-[10px] font-mono shrink-0">
                {s.rego}
              </span>
            )}
            {s.startAt && (
              <span className="text-blue-500 text-[10px] font-medium shrink-0">
                {elapsed(s.startAt)}
              </span>
            )}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Reusable job picker sheet ─────────────────────────────────────────────────

function JobPickerSheet({
  open, onClose, title, subtitle,
  iconBg, iconFg, Icon,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  iconBg: string;
  iconFg: string;
  Icon: React.ElementType;
  onSelect: (job: JobOption) => void;
}) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        setJobs(Array.isArray(data) ? data : (data.jobs ?? []));
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center`}>
                  <Icon size={15} className={iconFg} />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">{title}</h2>
                  <p className="text-gray-400 text-xs">{subtitle}</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Loading jobs…
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No active jobs found</p>
              ) : jobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => { onClose(); onSelect(job); }}
                  className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-3 text-left transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${iconBg.replace('bg-', 'bg-').replace('-100', '-400')}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                    {job.jobNumber && <p className="text-gray-400 text-xs font-mono">{job.jobNumber}</p>}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Fleet picker sheet ────────────────────────────────────────────────────────

interface FleetOption {
  id: number;
  name: string;
  type?: string | null;
  rego?: string | null;
}

function DriveFleetPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<FleetOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/fleet?limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { assets?: FleetOption[] } | FleetOption[]) => {
        setAssets(Array.isArray(data) ? data : (data.assets ?? []));
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Car size={15} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Drive Log</h2>
                  <p className="text-gray-400 text-xs">Select a vehicle to view sessions</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Loading fleet…
                </div>
              ) : assets.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No fleet assets found</p>
              ) : assets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => { onClose(); navigate(`/driver?vehicleId=${asset.id}`); }}
                  className="w-full flex items-center gap-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-xl px-3 py-3 text-left transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <Car size={16} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{asset.name}</p>
                    <p className="text-gray-400 text-xs">
                      {[asset.type, asset.rego].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Forms + Progress job picker wrappers ──────────────────────────────────────

function FormsJobPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <JobPickerSheet
      open={open} onClose={onClose}
      title="Job Forms" subtitle="Select a job to view forms"
      iconBg="bg-purple-100" iconFg="text-purple-600" Icon={FileText}
      onSelect={job => navigate(`/jobs/${job.id}/forms`)}
    />
  );
}

function ProgressJobPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <JobPickerSheet
      open={open} onClose={onClose}
      title="Job Progress" subtitle="Select a job to update progress"
      iconBg="bg-cyan-100" iconFg="text-cyan-600" Icon={TrendingUp}
      onSelect={job => navigate(`/jobs/${job.id}/progress`)}
    />
  );
}

function ScheduleJobPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <JobPickerSheet
      open={open} onClose={onClose}
      title="Job Schedule" subtitle="Select a job to view its schedule"
      iconBg="bg-violet-100" iconFg="text-violet-600" Icon={CalendarDays}
      onSelect={job => navigate(`/jobs/${job.id}/schedule`)}
    />
  );
}

function PrestartFleetPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<FleetOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/fleet/vehicles', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { vehicles?: FleetOption[] } | FleetOption[]) => {
        setAssets(Array.isArray(data) ? data : (data.vehicles ?? []));
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center">
                  <ClipboardCheck size={15} className="text-orange-600" />
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
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Loading fleet…
                </div>
              ) : assets.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No fleet assets found</p>
              ) : assets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => { onClose(); navigate(`/prestart?vehicleId=${asset.id}`); }}
                  className="w-full flex items-center gap-3 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl px-3 py-3 text-left transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                    <ClipboardCheck size={16} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{asset.name}</p>
                    <p className="text-gray-400 text-xs">
                      {[asset.type, asset.rego].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
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

function SignInOutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = usePermissions();
  const isSupervisor = role === 'owner' || role === 'admin' || role === 'supervisor';

  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);

  const [status, setStatus] = useState<SignInStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [acting, setActing] = useState(false);
  const [forcingOut, setForcingOut] = useState<string | null>(null); // userId being forced out
  const [result, setResult] = useState<{ type: 'signin' | 'signout' | null; name?: string } | null>(null);
  const [error, setError] = useState('');

  // Load jobs on open
  useEffect(() => {
    if (!open) return;
    setJobsLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        const list = Array.isArray(data) ? data : (data.jobs ?? []);
        setJobs(list);
      })
      .catch(() => setJobs([]))
      .finally(() => setJobsLoading(false));
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedJob(null);
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
      const res = await fetch(`/api/jobs/${jobId}/signin-status`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json() as SignInStatus;
      setStatus(data);
    } catch {
      setError('Could not load sign-in status');
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
    setActing(true); setError('');
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/signin`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorType: 'employee' }),
      });
      const data = await res.json() as { ok?: boolean; alreadySignedIn?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Sign in failed');
      if (data.alreadySignedIn) {
        setError('You are already signed in to this job.');
        await loadStatus(selectedJob.id);
      } else {
        setResult({ type: 'signin', name: selectedJob.name });
        await loadStatus(selectedJob.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setActing(false);
    }
  }

  async function handleSignOut() {
    if (!selectedJob) return;
    setActing(true); setError('');
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/signout`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { ok?: boolean; notSignedIn?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Sign out failed');
      if (data.notSignedIn) {
        setError('You are not currently signed in to this job.');
        await loadStatus(selectedJob.id);
      } else {
        setResult({ type: 'signout', name: selectedJob.name });
        await loadStatus(selectedJob.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign out failed');
    } finally {
      setActing(false);
    }
  }

  async function handleForceSignOut(userId: string, userName: string) {
    if (!selectedJob) return;
    setForcingOut(userId); setError('');
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/signout-user`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, notes: 'Supervisor sign-out via home screen' }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Force sign-out failed');
      setResult({ type: 'signout', name: userName });
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
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  const isSignedIn = status?.signedIn ?? false;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <LogIn size={15} className="text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">Site Sign In / Out</h2>
                  <p className="text-gray-400 text-xs">Record your attendance on site</p>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

              {/* Job picker */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Select Job</p>
                {jobsLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                    <Loader2 size={14} className="animate-spin" /> Loading jobs…
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {jobs.map(job => (
                      <button
                        key={job.id}
                        onClick={() => handleSelectJob(job)}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition-colors ${
                          selectedJob?.id === job.id
                            ? 'bg-indigo-50 border-indigo-300'
                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${selectedJob?.id === job.id ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                          {job.jobNumber && <p className="text-gray-400 text-xs font-mono">{job.jobNumber}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Status + action */}
              {selectedJob && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

                  {statusLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={20} className="animate-spin text-indigo-400" />
                    </div>
                  ) : status && (
                    <>
                      {/* Current status card */}
                      <div className={`rounded-2xl px-4 py-3.5 flex items-center gap-3 ${isSignedIn ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSignedIn ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                          {isSignedIn
                            ? <CheckCircle2 size={20} className="text-emerald-600" />
                            : <LogOut size={20} className="text-gray-400" />
                          }
                        </div>
                        <div>
                          <p className={`font-bold text-sm ${isSignedIn ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {isSignedIn ? 'Currently signed in' : 'Not signed in'}
                          </p>
                          {status.lastActionAt && (
                            <p className="text-xs text-gray-400">
                              Last {status.lastAction} at {formatTime(status.lastActionAt)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Result flash */}
                      {result && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          className={`rounded-2xl px-4 py-3 flex items-center gap-2.5 ${result.type === 'signin' ? 'bg-indigo-50 border border-indigo-200' : 'bg-orange-50 border border-orange-200'}`}
                        >
                          <CheckCircle2 size={16} className={result.type === 'signin' ? 'text-indigo-500' : 'text-orange-500'} />
                          <p className={`text-sm font-semibold ${result.type === 'signin' ? 'text-indigo-700' : 'text-orange-700'}`}>
                            {result.type === 'signin'
                              ? `Signed in to ${result.name}`
                              : `Signed out${result.name ? ` — ${result.name}` : ''}`
                            }
                          </p>
                        </motion.div>
                      )}

                      {/* Error */}
                      {error && (
                        <p className="text-red-500 text-xs font-medium bg-red-50 rounded-xl px-3 py-2">{error}</p>
                      )}

                      {/* Sign in / out buttons */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          onClick={() => void handleSignIn()}
                          disabled={acting || isSignedIn}
                          className="h-12 rounded-2xl bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                          {acting && !isSignedIn ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
                          Sign In
                        </button>
                        <button
                          onClick={() => void handleSignOut()}
                          disabled={acting || !isSignedIn}
                          className="h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                          {acting && isSignedIn ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                          Sign Out
                        </button>
                      </div>

                      {/* Supervisor: on-site roster */}
                      {isSupervisor && status.currentlyOnSite.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                            <UserCheck size={12} />
                            On Site Now ({status.currentlyOnSite.length})
                          </p>
                          <div className="space-y-1.5">
                            {status.currentlyOnSite.map(u => (
                              <div
                                key={u.user_id}
                                className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5"
                              >
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
                                <button
                                  onClick={() => void handleForceSignOut(u.user_id, u.user_name ?? u.user_email ?? 'User')}
                                  disabled={forcingOut === u.user_id}
                                  className="shrink-0 h-7 px-2.5 rounded-lg bg-orange-100 hover:bg-orange-200 active:bg-orange-300 disabled:opacity-40 text-orange-700 text-xs font-bold flex items-center gap-1 transition-colors"
                                >
                                  {forcingOut === u.user_id
                                    ? <Loader2 size={11} className="animate-spin" />
                                    : <LogOut size={11} />
                                  }
                                  Sign out
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {isSupervisor && status.currentlyOnSite.length === 0 && (
                        <p className="text-center text-gray-400 text-xs py-2">No one else currently on site</p>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Costs job picker sheet ────────────────────────────────────────────────────

function CostsJobPickerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        const list = Array.isArray(data) ? data : (data.jobs ?? []);
        setJobs(list);
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleSelect(job: JobOption) {
    onClose();
    navigate(`/jobs/${job.id}/costs`);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
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
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-10">
                  <HardHat size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No active jobs found</p>
                </div>
              ) : (
                jobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => handleSelect(job)}
                    className="w-full flex items-center gap-3 bg-gray-50 border border-gray-200 hover:bg-emerald-50 hover:border-emerald-200 active:bg-emerald-100 rounded-2xl px-4 py-3.5 text-left transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                      <BookOpen size={16} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                      {job.jobNumber && (
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="h-4 shrink-0" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Profile sheet ─────────────────────────────────────────────────────────────
function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sessionData } = useSession();
  const { me } = usePermissions();
  const navigate = useNavigate();
  const name = sessionData?.user?.name ?? me?.user?.name ?? 'User';
  const email = sessionData?.user?.email ?? me?.user?.email ?? '';
  const company = me?.company?.name ?? '';

  async function handleSignOut() {
    await signOut();
    invalidateMeCache();
    invalidateTerminologyCache();
    invalidateSubscriptionCache();
    invalidateSupportModeCache();
    navigate('/login');
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="px-5 py-4 pb-8">
              {/* Avatar + name */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
                  <User size={24} className="text-orange-500" />
                </div>
                <div>
                  <p className="text-gray-900 font-bold text-base">{name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{email}</p>
                  {company && <p className="text-gray-400 text-xs mt-0.5">{company}</p>}
                </div>
              </div>
              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => { onClose(); navigate('/settings'); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors text-gray-700 text-sm font-medium"
                >
                  <Settings size={16} className="text-gray-400" />
                  Settings
                </button>
                <button
                  onClick={() => void handleSignOut()}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 transition-colors text-red-600 text-sm font-medium"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigate = useNavigate();
  const { can, isAdmin, isPlatformOwner, me, loading, role } = usePermissions();
  const { data: sessionData } = useSession();

  const [dashOpen, setDashOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false);
  const [notesPickerOpen, setNotesPickerOpen] = useState(false);
  const [delaysPickerOpen, setDelaysPickerOpen] = useState(false);
  const [costsPickerOpen, setCostsPickerOpen] = useState(false);
  const [logCostOpen, setLogCostOpen] = useState(false);
  const [signInOutOpen, setSignInOutOpen] = useState(false);
  const [formsPickerOpen, setFormsPickerOpen] = useState(false);
  const [progressPickerOpen, setProgressPickerOpen] = useState(false);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [prestartPickerOpen, setPrestartPickerOpen] = useState(false);
  const [activeStatusKey, setActiveStatusKey] = useState(0);
  const activeStatus = useActiveStatus(activeStatusKey);

  const name = sessionData?.user?.name ?? me?.user?.name ?? '';
  const firstName = name.split(' ')[0] || 'there';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  function handleNavigate(href: string) {
    if (href === '?panel=notes') { setNotesOpen(true); return; }
    if (href === '?panel=notes-picker') { setNotesPickerOpen(true); return; }
    if (href === '?panel=delays-picker') { setDelaysPickerOpen(true); return; }
    if (href === '?panel=costs-picker') { setCostsPickerOpen(true); return; }
    if (href === '?panel=log-cost') { setLogCostOpen(true); return; }
    if (href === '?panel=signin') { setSignInOutOpen(true); return; }
    if (href === '?panel=forms-picker') { setFormsPickerOpen(true); return; }
    if (href === '?panel=progress-picker') { setProgressPickerOpen(true); return; }
    if (href === '?panel=schedule-picker') { setSchedulePickerOpen(true); return; }
    if (href === '?panel=drive-picker') { setDrivePickerOpen(true); return; }

    if (href === '?panel=prestart-picker') { setPrestartPickerOpen(true); return; }
    if (href === '?panel=camera') { setCameraPickerOpen(true); return; }
    navigate(href);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>Home — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD field launcher — quick access to camera, drive, forms, job costs and more." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/home" />
      </Helmet>
      <h1 className="sr-only">IWILLBUILD Home</h1>

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-5 pt-5 pb-4" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-medium">{dateStr}</p>
            <p className="text-gray-900 font-bold text-xl leading-tight mt-0.5">
              {greeting}, {firstName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Notification bell — wrapped to invert for light bg */}
            <div className="[&_button]:text-gray-500 [&_button:hover]:text-gray-800 [&_button]:bg-gray-100 [&_button]:rounded-full [&_button]:p-2">
              <NotificationBell />
            </div>
            <button
              onClick={() => setProfileOpen(true)}
              className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center"
            >
              <User size={18} className="text-orange-500" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Active status sub-header ── */}
      <AnimatePresence>
        {(activeStatus?.jobSignIn || activeStatus?.driving) && (
          <ActiveStatusBar
            status={activeStatus}
            onJobPress={() => setSignInOutOpen(true)}
            onDriveStop={async (sessionId) => {
              await fetch(`/api/fleet/driver-sessions/${sessionId}/stop`, {
                method: 'POST', credentials: 'include',
              });
              setActiveStatusKey(k => k + 1);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Scrollable icon grid ── */}
      <div className="flex-1 overflow-y-auto pb-28 pt-5 space-y-7">

        <Section label="Field" icons={FIELD_ICONS} onNavigate={handleNavigate} />

        {can('estimating') && (
          <Section label="Estimating" icons={ESTIMATING_ICONS} onNavigate={handleNavigate} />
        )}

        {isAdmin && (
          <Section label="Admin" icons={ADMIN_ICONS} onNavigate={handleNavigate} />
        )}

        {isPlatformOwner && (
          <Section label="Platform" icons={PLATFORM_ICONS} onNavigate={handleNavigate} />
        )}
      </div>

      {/* ── Bottom bar — Dashboard ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 px-4 py-3" style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)' }}>
        <button
          onClick={() => setDashOpen(true)}
          className="w-full flex items-center justify-center gap-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-2xl py-3.5 transition-colors shadow-sm"
        >
          <LayoutDashboard size={16} className="text-white" />
          <span className="text-white text-sm font-bold">Dashboard</span>
          <ChevronUp size={14} className="text-white/70" />
        </button>
      </div>

      {/* ── Sheets ── */}
      <Sheet
        open={dashOpen}
        onClose={() => setDashOpen(false)}
        title="Dashboard"
        titleIcon={LayoutDashboard}
        titleIconClass="text-orange-500"
      >
        <KpiWidgets />
        <div className="mt-4">
          <MyTasksPanel userRole={role ?? ''} />
        </div>
      </Sheet>

      <Sheet
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="Notes & Tasks"
        titleIcon={StickyNote}
        titleIconClass="text-yellow-500"
      >
        <MyTasksPanel userRole={role ?? ''} />
      </Sheet>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <CameraJobPickerSheet open={cameraPickerOpen} onClose={() => setCameraPickerOpen(false)} />
      <NotesJobPickerSheet open={notesPickerOpen} onClose={() => setNotesPickerOpen(false)} />
      <DelaysJobPickerSheet open={delaysPickerOpen} onClose={() => setDelaysPickerOpen(false)} />
      <CostsJobPickerSheet open={costsPickerOpen} onClose={() => setCostsPickerOpen(false)} />
      <LogCostSheet open={logCostOpen} onClose={() => setLogCostOpen(false)} />
      <SignInOutSheet open={signInOutOpen} onClose={() => { setSignInOutOpen(false); setActiveStatusKey(k => k + 1); }} />
      <FormsJobPickerSheet open={formsPickerOpen} onClose={() => setFormsPickerOpen(false)} />
      <ProgressJobPickerSheet open={progressPickerOpen} onClose={() => setProgressPickerOpen(false)} />
      <ScheduleJobPickerSheet open={schedulePickerOpen} onClose={() => setSchedulePickerOpen(false)} />
      {drivePickerOpen && (
        <StartDrivingModal
          onClose={() => setDrivePickerOpen(false)}
          onStarted={() => { setDrivePickerOpen(false); setActiveStatusKey(k => k + 1); }}
        />
      )}
      <PrestartFleetPickerSheet open={prestartPickerOpen} onClose={() => setPrestartPickerOpen(false)} />
    </div>
  );
}
