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
import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Briefcase, CheckSquare, StickyNote, Clock, TrendingUp, Users, Wrench,
  Plus, Loader2,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import DesktopDock from '@/components/DesktopDock';
import NewJobModal from '@/components/NewJobModal';
import { usePermissions } from '@/lib/usePermissions';

// Lazy-load each tab to keep initial bundle small
const WorkTasksTab = lazy(() => import('@/components/work/WorkTasksTab'));
const WorkNotesTab = lazy(() => import('@/components/work/WorkNotesTab'));
const WorkDelaysTab = lazy(() => import('@/components/work/WorkDelaysTab'));
const WorkProgressTab = lazy(() => import('@/components/work/WorkProgressTab'));
const WorkAttendanceTab = lazy(() => import('@/components/work/WorkAttendanceTab'));
const WorkToolsTab = lazy(() => import('@/components/work/WorkToolsTab'));

// ── Tab config ────────────────────────────────────────────────────────────────

type WorkTab = 'tasks' | 'notes' | 'delays' | 'progress' | 'attendance' | 'tools';

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
  { id: 'tools',      label: 'Tools',      icon: Wrench      },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

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

  const activeTabDef = TABS.find((t) => t.id === activeTab)!;
  const ActiveIcon = activeTabDef.icon;

  return (
    <div className="portal-page">
      <Helmet>
        <title>Work — IWILLBUILD</title>
        <meta name="description" content="Company-wide work register: tasks, notes, delays, progress, attendance." />
        <link rel="canonical" href="https://iwillbuild.com/work" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />
      <DesktopDock />

      <div className="portal-content flex flex-col h-[100dvh] overflow-hidden bg-background">

        {/* ── Header ── */}
        <header className="shrink-0 bg-background">
          {/* Title row — matches op-page-header height/padding */}
          <div className="op-page-header">
            <Briefcase size={14} className="text-primary shrink-0" />
            <h1 className="op-page-title flex-1 min-w-0">Work</h1>
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
            className="flex overflow-x-auto scrollbar-none border-b border-border"
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
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
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
            {activeTab === 'tools' && <WorkToolsTab />}
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
