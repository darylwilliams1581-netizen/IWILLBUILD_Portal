/**
 * PagedHomeScreen — 3-page horizontal swiper for the mobile home screen.
 *
 * Page 0 (centre)  — Dashboard: greeting, KPI widgets, tasks, notifications
 * Page 1 (left)    — Job features: all 14 job-scoped features from registry
 * Page 2 (right)   — Management icons: jobs, contacts, fleet, finance, settings
 *
 * Navigation:
 *   • Touch swipe left/right
 *   • Page-dot taps
 *   • Page-label tab bar at the top of the swipe area
 */

import { useState, useRef, useCallback, useEffect, type TouchEvent as ReactTouchEvent } from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { LayoutDashboard, Briefcase, Settings2, ShieldCheck, Plus, LogIn, Car, HardHat, Camera as CameraIcon, User, LogOut, Users } from 'lucide-react';
import DashboardBanner from '@/components/dashboard/DashboardBanner';
import NotificationList from '@/components/NotificationList';
import NotificationBell from '@/components/NotificationBell';
import MyTasksPanel from '@/components/notes/MyTasksPanel';
import { resolveHomeIcons, type HomeIconDef } from '@/lib/homeIcons';
import { IconTile } from './IconTile';
import NewJobModal from '@/components/NewJobModal';
import { signOut } from '@/lib/auth/auth-client';
import SharedJobPickerSheet from '@/components/JobPickerSheet';
import {
  OPENING_PAGE_FEATURES,
  getFeatureByKey,
  FEATURE_GROUPS,
  type JobFeature,
} from '@/lib/jobFeatureRegistry';

// Suppress unused-import lint — OPENING_PAGE_FEATURES is referenced in tests via the module
void OPENING_PAGE_FEATURES;

const PLATFORM_ICONS: Omit<HomeIconDef, 'key' | 'group'>[] = [{
  label: 'Console',
  icon: ShieldCheck,
  href: '/owner-console',
  bg: 'bg-red-600',
  fg: 'text-white'
}];

// ── Page definitions ──────────────────────────────────────────────────────────

const PAGE_LABELS = ['Dashboard', 'Work & Field', 'Manage'] as const;
const PAGE_ICONS = [LayoutDashboard, Briefcase, Settings2] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface PagedHomeScreenProps {
  iconPermissions: string[] | null;
  role: string;
  isSolo: boolean;
  isPlatformOwner: boolean;
  userId: string;
  onNavigate: (href: string) => void;
}

// ── Group panel config ────────────────────────────────────────────────────────
// Panel background colours are defined as CSS custom properties in globals.css
// (--panel-work, --panel-field-files, --panel-finance, --panel-safety).
// Heading colours use Tailwind semantic classes so they respect the design system.

const GROUP_PANEL: Record<string, { panelVar: string; headingColor: string }> = {
  'Work':          { panelVar: 'var(--panel-work)',        headingColor: 'text-blue-700' },
  'Field & Files': { panelVar: 'var(--panel-field-files)', headingColor: 'text-violet-700' },
  'Finance':       { panelVar: 'var(--panel-finance)',     headingColor: 'text-emerald-700' },
  'Safety':        { panelVar: 'var(--panel-safety)',      headingColor: 'text-rose-700' },
};

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ label, headingColor }: { label: string; headingColor: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className={`text-[11px] font-bold uppercase tracking-[0.07em] select-none ${headingColor}`}>
        {label}
      </span>
    </div>
  );
}

// ── Job feature card — compact horizontal layout ──────────────────────────────
// Height: ~52–64px. Icon: 32×32px. Label: 13px semibold. Min touch target: 44px.

function JobFeatureCard({
  feature,
  onClick,
}: {
  feature: JobFeature;
  onClick: (f: JobFeature) => void;
}) {
  const Icon = feature.icon;
  return (
    <button
      type="button"
      onClick={() => onClick(feature)}
      data-testid={`opening-page-card-${feature.key}`}
      aria-label={feature.label}
      className="flex items-center gap-2.5 px-3 py-2.5 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-200 active:scale-[0.97] transition-all duration-150 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
      style={{ minHeight: 52 }}
    >
      {/* Icon badge — 32×32 */}
      <div className={`w-8 h-8 rounded-lg ${feature.bg} flex items-center justify-center shrink-0`}>
        <Icon size={16} className={feature.fg} />
      </div>
      {/* Label — wraps naturally, never truncates */}
      <span className="text-[13px] font-semibold text-gray-800 leading-tight text-left">
        {feature.label}
      </span>
    </button>
  );
}

// ── Job feature page (Page 1) ─────────────────────────────────────────────────

function JobFeaturePage({
  onFeatureClick,
}: {
  onFeatureClick: (f: JobFeature) => void;
}) {
  return (
    <div
      className="h-full overflow-y-auto bg-gray-50/60"
      data-testid="opening-page-job-features"
      // Normal bottom padding — no sticky bar on this page.
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
    >
      {/* Content column — max 640px, centred on wide screens */}
      <div className="mx-auto w-full px-3 pt-2 flex flex-col gap-3" style={{ maxWidth: 640 }}>
        {FEATURE_GROUPS.map(group => {
          const features = group.features.filter(f => f.inOpeningPage);
          if (features.length === 0) return null;
          const panel = GROUP_PANEL[group.label] ?? { panelVar: 'hsl(var(--muted))', headingColor: 'text-muted-foreground' };
          return (
            <section
              key={group.label}
              data-testid={`opening-page-group-${group.label}`}
              className="rounded-2xl px-3 pt-3 pb-3"
              style={{ background: panel.panelVar }}
              aria-label={`${group.label} features`}
            >
              <SectionHeading label={group.label} headingColor={panel.headingColor} />
              {/*
                Grid: 2 col mobile (≥320px) → 3 col sm (≥640px) → 4 col md (≥768px)
                Very narrow (<340px): still 2 col — labels wrap rather than clip.
              */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {features.map(feature => (
                  <JobFeatureCard
                    key={feature.key}
                    feature={feature}
                    onClick={onFeatureClick}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
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
  const [contactCount, setContactCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/customers?status=active&limit=200', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { customers?: unknown[] }) => {
        if (Array.isArray(d.customers)) setContactCount(d.customers.length);
      })
      .catch(() => {
        // Silently ignore — badge is optional
      });
  }, [userId]);

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
        {/* Site Prestart — col-span-2 */}
        <button onClick={() => onNavigate('?panel=site-prestart-picker')} className="col-span-2 flex items-center justify-center gap-3 px-3 py-4 rounded-2xl bg-red-500 text-white shadow-sm active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <HardHat size={20} strokeWidth={2} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold leading-tight">Site Prestart</span>
            <span className="text-[10px] text-white/60 leading-tight">Daily site checklist</span>
          </div>
        </button>
        {/* Contacts — col-span-2, matches Site Prestart exactly */}
        <button
          onClick={() => onNavigate('/customers')}
          className="col-span-2 flex items-center justify-center gap-3 px-3 py-4 rounded-2xl bg-teal-600 text-white shadow-sm active:scale-95 transition-transform relative"
          data-testid="contacts-launcher-btn"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Users size={20} strokeWidth={2} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-bold leading-tight">Contacts</span>
            <span className="text-[10px] text-white/60 leading-tight">Call, message or email</span>
          </div>
          {/* Count badge — only shown once loaded and > 0 */}
          {contactCount !== null && contactCount > 0 && (
            <span className="absolute top-2.5 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-white/25 text-white text-[10px] font-black flex items-center justify-center leading-none">
              {contactCount > 99 ? '99+' : contactCount}
            </span>
          )}
        </button>
      </div>

      <NotificationList />
      <MyTasksPanel userRole={role} />
      </div>
    </div>;
}

// ── Manage page (Page 2) ──────────────────────────────────────────────────────

/** Keys that are desktop-only and should be hidden from the Manage tile grid */
const DESKTOP_ONLY_KEYS = new Set<string>([]);
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
        <div className="grid grid-cols-2 gap-3" style={{
        gridAutoRows: 'minmax(96px, 1fr)'
      }}>
          {mobileIcons.map(item => <IconTile key={item.key} item={item} onNavigate={onNavigate} />)}
        </div>
      </div>
    </div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PagedHomeScreen({
  iconPermissions,
  role,
  isSolo,
  isPlatformOwner,
  userId,
  onNavigate
}: PagedHomeScreenProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Job feature picker state ──────────────────────────────────────────────
  const [pendingFeature, setPendingFeature] = useState<JobFeature | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Handle ?picker=<key> query param — e.g. from /work-field/:slug redirects
  useEffect(() => {
    const key = searchParams.get('picker');
    if (!key) return;
    const feature = getFeatureByKey(key);
    if (feature) {
      setPendingFeature(feature);
      setPickerOpen(true);
      setPage(1); // switch to Work & Field page
    }
  }, [searchParams]);

  function handleFeatureClick(feature: JobFeature) {
    setPendingFeature(feature);
    setPickerOpen(true);
  }

  function handlePickerClose() {
    setPickerOpen(false);
  }

  function handleJobSelect(job: { id: number }) {
    if (!pendingFeature) return;
    setPickerOpen(false);
    navigate(pendingFeature.standaloneRoute(job.id));
  }

  // ── Resolve icons (client-side only) ──────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const allowedIcons = mounted ? resolveHomeIcons(iconPermissions, role, isSolo) : resolveHomeIcons(null, '', false);
  const platformAsIconDef: HomeIconDef[] = PLATFORM_ICONS.map(p => ({
    ...p,
    key: p.label.toLowerCase().replace(/\s+/g, '_'),
    group: 'management' as const
  }));
  const allIcons: HomeIconDef[] = [...allowedIcons, ...(isPlatformOwner ? platformAsIconDef : [])];
  const mgmtIcons = allIcons.filter(i => i.group === 'management');

  // ── Swipe handlers ────────────────────────────────────────────────────────
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
    if (isHorizontalSwipe.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      isHorizontalSwipe.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontalSwipe.current) return;
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
    if (dragDelta < -threshold && page < 2) setPage(p => p + 1);
    else if (dragDelta > threshold && page > 0) setPage(p => p - 1);
    setDragDelta(0);
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = null;
  }, [dragDelta, page]);

  const baseTranslate = -page * 100;
  const dragPercent = isDragging && containerRef.current ? dragDelta / containerRef.current.offsetWidth * 100 : 0;
  const totalTranslate = baseTranslate + dragPercent;

  return <>
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Top bar: page tabs + utility buttons ─────────────────────────────── */}
      <div className="flex items-center shrink-0 px-2 pt-1.5 pb-1 gap-1.5">
        <div className="flex-1 min-w-0 flex items-center justify-center gap-1">
          {PAGE_LABELS.map((label, i) => {
            const Icon = PAGE_ICONS[i];
            const active = page === i;
            return (
              <button
                key={label}
                onClick={() => setPage(i)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 whitespace-nowrap ${active ? 'bg-violet-600 text-white shadow-sm' : 'bg-white/60 text-gray-500 hover:bg-white/80'}`}
              >
                <Icon size={11} strokeWidth={2.2} />
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="shrink-0"><NotificationBell /></div>
          <button
            onClick={() => navigate('/profile')}
            className="w-8 h-8 rounded-xl bg-violet-600 border border-violet-500 flex items-center justify-center hover:bg-violet-500 active:scale-95 transition-all shrink-0"
            aria-label="Profile"
          >
            <User size={15} className="text-white" />
          </button>
          <button
            onClick={async () => { await signOut(); navigate('/login'); }}
            className="w-8 h-8 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center hover:bg-red-600 hover:border-red-500 active:scale-95 transition-all shrink-0"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={13} className="text-slate-200" />
          </button>
        </div>
      </div>

      {/* ── Swipe container ──────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y', overflowX: 'clip', overflowY: 'visible' }}
      >
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
          <div className="overflow-y-auto min-h-0" style={{ width: '33.333%', height: '100%', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
            <DashboardPage userId={userId} role={role} onNavigate={onNavigate} onNewJob={() => setNewJobOpen(true)} />
          </div>

          {/* Page 1 — Work & Field */}
          <div className="min-h-0" style={{ width: '33.333%', height: '100%' }}>
            <JobFeaturePage onFeatureClick={handleFeatureClick} />
          </div>

          {/* Page 2 — Management */}
          <div className="min-h-0" style={{ width: '33.333%', height: '100%' }}>
            <ManagePage icons={mgmtIcons} onNavigate={onNavigate} />
          </div>
        </div>
      </div>

      {/* ── Page dots ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-2 py-1.5 shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
      >
        {[0, 1, 2].map(i => (
          <button
            key={i}
            onClick={() => setPage(i)}
            aria-label={`Go to ${PAGE_LABELS[i]} page`}
            className={`transition-all duration-200 rounded-full ${page === i ? 'bg-primary' : 'bg-black/20'}`}
            style={{ width: page === i ? 20 : 6, height: 6 }}
          />
        ))}
      </div>
    </div>



    <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} onCreated={() => setNewJobOpen(false)} />

    {/* Job feature picker — outside swipe track to avoid transform stacking context */}
    {pendingFeature && (
      <SharedJobPickerSheet
        open={pickerOpen}
        onClose={handlePickerClose}
        title={pendingFeature.label}
        subtitle={`Select a job to open ${pendingFeature.label}`}
        iconBg={pendingFeature.bg}
        iconFg={pendingFeature.fg}
        Icon={pendingFeature.icon}
        onSelect={handleJobSelect}
      />
    )}
  </>;
}
