/**
 * /work — Work Workspace
 *
 * 6-tab shell: Tasks | Notes | Delays | Progress | Attendance | Tools
 *
 * Route: /work?workTab=tasks|notes|delays|progress|attendance|tools
 * Job integration: /work?workTab=tasks&jobId=123
 *
 * Header: Work title, + New Job button, tab nav, section-specific controls.
 * Does NOT overwrite AppShell, OfficeShell, ShellRouter or RootLayout.
 *
 * @seo-exempt
 */
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Briefcase, CheckSquare, StickyNote, Clock, TrendingUp, Users, Wrench,
  Plus, Loader2, Calculator, Ruler, ChevronDown,
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

// ── Tools dropdown ────────────────────────────────────────────────────────────

const TOOLS = [
  { label: 'Builders Calculator', icon: Calculator, href: '/builders-calc' },
  { label: 'Takeoff Pad',         icon: Ruler,      href: '/takeoff-pad'   },
] as const;

function ToolsDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0 self-end">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Tools menu"
        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors min-h-[44px] ${
          open
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
        }`}
      >
        <Wrench size={13} />
        Tools
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-xl shadow-lg overflow-hidden min-w-[200px]"
          style={{ maxWidth: 'calc(100vw - 1rem)' }}
        >
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.href}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate(tool.href);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left min-h-[44px]"
              >
                <Icon size={15} className="text-muted-foreground shrink-0" />
                {tool.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isViewOnly } = usePermissions();

  const rawTab = searchParams.get('workTab') ?? 'tasks';
  const activeTab: WorkTab = VALID_TABS.has(rawTab) ? (rawTab as WorkTab) : 'tasks';

  // Job integration — pre-filter from URL
  const rawJobId = searchParams.get('jobId');
  const jobId = rawJobId ? parseInt(rawJobId, 10) : null;
  const jobName = searchParams.get('jobName') ?? null;

  const [newJobOpen, setNewJobOpen] = useState(false);

  function switchTab(tab: WorkTab) {
    const next = new URLSearchParams(searchParams);
    next.set('workTab', tab);
    // Preserve jobId/jobName when switching tabs
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>Work — IWILLBUILD</title>
        <meta name="description" content="Company-wide work register: tasks, notes, delays, progress, attendance." />
        <link rel="canonical" href="https://iwillbuild.com/work" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col min-w-0 lg-portal overflow-hidden">

        {/* ── Header ── */}
        <header className="shrink-0 border-b border-border bg-background">
          {/* Top row: title + New Job */}
          <div className="flex items-center justify-between px-4 md:px-6 py-3 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase size={16} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-foreground leading-tight">Work</h1>
                <p className="text-[11px] text-muted-foreground leading-tight hidden sm:block">
                  Company-wide register
                </p>
              </div>
            </div>

            {/* Sidebar owns + New Job on desktop (lg+); show here only on mobile/tablet */}
            {!isViewOnly && (
              <button
                onClick={() => setNewJobOpen(true)}
                className="lg:hidden flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">New Job</span>
                <span className="sm:hidden">Job</span>
              </button>
            )}
          </div>

          {/* Tab nav */}
          <nav
            className="flex overflow-x-auto scrollbar-none border-t border-border px-2 md:px-4"
            aria-label="Work sections"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 min-h-[44px] ${
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
            {/* Tools dropdown — not a tab, opens popover with tool links */}
            <ToolsDropdown />
          </nav>
        </header>

        {/* ── Tab content ── */}
        <main className="flex-1 overflow-hidden">
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'tasks' && (
              <WorkTasksTab
                initialJobId={jobId}
                initialJobName={jobName}
              />
            )}
            {activeTab === 'notes' && (
              <WorkNotesTab
                initialJobId={jobId}
                initialJobName={jobName}
              />
            )}
            {activeTab === 'delays' && (
              <WorkDelaysTab
                initialJobId={jobId}
                initialJobName={jobName}
              />
            )}
            {activeTab === 'progress' && (
              <WorkProgressTab
                initialJobId={jobId}
                initialJobName={jobName}
              />
            )}
            {activeTab === 'attendance' && (
              <WorkAttendanceTab
                initialJobId={jobId}
                initialJobName={jobName}
              />
            )}
          </Suspense>
        </main>
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
