/**
 * HomeScreen — Icon launcher replacing /dashboard as the post-login landing.
 *
 * Layout:
 *   - Greeting + avatar (top)
 *   - Field worker icons (always visible): Camera, Drive, Forms, Notes+Todo, Job Costs, Delays, Progress
 *   - Estimating section (can('estimating'))
 *   - Admin section (isAdmin)
 *   - Platform section (isPlatformOwner)
 *   - Bottom bar → Dashboard slide-up sheet
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, Car, FileText, StickyNote, BookOpen,
  Clock, TrendingUp, Calculator, Receipt, Users,
  HardHat, CalendarDays, Truck, FolderOpen, UserCircle,
  Map, Building2, Layers, Settings, CreditCard, Bot,
  ShieldCheck, LayoutDashboard, X, ChevronUp, LogOut,
  Bell, User,
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
  color: string;       // icon background tint
  iconColor: string;   // icon foreground
  badge?: number;
}

// ── Icon definitions ──────────────────────────────────────────────────────────

const FIELD_ICONS: AppIcon[] = [
  { label: 'Camera',     icon: Camera,      href: '/jobs?tab=photos',         color: 'bg-orange-500/20', iconColor: 'text-orange-400' },
  { label: 'Drive',      icon: Car,         href: '/driver',                  color: 'bg-blue-500/20',   iconColor: 'text-blue-400'   },
  { label: 'Forms',      icon: FileText,    href: '/studio?tab=forms',        color: 'bg-purple-500/20', iconColor: 'text-purple-400' },
  { label: 'Notes',      icon: StickyNote,  href: '?panel=notes',             color: 'bg-yellow-500/20', iconColor: 'text-yellow-400' },
  { label: 'Job Costs',  icon: BookOpen,    href: '/jobs?tab=costs',          color: 'bg-emerald-500/20',iconColor: 'text-emerald-400'},
  { label: 'Delays',     icon: Clock,       href: '/jobs?filter=delayed',     color: 'bg-red-500/20',    iconColor: 'text-red-400'    },
  { label: 'Progress',   icon: TrendingUp,  href: '/jobs?filter=inprogress',  color: 'bg-cyan-500/20',   iconColor: 'text-cyan-400'   },
];

const ESTIMATING_ICONS: AppIcon[] = [
  { label: 'Estimating', icon: Calculator,  href: '/estimating',  color: 'bg-indigo-500/20', iconColor: 'text-indigo-400' },
  { label: 'Invoices',   icon: Receipt,     href: '/invoices',    color: 'bg-teal-500/20',   iconColor: 'text-teal-400'   },
  { label: 'Customers',  icon: Users,       href: '/customers',   color: 'bg-pink-500/20',   iconColor: 'text-pink-400'   },
];

const ADMIN_ICONS: AppIcon[] = [
  { label: 'Jobs',       icon: HardHat,     href: '/jobs',                   color: 'bg-orange-500/20', iconColor: 'text-orange-400' },
  { label: 'Scheduler',  icon: CalendarDays,href: '/scheduler',              color: 'bg-blue-500/20',   iconColor: 'text-blue-400'   },
  { label: 'Fleet',      icon: Truck,       href: '/fleet',                  color: 'bg-slate-500/20',  iconColor: 'text-slate-300'  },
  { label: 'Files',      icon: FolderOpen,  href: '/files',                  color: 'bg-amber-500/20',  iconColor: 'text-amber-400'  },
  { label: 'Team',       icon: UserCircle,  href: '/team',                   color: 'bg-violet-500/20', iconColor: 'text-violet-400' },
  { label: 'Plans',      icon: Map,         href: '/plan-manager',           color: 'bg-lime-500/20',   iconColor: 'text-lime-400'   },
  { label: 'Assets',     icon: Building2,   href: '/studio/asset-manager',   color: 'bg-rose-500/20',   iconColor: 'text-rose-400'   },
  { label: 'Studio',     icon: Layers,      href: '/studio',                 color: 'bg-fuchsia-500/20',iconColor: 'text-fuchsia-400'},
  { label: 'Safety',     icon: ShieldCheck, href: '/studio?tab=safety',      color: 'bg-green-500/20',  iconColor: 'text-green-400'  },
];

const PLATFORM_ICONS: AppIcon[] = [
  { label: 'Settings',   icon: Settings,    href: '/settings',     color: 'bg-slate-500/20',  iconColor: 'text-slate-300'  },
  { label: 'Billing',    icon: CreditCard,  href: '/billing',      color: 'bg-emerald-500/20',iconColor: 'text-emerald-400'},
  { label: 'Dazza AI',   icon: Bot,         href: '/dazza-ai',     color: 'bg-cyan-500/20',   iconColor: 'text-cyan-400'   },
  { label: 'Console',    icon: ShieldCheck, href: '/owner-console',color: 'bg-red-500/20',    iconColor: 'text-red-400'    },
];

// ── Single icon tile ──────────────────────────────────────────────────────────

function IconTile({ item, onNavigate }: { item: AppIcon; onNavigate: (href: string) => void }) {
  const Icon = item.icon;
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => onNavigate(item.href)}
      className="flex flex-col items-center gap-2 group"
    >
      <div className={`w-16 h-16 rounded-2xl ${item.color} flex items-center justify-center relative border border-white/5 shadow-lg`}>
        <Icon size={28} className={item.iconColor} strokeWidth={1.8} />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </div>
      <span className="text-[11px] text-white/70 font-medium text-center leading-tight max-w-[72px]">
        {item.label}
      </span>
    </motion.button>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, icons, onNavigate }: { label: string; icons: AppIcon[]; onNavigate: (href: string) => void }) {
  return (
    <div className="px-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3 px-1">{label}</p>
      <div className="grid grid-cols-4 gap-x-2 gap-y-5">
        {icons.map((item) => (
          <IconTile key={item.label} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard slide-up sheet ──────────────────────────────────────────────────

function DashboardSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = usePermissions();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#111827] rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden border-t border-white/10"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <LayoutDashboard size={16} className="text-orange-400" />
                <span className="text-white font-bold text-sm">Dashboard</span>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
                <X size={18} />
              </button>
            </div>
            {/* Content */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
              <KpiWidgets />
              <MyTasksPanel userRole={role ?? ''} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Notes+Todo slide-up sheet ─────────────────────────────────────────────────

function NotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = usePermissions();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#111827] rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden border-t border-white/10"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <StickyNote size={16} className="text-yellow-400" />
                <span className="text-white font-bold text-sm">Notes &amp; Tasks</span>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4">
              <MyTasksPanel userRole={role ?? ''} />
            </div>
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
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#111827] rounded-t-3xl border-t border-white/10 overflow-hidden"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-5 py-4">
              {/* Avatar + name */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                  <User size={24} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-base">{name}</p>
                  <p className="text-white/50 text-xs">{email}</p>
                  {company && <p className="text-white/40 text-xs mt-0.5">{company}</p>}
                </div>
              </div>
              {/* Actions */}
              <div className="space-y-2 mb-4">
                <button
                  onClick={() => { onClose(); navigate('/settings'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white/80 text-sm font-medium"
                >
                  <Settings size={16} className="text-white/50" />
                  Settings
                </button>
                <button
                  onClick={() => void handleSignOut()}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-red-400 text-sm font-medium"
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
  const { can, isAdmin, isPlatformOwner, me, loading } = usePermissions();
  const { data: sessionData } = useSession();

  const [dashOpen, setDashOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const name = sessionData?.user?.name ?? me?.user?.name ?? '';
  const firstName = name.split(' ')[0] || 'there';

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Date string
  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  function handleNavigate(href: string) {
    if (href === '?panel=notes') {
      setNotesOpen(true);
      return;
    }
    navigate(href);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col">
      <Helmet>
        <title>Home — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD field launcher — quick access to camera, drive, forms, job costs and more." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/home" />
      </Helmet>
      {/* visually hidden h1 for SEO validator */}
      <h1 className="sr-only">IWILLBUILD Home</h1>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 pt-safe-top pt-4 pb-3">
        <div>
          <p className="text-white/40 text-xs">{dateStr}</p>
          <p className="text-white font-bold text-lg leading-tight">
            {greeting}, {firstName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button
            onClick={() => setProfileOpen(true)}
            className="w-10 h-10 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center"
          >
            <User size={18} className="text-orange-400" />
          </button>
        </div>
      </div>

      {/* ── Scrollable icon area ── */}
      <div className="flex-1 overflow-y-auto pb-24 space-y-7 pt-2">

        {/* Field worker — always visible */}
        <Section label="Field" icons={FIELD_ICONS} onNavigate={handleNavigate} />

        {/* Estimating */}
        {can('estimating') && (
          <Section label="Estimating" icons={ESTIMATING_ICONS} onNavigate={handleNavigate} />
        )}

        {/* Admin */}
        {isAdmin && (
          <Section label="Admin" icons={ADMIN_ICONS} onNavigate={handleNavigate} />
        )}

        {/* Platform owner */}
        {isPlatformOwner && (
          <Section label="Platform" icons={PLATFORM_ICONS} onNavigate={handleNavigate} />
        )}
      </div>

      {/* ── Bottom bar — Dashboard ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pb-safe-bottom">
        <div className="mx-3 mb-3">
          <button
            onClick={() => setDashOpen(true)}
            className="w-full flex items-center justify-center gap-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-2xl py-3.5 transition-colors backdrop-blur-md"
          >
            <LayoutDashboard size={16} className="text-orange-400" />
            <span className="text-white/80 text-sm font-semibold">Dashboard</span>
            <ChevronUp size={14} className="text-white/40" />
          </button>
        </div>
      </div>

      {/* ── Sheets ── */}
      <DashboardSheet open={dashOpen} onClose={() => setDashOpen(false)} />
      <NotesSheet open={notesOpen} onClose={() => setNotesOpen(false)} />
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
