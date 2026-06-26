import { useState, useEffect, useRef, useMemo } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  CalendarDays,
  List,
  BarChart2,
  Search,
  ChevronRight,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  User,
  MapPin,
  Calendar,
  ChevronLeft,
  AlertTriangle,
  Menu,
} from 'lucide-react';
import PortalSidebar, { MobileMenuButton } from '@/components/PortalSidebar';
import { getStatusStyle, JOB_STATUSES } from '@/lib/jobs-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchedulerJob {
  id: number;
  jobNumber: string | null;
  name: string;
  client: string | null;
  address: string | null;
  status: string;
  progress: number;
  startDate: string | null;
  finishDate: string | null;
  supervisorUserId: string | null;
  supervisorName: string | null;
  crewName: string | null;
  createdAt: string;
}

type ViewMode = 'table' | 'timeline';
type DateRange = 'week' | 'month' | 'next30' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function isInRange(job: SchedulerJob, range: DateRange): boolean {
  if (range === 'all') return true;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = job.startDate ? new Date(job.startDate) : null;
  const finish = job.finishDate ? new Date(job.finishDate) : null;

  if (range === 'week') {
    const end = new Date(now); end.setDate(end.getDate() + 7);
    return !!(start && start <= end && (!finish || finish >= now));
  }
  if (range === 'month') {
    const end = new Date(now); end.setDate(end.getDate() + 30);
    return !!(start && start <= end && (!finish || finish >= now));
  }
  if (range === 'next30') {
    const end = new Date(now); end.setDate(end.getDate() + 30);
    return !!(start && start >= now && start <= end);
  }
  return true;
}

// Status bar colours for Gantt
const STATUS_BAR: Record<string, string> = {
  'New':                    'bg-slate-400',
  'Quoting':                'bg-amber-400',
  'Submitted':              'bg-blue-400',
  'Awaiting Approval':      'bg-purple-400',
  'Works Approved':         'bg-teal-400',
  'Ready to Start':         'bg-cyan-400',
  'Works in Progress':      'bg-emerald-500',
  'On Hold':                'bg-orange-400',
  'Completed':              'bg-green-500',
  'Rectification Required': 'bg-red-500',
  'Closed':                 'bg-gray-400',
};

function barColor(status: string) {
  return STATUS_BAR[status] ?? 'bg-slate-400';
}

// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({ jobs }: { jobs: SchedulerJob[] }) {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <CalendarDays size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No scheduled jobs match your filters.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['Job', 'Client', 'Location', 'Status', 'Start', 'Finish', 'Duration', 'Supervisor / Crew', 'Progress', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map(job => {
              const style = getStatusStyle(job.status);
              const duration = job.startDate && job.finishDate
                ? `${daysBetween(job.startDate, job.finishDate)}d`
                : '—';
              const supervisor = job.supervisorName ?? job.crewName ?? '—';
              return (
                <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800 truncate max-w-[160px]">{job.name}</div>
                    {job.jobNumber && <div className="text-xs text-slate-400">#{job.jobNumber}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 truncate max-w-[120px]">{job.client ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 truncate max-w-[120px]">{job.address ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(job.startDate)}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(job.finishDate)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{duration}</td>
                  <td className="px-4 py-3 text-slate-600 truncate max-w-[120px]">{supervisor}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden w-16">
                        <div
                          className="h-full bg-orange-500 rounded-full"
                          style={{ width: `${job.progress ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{job.progress ?? 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/jobs/${job.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 whitespace-nowrap"
                    >
                      Open <ExternalLink size={11} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-slate-100">
        {jobs.map(job => {
          const style = getStatusStyle(job.status);
          return (
            <div key={job.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{job.name}</p>
                  {job.jobNumber && <p className="text-xs text-slate-400">#{job.jobNumber}</p>}
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${style.bg} ${style.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {job.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-slate-500">
                {job.client && <span className="flex items-center gap-1"><User size={10} />{job.client}</span>}
                {job.address && <span className="flex items-center gap-1"><MapPin size={10} />{job.address}</span>}
                <span className="flex items-center gap-1"><Calendar size={10} />{fmt(job.startDate)}</span>
                <span className="flex items-center gap-1"><Clock size={10} />{fmt(job.finishDate)}</span>
              </div>
              {/* Progress */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${job.progress ?? 0}%` }} />
                </div>
                <span className="text-xs text-slate-500">{job.progress ?? 0}%</span>
              </div>
              <Link
                to={`/jobs/${job.id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                Open Job <ChevronRight size={12} />
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Timeline / Gantt View ────────────────────────────────────────────────────

function TimelineView({ jobs }: { jobs: SchedulerJob[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const DAY_WIDTH = 36; // px per day

  // Compute visible date range from jobs
  const { rangeStart, totalDays } = useMemo(() => {
    const dates = jobs.flatMap(j => [j.startDate, j.finishDate]).filter(Boolean) as string[];
    if (dates.length === 0) {
      const today = new Date();
      return { rangeStart: today, totalDays: 30 };
    }
    const min = new Date(dates.reduce((a, b) => a < b ? a : b));
    const max = new Date(dates.reduce((a, b) => a > b ? a : b));
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 4);
    const days = Math.max(30, Math.round((max.getTime() - min.getTime()) / 86400000) + 1);
    return { rangeStart: min, totalDays: days };
  }, [jobs]);

  // Build header days
  const headerDays = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [rangeStart, totalDays]);

  // Today marker offset
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = Math.round((today.getTime() - rangeStart.getTime()) / 86400000);

  function barProps(job: SchedulerJob) {
    if (!job.startDate || !job.finishDate) return null;
    const start = new Date(job.startDate);
    const finish = new Date(job.finishDate);
    const left = Math.round((start.getTime() - rangeStart.getTime()) / 86400000);
    const width = Math.max(1, Math.round((finish.getTime() - start.getTime()) / 86400000) + 1);
    return { left: left * DAY_WIDTH, width: width * DAY_WIDTH };
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No scheduled jobs to display on the timeline.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" ref={scrollRef}>
      <div style={{ minWidth: totalDays * DAY_WIDTH + 200 }}>
        {/* Header row */}
        <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
          {/* Job label column */}
          <div className="w-48 shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-r border-slate-200">
            Job
          </div>
          {/* Day headers */}
          <div className="flex">
            {headerDays.map((d, i) => {
              const isToday = d.toDateString() === new Date().toDateString();
              const isMonthStart = d.getDate() === 1;
              return (
                <div
                  key={i}
                  style={{ width: DAY_WIDTH }}
                  className={`shrink-0 text-center border-r border-slate-100 py-1 ${isToday ? 'bg-orange-50' : ''}`}
                >
                  {(i === 0 || isMonthStart) && (
                    <div className="text-[9px] font-bold text-slate-500 uppercase leading-none mb-0.5">
                      {d.toLocaleDateString('en-AU', { month: 'short' })}
                    </div>
                  )}
                  <div className={`text-[10px] font-medium ${isToday ? 'text-orange-600 font-bold' : 'text-slate-400'}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Job rows */}
        {jobs.map(job => {
          const bar = barProps(job);
          return (
            <div key={job.id} className="flex border-b border-slate-100 hover:bg-slate-50 transition-colors" style={{ height: 44 }}>
              {/* Label */}
              <div className="w-48 shrink-0 px-3 flex items-center border-r border-slate-200 overflow-hidden">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{job.name}</p>
                  {job.jobNumber && <p className="text-[10px] text-slate-400">#{job.jobNumber}</p>}
                </div>
              </div>

              {/* Bar area */}
              <div className="relative flex-1" style={{ width: totalDays * DAY_WIDTH }}>
                {/* Today line */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-orange-400 z-10 opacity-60"
                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                  />
                )}

                {/* Gantt bar */}
                {bar && (
                  <Link
                    to={`/jobs/${job.id}`}
                    title={`${job.name} — ${fmt(job.startDate)} → ${fmt(job.finishDate)}`}
                    className={`absolute top-2.5 h-5 rounded-md flex items-center px-2 text-white text-[10px] font-semibold truncate shadow-sm hover:brightness-110 transition-all ${barColor(job.status)}`}
                    style={{ left: bar.left, width: bar.width }}
                  >
                    {bar.width > 60 ? job.name : ''}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Unscheduled section ──────────────────────────────────────────────────────

function UnscheduledSection({ jobs }: { jobs: SchedulerJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={15} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700">Unscheduled Jobs ({jobs.length})</h3>
        <span className="text-xs text-slate-400">— no start or finish date set</span>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
        <div className="divide-y divide-amber-100">
          {jobs.map(job => {
            const style = getStatusStyle(job.status);
            return (
              <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{job.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {job.jobNumber && <span className="text-xs text-slate-400">#{job.jobNumber}</span>}
                    {job.client && <span className="text-xs text-slate-500">{job.client}</span>}
                    {job.address && <span className="text-xs text-slate-400 truncate">{job.address}</span>}
                  </div>
                </div>
                <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${style.bg} ${style.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {job.status}
                </span>
                <Link
                  to={`/jobs/${job.id}`}
                  className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 shrink-0"
                >
                  Open Job <ChevronRight size={12} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [supervisorFilter, setSupervisorFilter] = useState('All');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  useEffect(() => {
    fetch('/api/scheduler/jobs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Failed'))
      .then(data => setJobs(data.jobs ?? []))
      .catch(() => setError('Failed to load scheduler data. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  // Supervisors list for filter
  const supervisors = useMemo(() => {
    const names = jobs
      .map(j => j.supervisorName ?? j.crewName)
      .filter((n): n is string => !!n);
    return ['All', ...Array.from(new Set(names))];
  }, [jobs]);

  // Split scheduled vs unscheduled
  const scheduled = jobs.filter(j => j.startDate && j.finishDate);
  const unscheduled = jobs.filter(j => !j.startDate || !j.finishDate);

  // Apply filters to scheduled jobs
  const filtered = scheduled.filter(job => {
    if (statusFilter !== 'All' && job.status !== statusFilter) return false;
    if (supervisorFilter !== 'All') {
      const sup = job.supervisorName ?? job.crewName ?? '';
      if (sup !== supervisorFilter) return false;
    }
    if (!isInRange(job, dateRange)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        job.name.toLowerCase().includes(q) ||
        (job.client ?? '').toLowerCase().includes(q) ||
        (job.address ?? '').toLowerCase().includes(q) ||
        (job.jobNumber ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Helmet>
        <title>Scheduler — IWILLBUILD</title>
        <meta name="description" content="View and manage job schedules, timelines and upcoming work." />
        <link rel="canonical" href="https://iwillbuild.com/scheduler" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4 shrink-0">
          <div className="md:hidden">
            <MobileMenuButton onClick={() => window.dispatchEvent(new CustomEvent('portal:open-menu'))} />
          </div>
          <CalendarDays size={18} className="text-orange-500 shrink-0" />
          <h1 className="text-base font-bold text-slate-800">Scheduler</h1>
          <div className="ml-auto flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setView('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <List size={13} /> Table
              </button>
              <button
                onClick={() => setView('timeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  view === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <BarChart2 size={13} /> Timeline
              </button>
            </div>
          </div>
        </div>

        {/* Filters bar */}
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-2 shrink-0">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 w-44"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
          >
            <option value="All">All statuses</option>
            {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Supervisor */}
          {supervisors.length > 1 && (
            <select
              value={supervisorFilter}
              onChange={e => setSupervisorFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            >
              {supervisors.map(s => <option key={s} value={s}>{s === 'All' ? 'All supervisors' : s}</option>)}
            </select>
          )}

          {/* Date range */}
          <div className="flex items-center gap-1">
            {([
              { id: 'week',   label: 'This week' },
              { id: 'month',  label: 'This month' },
              { id: 'next30', label: 'Next 30 days' },
              { id: 'all',    label: 'All' },
            ] as { id: DateRange; label: string }[]).map(opt => (
              <button
                key={opt.id}
                onClick={() => setDateRange(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  dateRange === opt.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Counts */}
          <div className="ml-auto text-xs text-slate-400">
            {filtered.length} scheduled · {unscheduled.length} unscheduled
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-orange-500" size={28} />
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {!loading && !error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Scheduled jobs */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {view === 'table'
                  ? <TableView jobs={filtered} />
                  : <TimelineView jobs={filtered} />
                }
              </div>

              {/* Unscheduled jobs */}
              <UnscheduledSection jobs={unscheduled} />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
