/**
 * HomeScreen — Light-theme icon launcher.
 * Clean white/light-grey background, solid vibrant icon tiles,
 * dark text — iOS-style feel, not dark like the drive app.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, Car, FileText, StickyNote, BookOpen,
  Clock, TrendingUp, Calculator, Receipt, Users,
  HardHat, CalendarDays, Truck, FolderOpen, UserCircle,
  Map, Building2, Layers, Settings, CreditCard, Bot,
  ShieldCheck, LayoutDashboard, X, ChevronUp, ChevronRight, LogOut,
  User,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { useSession, signOut } from '@/lib/auth/auth-client';
import { invalidateMeCache } from '@/lib/usePermissions';
import { invalidateTerminologyCache } from '@/lib/useTerminology';
import { invalidateSubscriptionCache } from '@/lib/useSubscriptionGate';
import { invalidateSupportModeCache } from '@/lib/useSupportMode';
import KpiWidgets from '@/components/dashboard/KpiWidgets';
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
  { label: 'Camera',    icon: Camera,      href: '?panel=camera',           bg: 'bg-orange-500',   fg: 'text-white' },
  { label: 'Drive',     icon: Car,         href: '/driver',                 bg: 'bg-blue-500',     fg: 'text-white' },
  { label: 'Forms',     icon: FileText,    href: '/studio?tab=forms',       bg: 'bg-purple-500',   fg: 'text-white' },
  { label: 'Notes',     icon: StickyNote,  href: '?panel=notes',            bg: 'bg-yellow-400',   fg: 'text-white' },
  { label: 'Job Costs', icon: BookOpen,    href: '/jobs?tab=costs',         bg: 'bg-emerald-500',  fg: 'text-white' },
  { label: 'Delays',    icon: Clock,       href: '/jobs?filter=delayed',    bg: 'bg-red-500',      fg: 'text-white' },
  { label: 'Progress',  icon: TrendingUp,  href: '/jobs?filter=inprogress', bg: 'bg-cyan-500',     fg: 'text-white' },
];

const ESTIMATING_ICONS: AppIcon[] = [
  { label: 'Estimating', icon: Calculator, href: '/estimating', bg: 'bg-indigo-500', fg: 'text-white' },
  { label: 'Invoices',   icon: Receipt,    href: '/invoices',   bg: 'bg-teal-500',   fg: 'text-white' },
  { label: 'Customers',  icon: Users,      href: '/customers',  bg: 'bg-pink-500',   fg: 'text-white' },
];

const ADMIN_ICONS: AppIcon[] = [
  { label: 'Jobs',      icon: HardHat,     href: '/jobs',                  bg: 'bg-orange-500',   fg: 'text-white' },
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

  const name = sessionData?.user?.name ?? me?.user?.name ?? '';
  const firstName = name.split(' ')[0] || 'there';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  function handleNavigate(href: string) {
    if (href === '?panel=notes') { setNotesOpen(true); return; }
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
    </div>
  );
}
