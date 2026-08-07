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

import {
  useState, useRef, useCallback, useEffect,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { LayoutDashboard, Zap, Settings2, ShieldCheck, Plus, LogIn, Car } from 'lucide-react';
import KpiWidgets from '@/components/dashboard/KpiWidgets';
import DashboardBanner from '@/components/dashboard/DashboardBanner';
import NotificationList from '@/components/NotificationList';
import MyTasksPanel from '@/components/notes/MyTasksPanel';
import { resolveHomeIcons, type HomeIconDef } from '@/lib/homeIcons';
import { IconTile } from './IconTile';
import NewJobModal from '@/components/NewJobModal';

const PLATFORM_ICONS: Omit<HomeIconDef, 'key' | 'group'>[] = [
  { label: 'Console', icon: ShieldCheck, href: '/owner-console', bg: 'bg-red-600', fg: 'text-white' },
];

// ── Page definitions ──────────────────────────────────────────────────────────

const PAGE_LABELS = ['Dashboard', 'Field', 'Manage'] as const;
const PAGE_ICONS  = [LayoutDashboard, Zap, Settings2] as const;

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

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-2 pt-3 pb-1 px-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400/80 select-none">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200/60" />
    </div>
  );
}

// ── Icon grid page ────────────────────────────────────────────────────────────

function IconPage({
  icons,
  sections,
  showLabels,
  onNavigate,
}: {
  icons: HomeIconDef[];
  sections: { group: string; label: string; icons: HomeIconDef[] }[];
  showLabels: boolean;
  onNavigate: (href: string) => void;
}) {
  if (icons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <p className="text-sm font-medium">No icons available</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-4">
      <div className="mx-auto" style={{ maxWidth: 480 }}>
        {showLabels ? (
          sections.map(({ group, label, icons: sIcons }) => (
            <div key={group}>
              <SectionLabel label={label} />
              <div className="home-icon-grid">
                {sIcons.map(item => (
                  <IconTile key={item.key} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="home-icon-grid">
            {icons.map(item => (
              <IconTile key={item.key} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

function DashboardPage({
  userId,
  role,
  onNavigate,
}: {
  userId: string;
  role: string;
  onNavigate: (href: string) => void;
}) {
  const [newJobOpen, setNewJobOpen] = useState(false);

  return (
    <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
      {/* Header row: title + Add Job button */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Dashboard</span>
        <button
          onClick={() => setNewJobOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm active:scale-95 transition-transform"
        >
          <Plus size={13} strokeWidth={2.5} />
          Add Job
        </button>
      </div>

      {/* ── Quick-action row: Sign In + Drive ─────────────────────────────────
          These are the two most-used field actions. Shown here on the Dashboard
          page so they're always visible without swiping to Field. */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('?panel=signin')}
          className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-2xl bg-blue-600 text-white shadow-sm active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <LogIn size={20} strokeWidth={2} />
          </div>
          <span className="text-sm font-bold leading-tight">Sign In</span>
          <span className="text-[10px] text-white/60 leading-tight">Record site attendance</span>
        </button>
        <button
          onClick={() => onNavigate('?panel=drive-picker')}
          className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-2xl bg-sky-500 text-white shadow-sm active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Car size={20} strokeWidth={2} />
          </div>
          <span className="text-sm font-bold leading-tight">Drive</span>
          <span className="text-[10px] text-white/60 leading-tight">Start a driving session</span>
        </button>
      </div>

      <DashboardBanner userId={userId} />
      <KpiWidgets />
      <NotificationList />
      <MyTasksPanel userRole={role} />

      <NewJobModal
        open={newJobOpen}
        onClose={() => setNewJobOpen(false)}
        onCreated={() => setNewJobOpen(false)}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PagedHomeScreen({
  iconPermissions,
  role,
  isSolo,
  isPlatformOwner,
  userId,
  onNavigate,
}: PagedHomeScreenProps) {
  const [page, setPage] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Resolve icons (client-side only, same pattern as HomeIconGrid) ──────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const allowedIcons = mounted
    ? resolveHomeIcons(iconPermissions, role, isSolo)
    : resolveHomeIcons(null, '', false);

  const platformAsIconDef: HomeIconDef[] = PLATFORM_ICONS.map(p => ({
    ...p,
    key: p.label.toLowerCase().replace(/\s+/g, '_'),
    group: 'management' as const,
  }));

  const allIcons: HomeIconDef[] = [
    ...allowedIcons,
    ...(isPlatformOwner ? platformAsIconDef : []),
  ];

  // ── Page 1: Field icons (field + safety + tools groups) ─────────────────────
  const fieldGroupDefs = [
    { group: 'field',  label: 'Field' },
    { group: 'safety', label: 'Finance & Tools' },
    { group: 'tools',  label: 'Studio' },
  ];
  const fieldSections = fieldGroupDefs
    .map(g => ({ ...g, icons: allIcons.filter(i => i.group === g.group) }))
    .filter(s => s.icons.length > 0);
  const fieldIcons = fieldSections.flatMap(s => s.icons);

  // ── Page 2: Management icons ─────────────────────────────────────────────────
  const mgmtIcons = allIcons.filter(i => i.group === 'management');
  const mgmtSections = [{ group: 'management', label: 'Management', icons: mgmtIcons }];

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
    const atEnd   = page === 2 && dx < 0;
    const rubber  = atStart || atEnd ? dx * 0.25 : dx;

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
    if (dragDelta < -threshold && page < 2) setPage(p => p + 1);
    else if (dragDelta > threshold && page > 0) setPage(p => p - 1);
    setDragDelta(0);
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = null;
  }, [dragDelta, page]);

  // ── Translate calculation ─────────────────────────────────────────────────────
  // Each page is 100vw wide; page index drives the base offset
  const baseTranslate = -page * 100; // percent
  const dragPercent   = isDragging && containerRef.current
    ? (dragDelta / containerRef.current.offsetWidth) * 100
    : 0;
  const totalTranslate = baseTranslate + dragPercent;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Page tab bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center shrink-0 px-4 pt-2 pb-1 gap-1"
        style={{ background: 'transparent' }}
      >
        {PAGE_LABELS.map((label, i) => {
          const Icon = PAGE_ICONS[i];
          const active = page === i;
          return (
            <button
              key={label}
              onClick={() => setPage(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 ${
                active
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-white/60 text-gray-500 hover:bg-white/80'
              }`}
            >
              <Icon size={11} strokeWidth={2.2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Swipe container ───────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Track — 3 pages wide, slides horizontally */}
        <div
          className="flex h-full"
          style={{
            width: '300%',
            transform: `translateX(${totalTranslate / 3}%)`,
            transition: isDragging ? 'none' : 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            willChange: 'transform',
          }}
        >
          {/* Page 0 — Dashboard */}
          <div
            className="overflow-y-auto min-h-0"
            style={{
              width: '33.333%',
              height: '100%',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            <DashboardPage userId={userId} role={role} onNavigate={onNavigate} />
          </div>

          {/* Page 1 — Field */}
          <div
            className="overflow-y-auto min-h-0"
            style={{
              width: '33.333%',
              height: '100%',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            <IconPage
              icons={fieldIcons}
              sections={fieldSections}
              showLabels={fieldSections.length > 1}
              onNavigate={onNavigate}
            />
          </div>

          {/* Page 2 — Management */}
          <div
            className="overflow-y-auto min-h-0"
            style={{
              width: '33.333%',
              height: '100%',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            <IconPage
              icons={mgmtIcons}
              sections={mgmtSections}
              showLabels={false}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </div>

      {/* ── Page dots ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-2 py-2 shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        {[0, 1, 2].map(i => (
          <button
            key={i}
            onClick={() => setPage(i)}
            aria-label={`Go to ${PAGE_LABELS[i]} page`}
            className={`transition-all duration-200 rounded-full ${
              page === i ? 'bg-primary' : 'bg-black/20'
            }`}
            style={{
              width:  page === i ? 20 : 6,
              height: 6,
            }}
          />
        ))}
      </div>
    </div>
  );
}
