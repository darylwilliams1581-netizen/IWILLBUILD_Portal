import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  HardHat,
  Bell,
  ChevronRight,
  Plus,
  AlertTriangle,
  Calendar,
  Wrench,
  CheckSquare,
  Clock,
  XCircle,
  BarChart3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PortalSidebar from '@/components/PortalSidebar';
import { useSession } from '@/lib/auth/auth-client';
import { fetchJobs, type Job } from '@/lib/jobs-api';
import { fetchFleetFlags, type FleetFlags } from '@/lib/fleet-api';
import DashboardBanner from '@/components/dashboard/DashboardBanner';
import DashboardInstallCallout from '@/components/dashboard/DashboardInstallCallout';
import KpiWidgets from '@/components/dashboard/KpiWidgets';
import MyTasksPanel from '@/components/notes/MyTasksPanel';
import { useTerminology } from '@/lib/useTerminology';
import { usePermissions } from '@/lib/usePermissions';
import { AnimatePresence } from 'motion/react';
import StartDrivingModal, { type ActiveSession } from '@/components/fleet/StartDrivingModal';
import { useDriverSession } from '@/lib/useDriverSession';

// ─── Animation variants ───────────────────────────────────────────────────────
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;

interface DashTodo {
  id: number;
  jobId: number;
  title: string;
  dueDate: string | null;
  status: string;
  jobName: string;
  jobNumber: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useSession();
  const { workSingular, addWorkLabel } = useTerminology();
  const { role } = usePermissions();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [fleetFlags, setFleetFlags] = useState<FleetFlags | null>(null);
  const [dueTodayTodos, setDueTodayTodos] = useState<DashTodo[]>([]);
  const [overdueTodos, setOverdueTodos] = useState<DashTodo[]>([]);

  // Driver session
  const { refresh: refreshDriverSession } = useDriverSession();
  const [showStartDriving, setShowStartDriving] = useState(false);

  function handleSessionStarted(s: ActiveSession) {
    setShowStartDriving(false);
    void refreshDriverSession();
    void s;
  }

  // Usage warnings
  const [usageWarning, setUsageWarning] = useState<{ hasWarnings: boolean; hasBlocked: boolean; warnings: string[] } | null>(null);

  useEffect(() => {
    fetchJobs()
      .then((data) => { setJobs(data); setJobsLoaded(true); })
      .catch(() => setJobsLoaded(true));
    fetchFleetFlags()
      .then((flags) => setFleetFlags(flags))
      .catch(() => {});
    fetch('/api/dashboard/todos')
      .then((r) => r.json())
      .then((d) => { setDueTodayTodos(d.dueToday ?? []); setOverdueTodos(d.overdue ?? []); })
      .catch(() => {});
    fetch('/api/usage', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const unlimitedPlans = ['owner', 'enterprise', 'developer'];
        if (d && (d.hasWarnings || d.hasBlocked) && !unlimitedPlans.includes(d.plan)) {
          const warnings: string[] = d.warnings ?? [];
          const onlyUsersLimit = warnings.length > 0 && warnings.every((w: string) => /user/i.test(w));
          if (!onlyUsersLimit) {
            setUsageWarning({ hasWarnings: d.hasWarnings, hasBlocked: d.hasBlocked, warnings });
          }
        }
      })
      .catch(() => {});
  }, []);

  const recentJobs = jobs.slice(0, 8);

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="portal-page">
      <Helmet>
        <title>Dashboard — IWILLBUILD Portal</title>
        <meta name="description" content="IWILLBUILD internal dashboard — overview of active jobs, crew, fleet, and quick access to all portal modules." />
        <link rel="canonical" href="https://iwillbuild.com/dashboard" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Dashboard — IWILLBUILD Portal" />
        <meta property="og:description" content="IWILLBUILD internal dashboard — overview of active jobs, crew, fleet, and quick access to all portal modules." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/dashboard" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Dashboard — IWILLBUILD Portal" />
        <meta name="twitter:description" content="IWILLBUILD internal dashboard — overview of active jobs, crew, fleet, and quick access to all portal modules." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <PortalSidebar />

      {/* ── Main content ── */}
      <div className="portal-main">

        {/* Top bar — desktop only */}
        <header className="hidden md:flex op-page-header shrink-0 print:hidden">
          <div className="flex items-center gap-2 shrink-0">
            <h1 className="op-page-title">Dashboard</h1>
            <span className="op-page-subtitle hidden sm:block text-gray-400 text-xs">— {today}</span>
          </div>

          {/* Banner strip */}
          <div className="hidden md:flex flex-1 min-w-0 items-center px-4">
            <DashboardBanner userId={user?.id ?? 'anon'} />
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Link
              to="/jobs"
              className="hidden sm:inline-flex items-center gap-1.5 bg-primary hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors duration-150 shrink-0"
            >
              <Plus size={12} />
              New {workSingular}
            </Link>
            <button className="relative p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors duration-150">
              <Bell size={15} />
            </button>
          </div>
        </header>

        {/* Mobile top strip */}
        <div
          className="md:hidden bg-white border-b border-border shrink-0 print:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="h-12 flex items-center justify-between px-4">
            <h1 className="font-heading font-bold text-base text-foreground leading-tight">Dashboard</h1>
          </div>
        </div>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-2 md:p-3">

          {/* ── Usage warning banner ── */}
          {usageWarning && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 ${
                usageWarning.hasBlocked
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              {usageWarning.hasBlocked
                ? <XCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
                : <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${usageWarning.hasBlocked ? 'text-red-800' : 'text-amber-800'}`}>
                  {usageWarning.hasBlocked ? 'Plan limit reached' : 'Storage usage above 80%'}
                </p>
                <p className={`text-[11px] mt-0.5 ${usageWarning.hasBlocked ? 'text-red-700' : 'text-amber-700'}`}>
                  {usageWarning.warnings.join(' · ')}
                </p>
              </div>
              <Link
                to="/settings?tab=data"
                className={`shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                  usageWarning.hasBlocked
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                <BarChart3 size={10} />
                Usage
              </Link>
            </motion.div>
          )}

          {/* ── KPI Widgets ── */}
          <KpiWidgets />

          {/* ── PWA Install Callout ── */}
          <DashboardInstallCallout />

          {/* ── My Tasks ── */}
          <MyTasksPanel userRole={role ?? ''} />

          {/* ── Fleet Flags ── */}
          {fleetFlags && fleetFlags.totalFlags > 0 && (
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-2 mb-2"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <h2 className="font-heading font-bold text-xs text-amber-800">
                  Fleet — {fleetFlags.totalFlags} flag{fleetFlags.totalFlags !== 1 ? 's' : ''}
                </h2>
                <Link to="/fleet" className="ml-auto text-[11px] font-semibold text-amber-700 hover:underline flex items-center gap-0.5">
                  View <ChevronRight size={10} />
                </Link>
              </div>
              <div className="flex flex-col gap-1.5">
                {fleetFlags.attentionFlags.map((f) => (
                  <Link
                    key={`att-${f.assetId}`}
                    to={`/fleet/${f.assetId}`}
                    className="flex items-start gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2 hover:border-amber-400 transition-colors group"
                  >
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-800">{f.assetName} — Issue flagged in prestart</p>
                      {f.comment && <p className="text-[11px] text-amber-700 truncate">{f.comment}</p>}
                    </div>
                    <ChevronRight size={11} className="text-amber-400 group-hover:text-amber-600 shrink-0 mt-0.5" />
                  </Link>
                ))}
                {fleetFlags.dueDateFlags.map((f) => (
                  <Link
                    key={`due-${f.assetId}-${f.type}`}
                    to={`/fleet/${f.assetId}`}
                    className="flex items-start gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2 hover:border-amber-400 transition-colors group"
                  >
                    {f.type === 'service' ? (
                      <Wrench size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    ) : (
                      <Calendar size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-800">
                        {f.assetName} — {f.type === 'service' ? 'Service' : 'Rego'} due{' '}
                        {new Date(f.dueDate) < new Date() ? 'overdue' : `${new Date(f.dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    <ChevronRight size={11} className="text-amber-400 group-hover:text-amber-600 shrink-0 mt-0.5" />
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── To-do Alerts ── */}
          {(overdueTodos.length > 0 || dueTodayTodos.length > 0) && (
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="mb-2 flex flex-col gap-2"
            >
              {overdueTodos.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={13} className="text-red-600 shrink-0" />
                    <h2 className="font-heading font-bold text-xs text-red-800">
                      {overdueTodos.length} Overdue Task{overdueTodos.length !== 1 ? 's' : ''}
                    </h2>
                  </div>
                  {overdueTodos.map((t) => (
                    <Link
                      key={t.id}
                      to={`/jobs/${t.jobId}?tab=todos`}
                      className="flex items-start gap-2 bg-white border border-red-200 rounded-lg px-3 py-2 hover:border-red-400 transition-colors group"
                    >
                      <CheckSquare size={12} className="text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-red-800 truncate">{t.title}</p>
                        <p className="text-[11px] text-red-600 truncate">{t.jobName}{t.jobNumber ? ` · ${t.jobNumber}` : ''}</p>
                      </div>
                      <ChevronRight size={11} className="text-red-400 group-hover:text-red-600 shrink-0 mt-0.5" />
                    </Link>
                  ))}
                </div>
              )}
              {dueTodayTodos.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Clock size={13} className="text-amber-600 shrink-0" />
                    <h2 className="font-heading font-bold text-xs text-amber-800">
                      {dueTodayTodos.length} Task{dueTodayTodos.length !== 1 ? 's' : ''} Due Today
                    </h2>
                  </div>
                  {dueTodayTodos.map((t) => (
                    <Link
                      key={t.id}
                      to={`/jobs/${t.jobId}?tab=todos`}
                      className="flex items-start gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2 hover:border-amber-400 transition-colors group"
                    >
                      <CheckSquare size={12} className="text-amber-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-amber-800 truncate">{t.title}</p>
                        <p className="text-[11px] text-amber-700 truncate">{t.jobName}{t.jobNumber ? ` · ${t.jobNumber}` : ''}</p>
                      </div>
                      <ChevronRight size={11} className="text-amber-400 group-hover:text-amber-600 shrink-0 mt-0.5" />
                    </Link>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Recent Jobs — full width ── */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="bg-white rounded-lg border border-border"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <h2 className="font-heading font-semibold text-xs text-foreground">Recent Jobs</h2>
              <Link to="/jobs" className="text-[11px] text-primary font-medium flex items-center gap-0.5 hover:underline">
                View all <ChevronRight size={11} />
              </Link>
            </div>
            {!jobsLoaded ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-48 bg-slate-100 rounded animate-pulse" />
                      <div className="h-2.5 w-28 bg-slate-100 rounded animate-pulse" />
                    </div>
                    <div className="h-3 w-16 bg-slate-100 rounded animate-pulse shrink-0" />
                  </div>
                ))}
              </div>
            ) : recentJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
                  <HardHat size={18} className="text-primary" />
                </div>
                <p className="text-xs font-semibold text-foreground mb-1">No jobs yet</p>
                <p className="text-[11px] text-muted-foreground mb-4 max-w-xs">
                  Once you add jobs they'll appear here with status.
                </p>
                <Link
                  to="/jobs"
                  className="inline-flex items-center gap-1.5 bg-primary hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors duration-150"
                >
                  <Plus size={12} />
                  {addWorkLabel}
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentJobs.map((job) => (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{job.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {job.jobNumber && <span className="font-mono mr-1.5">{job.jobNumber}</span>}
                        {job.client ?? 'No client'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-[11px] font-medium text-muted-foreground hidden sm:block">{job.status}</span>
                      <ChevronRight size={13} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

        </main>
      </div>

      {/* Start Driving modal */}
      <AnimatePresence>
        {showStartDriving && (
          <StartDrivingModal
            onClose={() => setShowStartDriving(false)}
            onStarted={handleSessionStarted}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
