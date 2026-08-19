/**
 * PagedHomeScreen — 3-page horizontal swiper for the mobile home screen.
 *
 * Page 0 (centre)  — Dashboard: greeting, KPI widgets, tasks, notifications
 * Page 1 (left)    — Field icons: all field + finance/tools/studio icons
 * Page 2 (right)   — Management icons: jobs, contacts, fleet, finance, settings
 *
 * Navigation:
 *   • Touch swipe left/right
 *   • Page-dot taps
 *   • Page-label tab bar at the top of the swipe area
 *
 * The component is self-contained — it receives the same props that
 * HomeIconGrid used to receive, plus the handleNavigate callback.
 */

import { useState, useRef, useCallback, useEffect, type TouchEvent as ReactTouchEvent } from 'react';
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from 'motion/react';
import { LayoutDashboard, Zap, Settings2, ShieldCheck, Plus, LogIn, Car, HardHat, Camera as CameraIcon, Search, X as XIcon, Loader2, ChevronRight, User, LogOut } from 'lucide-react';
// CameraIcon re-used for Lens tile below
import DashboardBanner from '@/components/dashboard/DashboardBanner';
import NotificationList from '@/components/NotificationList';
import NotificationBell from '@/components/NotificationBell';
import MyTasksPanel from '@/components/notes/MyTasksPanel';
import { resolveHomeIcons, type HomeIconDef } from '@/lib/homeIcons';
import { IconTile } from './IconTile';
import NewJobModal from '@/components/NewJobModal';
import { signOut } from '@/lib/auth/auth-client';
interface JobOption {
  id: number;
  jobNumber: string | null;
  name: string;
  status: string;
}

/**
 * JobPickerSheet — select a job then navigate to its Photos page.
 * No camera launch, no upload state. The Job Photos page handles all
 * photo-picker options (Photo Library / Take Photo / Choose Files).
 */
function JobPickerSheet({
  onClose
}: {
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [allJobs, setAllJobs] = useState<JobOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all active jobs once — no search route, no route-capture risk.
  async function fetchJobs() {
    setLoadingJobs(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/jobs', {
        credentials: 'include'
      });
      const body = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) {
        const errBody = body as {
          error?: string;
        };
        throw new Error(errBody.error ?? `Could not load jobs (${res.status})`);
      }
      const raw: unknown[] = Array.isArray(body) ? body : (body as {
        jobs?: unknown[];
      }).jobs ?? [];
      const validJobs: JobOption[] = raw.map(j => {
        const job = j as Record<string, unknown>;
        return {
          id: Number(job.id),
          jobNumber: (job.jobNumber ?? job.job_number ?? null) as string | null,
          name: String(job.name ?? ''),
          status: String(job.status ?? '')
        };
      }).filter(job => Number.isInteger(job.id) && job.id > 0 && !['completed', 'cancelled', 'archived'].includes(job.status.toLowerCase()));
      setAllJobs(validJobs);
      setJobs(validJobs);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not load jobs');
      setAllJobs([]);
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }

  // Initial load — no auto-focus on touch devices (iOS Safari zooms inputs < 16px)
  useEffect(() => {
    void fetchJobs();
    if (window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, []);

  // Local filtering — no network request on every keystroke
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setJobs(allJobs);
      return;
    }
    setJobs(allJobs.filter(job => job.name.toLowerCase().includes(q) || (job.jobNumber ?? '').toLowerCase().includes(q)));
  }, [query, allJobs]);
  const handleJobSelect = useCallback((job: JobOption) => {
    // Validate numeric ID — never navigate with NaN, "search", or non-positive
    const jobId = Number(job.id);
    if (!Number.isInteger(jobId) || jobId <= 0) return;
    onClose();
    navigate(`/jobs/${jobId}/photos`);
  }, [navigate, onClose]);
  return <>
      {/* Backdrop */}
      <motion.div initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} transition={{
      duration: 0.2
    }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Sheet — bottom sheet on mobile, centered dialog on desktop */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none w-full max-w-full overflow-x-hidden px-4">
        <motion.div initial={{
        y: '100%',
        opacity: 0
      }} animate={{
        y: 0,
        opacity: 1
      }} exit={{
        y: '100%',
        opacity: 0
      }} transition={{
        type: 'spring',
        damping: 28,
        stiffness: 300
      }} className="pointer-events-auto w-full max-w-[520px] bg-white flex flex-col overflow-hidden shadow-2xl rounded-t-3xl sm:rounded-2xl" style={{
        maxHeight: 'min(600px, calc(100dvh - 80px))',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
      }} onClick={e => e.stopPropagation()}>
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-3 pb-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
                <CameraIcon size={17} className="text-violet-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-gray-900 font-bold text-base leading-tight truncate">Job photo</h2>
                <p className="text-gray-400 text-xs leading-tight mt-0.5 truncate">Select a job to open its Photos page</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0" aria-label="Close">
              <XIcon size={15} />
            </button>
          </div>

          {fetchError && <div className="mx-4 mb-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-700 shrink-0 flex items-center justify-between gap-2">
              <span>{fetchError}</span>
              <button type="button" onClick={() => void fetchJobs()} className="underline underline-offset-2 shrink-0">Retry</button>
            </div>}

          {/* Search */}
          <div className="px-4 pb-2 shrink-0">
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search jobs, job numbers…" className="flex-1 bg-transparent text-base sm:text-sm text-gray-800 placeholder-gray-400 outline-none min-w-0" autoComplete="off" autoCorrect="off" spellCheck={false} />
              {loadingJobs && <Loader2 size={13} className="animate-spin text-gray-400 shrink-0" />}
              {!loadingJobs && query && <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                  <XIcon size={13} />
                </button>}
            </div>
          </div>

          <div className="h-px bg-gray-100 shrink-0 mx-4" />

          {/* Job list */}
          <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3 space-y-1.5">
            {jobs.length === 0 && !loadingJobs ? <p className="text-center text-gray-400 text-sm py-8">
                {fetchError ? 'Could not load jobs — tap Retry above' : query ? 'No jobs match your search' : 'No active jobs found'}
              </p> : jobs.map(job => <button key={job.id} type="button" onClick={() => handleJobSelect(job)} className="w-full flex items-center gap-3 bg-gray-50 hover:bg-violet-50 hover:border-violet-200 active:bg-violet-100 border border-gray-200 rounded-2xl px-4 py-3 text-left transition-colors">
                <div className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                  {job.jobNumber && <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>}
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </button>)}
          </div>
        </motion.div>
      </div>
    </>;
}
const PLATFORM_ICONS: Omit<HomeIconDef, 'key' | 'group'>[] = [{
  label: 'Console',
  icon: ShieldCheck,
  href: '/owner-console',
  bg: 'bg-red-600',
  fg: 'text-white'
}];

// ── Page definitions ──────────────────────────────────────────────────────────

const PAGE_LABELS = ['Dashboard', 'Field', 'Manage'] as const;
const PAGE_ICONS = [LayoutDashboard, Zap, Settings2] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface PagedHomeScreenProps {
  iconPermissions: string[] | null;
  role: string;
  isSolo: boolean;
  isPlatformOwner: boolean;
  userId: string;
  onNavigate: (href: string) => void;
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({
  label
}: {
  label: string;
}) {
  return <div className="col-span-full flex items-center gap-2 pt-3 pb-1 px-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400/80 select-none">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200/60" />
    </div>;
}

// ── Icon grid page ────────────────────────────────────────────────────────────

function IconPage({
  icons,
  sections,
  showLabels,
  onNavigate
}: {
  icons: HomeIconDef[];
  sections: {
    group: string;
    label: string;
    icons: HomeIconDef[];
  }[];
  showLabels: boolean;
  onNavigate: (href: string) => void;
}) {
  if (icons.length === 0) {
    return <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p className="text-sm font-medium">No icons available</p>
      </div>;
  }
  return <div className="h-full flex flex-col px-4 pt-2 pb-4" style={{
    paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
  }}>
      <div className="flex-1 flex flex-col mx-auto w-full" style={{
      maxWidth: 480
    }}>
        {showLabels ? sections.map(({
        group,
        label,
        icons: sIcons
      }) => <div key={group} className="flex-1 flex flex-col">
              <SectionLabel label={label} />
              <div className="flex-1 grid grid-cols-2 gap-3" style={{
          gridAutoRows: '1fr'
        }}>
                {sIcons.map(item => <IconTile key={item.key} item={item} onNavigate={onNavigate} />)}
              </div>
            </div>) : <div className="grid grid-cols-2 gap-3" style={{
        gridAutoRows: 'minmax(96px, 1fr)',
        maxHeight: '100%'
      }}>
            {icons.map(item => <IconTile key={item.key} item={item} onNavigate={onNavigate} />)}
          </div>}
      </div>
    </div>;
}

// ── Dashboard page ────────────────────────────────────────────────────────────

function DashboardPage({
  userId,
  role,
  onNavigate,
  onNewJob
}: {
  userId: string;
  role: string;
  onNavigate: (href: string) => void;
  onNewJob: () => void;
}) {
  return <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
      <div className="mx-auto w-full flex flex-col gap-4" style={{
      maxWidth: 480
    }}>
      {/* ── Banner — sits at the very top so it's immediately visible ── */}
      <DashboardBanner userId={userId} />

      {/* Full-width Lens + Add Job row */}
      <div className="flex items-center gap-3">
        <button onClick={() => onNavigate('/lens')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 text-white text-sm font-bold shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <CameraIcon size={20} strokeWidth={2} />
          </div>
          Lens
        </button>
        <button onClick={onNewJob} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Plus size={20} strokeWidth={2} />
          </div>
          Add Job
        </button>
      </div>

      {/* ── Quick-action grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNavigate('?panel=signin')} className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-2xl bg-blue-600 text-white shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <LogIn size={20} strokeWidth={2} />
          </div>
          <span className="text-sm font-bold leading-tight">Sign In</span>
          <span className="text-[10px] text-white/60 leading-tight">Record site attendance</span>
        </button>
        <button onClick={() => onNavigate('/fleet')} className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-2xl bg-sky-500 text-white shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Car size={20} strokeWidth={2} />
          </div>
          <span className="text-sm font-bold leading-tight">Fleet</span>
          <span className="text-[10px] text-white/60 leading-tight">Vehicles &amp; equipment</span>
        </button>
        <button onClick={() => onNavigate('?panel=site-prestart-picker')} className="col-span-2 flex items-center justify-center gap-3 px-3 py-4 rounded-2xl bg-red-500 text-white shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <HardHat size={20} strokeWidth={2} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold leading-tight">Site Prestart</span>
            <span className="text-[10px] text-white/60 leading-tight">Daily site checklist</span>
          </div>
        </button>

        {/* ── end grid ── */}
      </div>

      <NotificationList />
      <MyTasksPanel userRole={role} />
      </div>
    </div>;
}

// ── Manage page (Page 2) ──────────────────────────────────────────────────────
// Shows management icon tiles (minus desktop-only ones) + a full-width
// "Desktop features" link card at the bottom.

/** Keys that are desktop-only and should be hidden from the Manage tile grid */
const DESKTOP_ONLY_KEYS = new Set(['studio_docs', 'studio_forms', 'estimating', 'equipment']);
function ManagePage({
  icons,
  onNavigate
}: {
  icons: HomeIconDef[];
  onNavigate: (href: string) => void;
}) {
  const mobileIcons = icons.filter(i => !DESKTOP_ONLY_KEYS.has(i.key));
  return <div className="h-full overflow-y-auto flex flex-col px-4 pt-2 gap-4" style={{
    paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
  }}>
      <div className="mx-auto w-full" style={{
      maxWidth: 480
    }}>
        {/* ── Mobile icon grid ── */}
        <div className="grid grid-cols-2 gap-3" style={{
        gridAutoRows: 'minmax(96px, 1fr)'
      }}>
          {mobileIcons.map(item => <IconTile key={item.key} item={item} onNavigate={onNavigate} />)}
        </div>
      </div>
    </div>;
}
export default function PagedHomeScreen({
  iconPermissions,
  role,
  isSolo,
  isPlatformOwner,
  userId,
  onNavigate
}: PagedHomeScreenProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [cameraSheetOpen, setCameraSheetOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Resolve icons (client-side only, same pattern as HomeIconGrid) ──────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const allowedIcons = mounted ? resolveHomeIcons(iconPermissions, role, isSolo) : resolveHomeIcons(null, '', false);
  const platformAsIconDef: HomeIconDef[] = PLATFORM_ICONS.map(p => ({
    ...p,
    key: p.label.toLowerCase().replace(/\s+/g, '_'),
    group: 'management' as const
  }));
  const allIcons: HomeIconDef[] = [...allowedIcons, ...(isPlatformOwner ? platformAsIconDef : [])];

  // ── Page 1: Field icons (field + safety + tools groups) ─────────────────────
  const fieldGroupDefs = [{
    group: 'field',
    label: 'Field'
  }, {
    group: 'safety',
    label: 'Finance & Tools'
  }, {
    group: 'tools',
    label: 'Studio'
  }];
  const fieldSections = fieldGroupDefs.map(g => ({
    ...g,
    icons: allIcons.filter(i => i.group === g.group)
  })).filter(s => s.icons.length > 0);
  const fieldIcons = fieldSections.flatMap(s => s.icons);

  // ── Page 2: Management icons ─────────────────────────────────────────────────
  const mgmtIcons = allIcons.filter(i => i.group === 'management');

  // ── Swipe handlers ────────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsDragging(false);
    setDragDelta(0);
  }, []);
  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Determine swipe axis on first significant movement
    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontalSwipe.current) return;

    // Rubber-band at edges
    const atStart = page === 0 && dx > 0;
    const atEnd = page === 2 && dx < 0;
    const rubber = atStart || atEnd ? dx * 0.25 : dx;
    setIsDragging(true);
    setDragDelta(rubber);
  }, [page]);
  const handleTouchEnd = useCallback(() => {
    if (!isHorizontalSwipe.current) {
      setDragDelta(0);
      setIsDragging(false);
      return;
    }
    const threshold = 60;
    if (dragDelta < -threshold && page < 2) setPage(p => p + 1);else if (dragDelta > threshold && page > 0) setPage(p => p - 1);
    setDragDelta(0);
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = null;
  }, [dragDelta, page]);

  // ── Translate calculation ─────────────────────────────────────────────────────
  // Each page is 100vw wide; page index drives the base offset
  const baseTranslate = -page * 100; // percent
  const dragPercent = isDragging && containerRef.current ? dragDelta / containerRef.current.offsetWidth * 100 : 0;
  const totalTranslate = baseTranslate + dragPercent;
  return <>
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Top bar: page tabs (centred) + utility buttons (right) ─────────── */}
      <div className="flex items-center shrink-0 px-2 pt-2 pb-1.5 gap-1.5">
        {/* Centred tab pills — flex-1 so they fill available space, min-w-0 prevents overflow */}
        <div className="flex-1 min-w-0 flex items-center justify-center gap-1">
          {PAGE_LABELS.map((label, i) => {
            const Icon = PAGE_ICONS[i];
            const active = page === i;
            return <button key={label} onClick={() => setPage(i)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 whitespace-nowrap ${active ? 'bg-violet-600 text-white shadow-sm' : 'bg-white/60 text-gray-500 hover:bg-white/80'}`}>
                <Icon size={11} strokeWidth={2.2} />
                {label}
              </button>;
          })}
        </div>

        {/* Utility buttons — notification, profile, logout */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="shrink-0">
            <NotificationBell />
          </div>
          <button onClick={() => navigate('/profile')} className="w-8 h-8 rounded-xl bg-violet-600 border border-violet-500 flex items-center justify-center hover:bg-violet-500 active:scale-95 transition-all shrink-0" aria-label="Profile">
            <User size={15} className="text-white" />
          </button>
          <button onClick={async () => {
            await signOut();
            navigate('/login');
          }} className="w-8 h-8 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center hover:bg-red-600 hover:border-red-500 active:scale-95 transition-all shrink-0" aria-label="Log out" title="Log out">
            <LogOut size={13} className="text-slate-200" />
          </button>
        </div>
      </div>

      {/* ── Swipe container ───────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0 relative" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} style={{
        touchAction: 'pan-y',
        overflowX: 'clip',
        overflowY: 'visible'
      }}>
        {/* Track — 3 pages wide, slides horizontally */}
        <div className="flex h-full" style={{
          width: '300%',
          transform: `translateX(${totalTranslate / 3}%)`,
          transition: isDragging ? 'none' : 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          willChange: 'transform'
        }}>
          {/* Page 0 — Dashboard */}
          <div className="overflow-y-auto min-h-0" style={{
            width: '33.333%',
            height: '100%',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
          }}>
            <DashboardPage userId={userId} role={role} onNavigate={onNavigate} onNewJob={() => setNewJobOpen(true)} />
          </div>

          {/* Page 1 — Field: no scroll, tiles stretch to fill height */}
          <div className="min-h-0" style={{
            width: '33.333%',
            height: '100%'
          }}>
            <IconPage icons={fieldIcons} sections={fieldSections} showLabels={fieldSections.length > 1} onNavigate={onNavigate} />
          </div>

          {/* Page 2 — Management */}
          <div className="min-h-0" style={{
            width: '33.333%',
            height: '100%'
          }}>
            <ManagePage icons={mgmtIcons} onNavigate={onNavigate} />
          </div>
        </div>
      </div>

      {/* ── Page dots ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 py-2 shrink-0" style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)'
      }}>
        {[0, 1, 2].map(i => <button key={i} onClick={() => setPage(i)} aria-label={`Go to ${PAGE_LABELS[i]} page`} className={`transition-all duration-200 rounded-full ${page === i ? 'bg-primary' : 'bg-black/20'}`} style={{
          width: page === i ? 20 : 6,
          height: 6
        }} />)}
      </div>
    </div>

    {/* NewJobModal rendered OUTSIDE the swipe track so CSS transform doesn't
        break fixed positioning — the modal covers the full viewport correctly */}
    <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} onCreated={() => setNewJobOpen(false)} />

    {/* JobPickerSheet also rendered OUTSIDE the swipe track for the same reason:
        translateX + willChange:transform creates a stacking context that traps
        position:fixed children, clipping the sheet to the swipe container. */}
    <AnimatePresence>
      {cameraSheetOpen && <JobPickerSheet onClose={() => setCameraSheetOpen(false)} />}
    </AnimatePresence>
    </>;
}
