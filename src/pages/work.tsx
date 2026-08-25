/**
 * /work — Work Workspace
 *
 * Desktop (lg+): 6-tab shell — Tasks | Notes | Delays | Progress | Attendance | Tools
 * Mobile/tablet (<lg): launcher grid → feature view with Back + Home controls
 *
 * Route: /work?workTab=tasks|notes|delays|progress|attendance|tools
 * Job integration: /work?workTab=tasks&jobId=123
 *
 * @seo-exempt
 */
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Briefcase, CheckSquare, StickyNote, Clock, TrendingUp, Users, Wrench,
  Plus, Loader2, Calculator, Ruler, ChevronDown, Home, ArrowLeft,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import NewJobModal from '@/components/NewJobModal';
import { usePermissions } from '@/lib/usePermissions';

// Lazy-load each tab to keep initial bundle small
const WorkTasksTab = lazy(() => import('@/components/work/WorkTasksTab'));
const WorkNotesTab = lazy(() => import('@/components/work/WorkNotesTab'));
const WorkDelaysTab = lazy(() => import('@/components/work/WorkDelaysTab'));
const WorkProgressTab = lazy(() => import('@/components/work/WorkProgressTab'));
const WorkAttendanceTab = lazy(() => import('@/components/work/WorkAttendanceTab'));
// WorkToolsTab is small — not lazy-loaded
import WorkToolsTab from '@/components/work/WorkToolsTab';

// ── Tab config ────────────────────────────────────────────────────────────────

type WorkTab = 'tasks' | 'notes' | 'delays' | 'progress' | 'attendance';

interface TabDef {
  id: WorkTab;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'tasks',      label: 'Tasks',      icon: CheckSquare },
  { id: 'notes',      label: 'Notes',      icon: StickyNote  },
  { id: 'delays',     label: 'Delays',     icon: Clock       },
  { id: 'progress',   label: 'Progress',   icon: TrendingUp  },
  { id: 'attendance', label: 'Attendance', icon: Users       },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

// ── Mobile launcher items (superset of TABS — includes Tools) ─────────────────

interface LauncherItem {
  key: WorkTab | 'tools';
  label: string;
  icon: React.ElementType;
  description: string;
  iconBg: string;
  iconFg: string;
}

const LAUNCHER_ITEMS: LauncherItem[] = [
  { key: 'tasks',      label: 'Tasks',      icon: CheckSquare, description: 'View and manage job tasks',         iconBg: 'bg-blue-100',   iconFg: 'text-blue-600'   },
  { key: 'notes',      label: 'Notes',      icon: StickyNote,  description: 'Site observations and reminders',   iconBg: 'bg-yellow-100', iconFg: 'text-yellow-600' },
  { key: 'delays',     label: 'Delays',     icon: Clock,       description: 'Record and track delay events',     iconBg: 'bg-orange-100', iconFg: 'text-orange-600' },
  { key: 'progress',   label: 'Progress',   icon: TrendingUp,  description: 'Program of Works and milestones',   iconBg: 'bg-cyan-100',   iconFg: 'text-cyan-600'   },
  { key: 'attendance', label: 'Attendance', icon: Users,       description: 'Site sign-in and sign-out records', iconBg: 'bg-green-100',  iconFg: 'text-green-600'  },
  { key: 'tools',      label: 'Tools',      icon: Wrench,      description: 'Builders Calculator and Takeoff',   iconBg: 'bg-violet-100', iconFg: 'text-violet-600' },
];

// ── Tools sub-items ───────────────────────────────────────────────────────────

const TOOL_ITEMS = [
  { label: 'Builders Calculator', icon: Calculator, href: '/builders-calc', iconBg: 'bg-violet-100', iconFg: 'text-violet-600', description: 'Areas, volumes, materials and cost estimates' },
  { label: 'Takeoff Pad',         icon: Ruler,      href: '/takeoff-pad',   iconBg: 'bg-blue-100',   iconFg: 'text-blue-600',   description: 'Measure and quantify from plans'             },
] as const;

// ── Desktop Tools dropdown ────────────────────────────────────────────────────

function ToolsDropdown() {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  function openMenu() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openMenu()}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Tools menu"
        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 min-h-[44px] ${
          open ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
        }`}
      >
        <Wrench size={13} />
        Tools
        <ChevronDown size={11} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && menuPos && createPortal(
        <div
          role="menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            zIndex: 9999,
            minWidth: 200,
            maxWidth: 'calc(100vw - 1rem)',
          }}
          className="bg-background border border-border rounded-xl shadow-xl overflow-hidden"
        >
          {TOOL_ITEMS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.href}
                role="menuitem"
                onClick={() => { setOpen(false); navigate(tool.href); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left min-h-[44px]"
              >
                <Icon size={15} className="text-muted-foreground shrink-0" />
                {tool.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

// ── Mobile launcher grid ──────────────────────────────────────────────────────

interface MobileLauncherProps {
  onSelect: (tab: WorkTab | 'tools') => void;
  onNewJob: () => void;
  isViewOnly: boolean;
}

function MobileWorkLauncher({ onSelect, onNewJob, isViewOnly }: MobileLauncherProps) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/home')}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0 hover:bg-muted/80 transition-colors"
            aria-label="Back to Home"
          >
            <ArrowLeft size={15} className="text-muted-foreground" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Briefcase size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Work</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">Company-wide register</p>
          </div>
        </div>
        {!isViewOnly && (
          <button
            onClick={onNewJob}
            className="lg:hidden flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors min-h-[44px]"
          >
            <Plus size={13} /> New Job
          </button>
        )}
      </div>

      {/* Launcher grid — fills remaining space, scrolls only if needed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {LAUNCHER_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                className="flex flex-col items-start gap-2.5 bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/40 active:scale-[0.97] transition-all min-h-[88px]"
              >
                <div className={`w-10 h-10 rounded-xl ${item.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon size={20} className={item.iconFg} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground leading-tight">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Mobile Tools sub-launcher ─────────────────────────────────────────────────

function MobileToolsLauncher({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full">
      {/* Header with Back */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background shrink-0">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
          aria-label="Back to Work"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <Wrench size={14} className="text-violet-600" />
          </div>
          <h2 className="text-sm font-bold text-foreground">Tools</h2>
        </div>
        <a
          href="/"
          className="ml-auto flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
          aria-label="Home"
        >
          <Home size={16} />
        </a>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-1 gap-3">
          {TOOL_ITEMS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.href}
                onClick={() => navigate(tool.href)}
                className="flex items-center gap-4 bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/40 active:scale-[0.98] transition-all min-h-[72px]"
              >
                <div className={`w-12 h-12 rounded-2xl ${tool.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon size={22} className={tool.iconFg} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground">{tool.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{tool.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Mobile feature view (tab content + header) ────────────────────────────────

interface MobileFeatureViewProps {
  tab: WorkTab;
  jobId: number | null;
  jobName: string | null;
  onBack: () => void;
}

function MobileFeatureView({ tab, jobId, jobName, onBack }: MobileFeatureViewProps) {
  const tabDef = TABS.find((t) => t.id === tab)!;
  const Icon = tabDef.icon;

  return (
    <div className="flex flex-col h-full">
      {/* Feature header with Back + Home */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background shrink-0">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
          aria-label="Back to Work"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`w-7 h-7 rounded-lg ${tabDef.iconBg} flex items-center justify-center shrink-0`}>
            <Icon size={14} className={tabDef.iconFg} />
          </div>
          <h2 className="text-sm font-bold text-foreground truncate">{tabDef.label}</h2>
        </div>
        <a
          href="/"
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
          aria-label="Home"
        >
          <Home size={16} />
        </a>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<TabFallback />}>
          {tab === 'tasks'      && <WorkTasksTab      initialJobId={jobId} initialJobName={jobName} />}
          {tab === 'notes'      && <WorkNotesTab      initialJobId={jobId} initialJobName={jobName} />}
          {tab === 'delays'     && <WorkDelaysTab     initialJobId={jobId} initialJobName={jobName} />}
          {tab === 'progress'   && <WorkProgressTab   initialJobId={jobId} initialJobName={jobName} />}
          {tab === 'attendance' && <WorkAttendanceTab initialJobId={jobId} initialJobName={jobName} />}
          {tab === 'tools'      && <WorkToolsTab />}
        </Suspense>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isViewOnly } = usePermissions();

  const rawTab = searchParams.get('workTab') ?? '';
  const activeTab: WorkTab | null = VALID_TABS.has(rawTab) ? (rawTab as WorkTab) : null;

  // Job integration — pre-filter from URL
  const rawJobId = searchParams.get('jobId');
  const jobId = rawJobId ? parseInt(rawJobId, 10) : null;
  const jobName = searchParams.get('jobName') ?? null;

  const [newJobOpen, setNewJobOpen] = useState(false);

  // Mobile tools sub-launcher state
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  function switchTab(tab: WorkTab) {
    const next = new URLSearchParams(searchParams);
    next.set('workTab', tab);
    setSearchParams(next, { replace: true });
  }

  function clearTab() {
    const next = new URLSearchParams(searchParams);
    next.delete('workTab');
    setSearchParams(next, { replace: true });
    setMobileToolsOpen(false);
  }

  // On mobile, if workTab=tools is in URL, show tools sub-launcher
  useEffect(() => {
    if (activeTab === 'tools') setMobileToolsOpen(true);
  }, [activeTab]);

  // Desktop: active tab defaults to 'tasks' when no tab in URL
  const desktopTab: WorkTab = (activeTab as WorkTab) ?? 'tasks';

  return (
    <div className="portal-page">
      <Helmet>
        <title>Work — IWILLBUILD</title>
        <meta name="description" content="Company-wide work register: tasks, notes, delays, progress, attendance." />
        <link rel="canonical" href="https://iwillbuild.com/work" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      {/* ── Desktop layout (lg+) ── */}
      <div className="hidden lg:flex flex-col flex-1 min-w-0 lg-portal overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-background">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase size={16} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-foreground leading-tight">Work</h1>
                <p className="text-[11px] text-muted-foreground leading-tight">Company-wide register</p>
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <nav
            className="flex overflow-x-auto scrollbar-none border-t border-border px-2 md:px-4"
            aria-label="Work sections"
          >
            {TABS.filter((t) => t.id !== 'tools').map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === desktopTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 min-h-[44px] ${
                    active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
            <ToolsDropdown />
          </nav>
        </header>

        {/* Tab content */}
        <main className="flex-1 overflow-hidden">
          <Suspense fallback={<TabFallback />}>
            {desktopTab === 'tasks'      && <WorkTasksTab      initialJobId={jobId} initialJobName={jobName} />}
            {desktopTab === 'notes'      && <WorkNotesTab      initialJobId={jobId} initialJobName={jobName} />}
            {desktopTab === 'delays'     && <WorkDelaysTab     initialJobId={jobId} initialJobName={jobName} />}
            {desktopTab === 'progress'   && <WorkProgressTab   initialJobId={jobId} initialJobName={jobName} />}
            {desktopTab === 'attendance' && <WorkAttendanceTab initialJobId={jobId} initialJobName={jobName} />}
            {desktopTab === 'tools'      && <WorkToolsTab />}
          </Suspense>
        </main>
      </div>

      {/* ── Mobile / tablet layout (<lg) ── */}
      <div className="flex lg:hidden flex-col flex-1 min-w-0 overflow-hidden">
        {/* Tools sub-launcher */}
        {mobileToolsOpen && (
          <MobileToolsLauncher onBack={() => { setMobileToolsOpen(false); clearTab(); }} />
        )}

        {/* Feature view — a tab is selected and it's not tools */}
        {!mobileToolsOpen && activeTab && activeTab !== 'tools' && (
          <MobileFeatureView
            tab={activeTab}
            jobId={jobId}
            jobName={jobName}
            onBack={clearTab}
          />
        )}

        {/* Launcher — no tab selected */}
        {!mobileToolsOpen && !activeTab && (
          <MobileWorkLauncher
            onSelect={(tab) => {
              if (tab === 'tools') {
                setMobileToolsOpen(true);
                switchTab('tools');
              } else {
                switchTab(tab);
              }
            }}
            onNewJob={() => setNewJobOpen(true)}
            isViewOnly={isViewOnly}
          />
        )}
      </div>

      {/* New Job modal */}
      <NewJobModal
        open={newJobOpen}
        onClose={() => setNewJobOpen(false)}
        onCreated={(job) => {
          setNewJobOpen(false);
          navigate(`/jobs/${job.id}`);
        }}
      />
    </div>
  );
}
