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
  ChevronLeft,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  User,
  MapPin,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import PortalSidebar, { MobileMenuButton } from '@/components/PortalSidebar';
import { getStatusStyle, JOB_STATUSES } from '@/lib/jobs-api';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A job as returned by GET /api/scheduler/jobs.
 * The scheduler reads ONLY these job-record fields — no estimates, no derived dates.
 */
interface SchedulerJob {
  id: number;
  jobNumber: string | null;
  name: string;
  client: string | null;
  address: string | null;
  status: string;
  progress: number;
  scheduledStartDate: string | null;
  expectedCompletionDate: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  supervisorUserId: string | null;
  supervisorName: string | null;
  teamLabel: string | null;
  createdAt: string | null;
}

type ViewMode    = 'table' | 'timeline';
type TimeWindow  = 'day' | 'week' | 'month' | '3months';

// ─── Window config ────────────────────────────────────────────────────────────

const WINDOW_CONFIG: Record<TimeWindow, { label: string; days: number; dayWidth: number }> = {
  day:      { label: 'Day',      days: 1,   dayWidth: 80  },
  week:     { label: 'Week',     days: 7,   dayWidth: 60  },
  month:    { label: 'Month',    days: 30,  dayWidth: 36  },
  '3months':{ label: '3 Months', days: 91,  dayWidth: 18  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** A job is "scheduled" when it has both scheduledStartDate AND expectedCompletionDate. */
function isScheduled(job: SchedulerJob): boolean {
  return !!(job.scheduledStartDate && job.expectedCompletionDate);
}

/**
 * Returns true if the job overlaps the given window [windowStart, windowEnd].
 * A job overlaps if its bar starts before the window ends AND finishes after the window starts.
 */
function overlapsWindow(job: SchedulerJob, windowStart: Date, windowEnd: Date): boolean {
  if (!job.scheduledStartDate || !job.expectedCompletionDate) return false;
  const s = new Date(job.scheduledStartDate);
  const e = new Date(job.expectedCompletionDate);
  return s <= windowEnd && e >= windowStart;
}

// ─── Status bar colours for Gantt ─────────────────────────────────────────────

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
              {['Job', 'Client', 'Location', 'Status', 'Sched. Start', 'Exp. Completion', 'Duration', 'Supervisor / Team', 'Progress', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map(job => {
              const style    = getStatusStyle(job.status);
              const duration = job.scheduledStartDate && job.expectedCompletionDate
                ? `${daysBetween(job.scheduledStartDate, job.expectedCompletionDate)}d`
                : '—';
              const supervisor = job.supervisorName ?? job.teamLabel ?? '—';
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
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(job.scheduledStartDate)}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(job.expectedCompletionDate)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{duration}</td>
                  <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">{supervisor}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden w-16">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${job.progress}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{job.progress}%</span>
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
                {job.client  && <span className="flex items-center gap-1"><User   size={10} />{job.client}</span>}
                {job.address && <span className="flex items-center gap-1"><MapPin size={10} />{job.address}</span>}
                <span className="flex items-center gap-1"><Calendar size={10} />{fmt(job.scheduledStartDate)}</span>
                <span className="flex items-center gap-1"><Clock    size={10} />{fmt(job.expectedCompletionDate)}</span>
                {(job.supervisorName ?? job.teamLabel) && (
                  <span className="flex items-center gap-1 col-span-2">
                    <User size={10} />{job.supervisorName ?? job.teamLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${job.progress}%` }} />
                </div>
                <span className="text-xs text-slate-500">{job.progress}%</span>
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

interface TimelineViewProps {
  jobs: SchedulerJob[];
  window: TimeWindow;
  anchorDate: Date;
}

function TimelineView({ jobs, window: timeWindow, anchorDate }: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cfg = WINDOW_CONFIG[timeWindow];
  const DAY_WIDTH = cfg.dayWidth;
  const totalDays = cfg.days;

  // Window bounds — anchor is the first visible day
  const windowStart = useMemo(() => {
    const d = new Date(anchorDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchorDate]);

  const windowEnd = useMemo(() => {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + totalDays - 1);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [windowStart, totalDays]);

  // Header days
  const headerDays = useMemo(() =>
    Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
  [windowStart, totalDays]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayOffset = Math.round((today.getTime() - windowStart.getTime()) / 86400000);

  // Jobs visible in this window
  const visibleJobs = jobs.filter(j => overlapsWindow(j, windowStart, windowEnd));

  function barProps(job: SchedulerJob) {
    if (!job.scheduledStartDate || !job.expectedCompletionDate) return null;
    const jobStart  = new Date(job.scheduledStartDate);
    const jobFinish = new Date(job.expectedCompletionDate);

    // Clamp to window bounds for display
    const clampedStart  = jobStart  < windowStart ? windowStart : jobStart;
    const clampedFinish = jobFinish > windowEnd   ? windowEnd   : jobFinish;

    const leftDays  = Math.round((clampedStart.getTime()  - windowStart.getTime()) / 86400000);
    const widthDays = Math.max(1, Math.round((clampedFinish.getTime() - clampedStart.getTime()) / 86400000) + 1);

    // Whether the bar is clipped on either side (job extends beyond window)
    const clippedLeft  = jobStart  < windowStart;
    const clippedRight = jobFinish > windowEnd;

    return {
      left: leftDays * DAY_WIDTH,
      width: widthDays * DAY_WIDTH,
      clippedLeft,
      clippedRight,
    };
  }

  // Month boundary markers for the header
  function shouldShowMonth(d: Date, i: number): boolean {
    return i === 0 || d.getDate() === 1;
  }

  // Day label — show every day for Day/Week, every 2nd for Month, every 7th for 3 Months
  function showDayLabel(i: number): boolean {
    if (timeWindow === 'day')      return true;
    if (timeWindow === 'week')     return true;
    if (timeWindow === 'month')    return i % 2 === 0;
    return i % 7 === 0;
  }

  if (visibleJobs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No jobs scheduled in this window.</p>
        <p className="text-xs mt-1">Navigate to a different period or check the unscheduled section below.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" ref={scrollRef}>
      <div style={{ minWidth: totalDays * DAY_WIDTH + 200 }}>

        {/* Two-row header: month labels + day numbers */}
        <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
          {/* Job label column */}
          <div className="w-48 shrink-0 border-r border-slate-200" style={{ minHeight: 48 }}>
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Job</div>
          </div>

          {/* Day columns */}
          <div className="flex flex-col flex-1">
            {/* Month row */}
            <div className="flex border-b border-slate-100">
              {headerDays.map((d, i) => {
                if (!shouldShowMonth(d, i)) {
                  return <div key={i} style={{ width: DAY_WIDTH }} className="shrink-0" />;
                }
                // Count how many days until next month boundary (or end)
                let span = 1;
                for (let j = i + 1; j < headerDays.length; j++) {
                  if (headerDays[j].getDate() === 1) break;
                  span++;
                }
                return (
                  <div
                    key={i}
                    style={{ width: span * DAY_WIDTH }}
                    className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide border-r border-slate-200 bg-slate-50"
                  >
                    {d.toLocaleDateString('en-AU', { month: 'short', year: timeWindow === '3months' ? '2-digit' : undefined })}
                  </div>
                );
              })}
            </div>

            {/* Day number row */}
            <div className="flex">
              {headerDays.map((d, i) => {
                const isToday     = d.toDateString() === new Date().toDateString();
                const isWeekend   = d.getDay() === 0 || d.getDay() === 6;
                const isMonthEdge = d.getDate() === 1;
                return (
                  <div
                    key={i}
                    style={{ width: DAY_WIDTH }}
                    className={`shrink-0 text-center py-0.5 border-r ${
                      isMonthEdge ? 'border-slate-300' : 'border-slate-100'
                    } ${isToday ? 'bg-orange-50' : isWeekend ? 'bg-slate-50/60' : ''}`}
                  >
                    {showDayLabel(i) && (
                      <span className={`text-[10px] font-medium ${
                        isToday ? 'text-orange-600 font-bold' : isWeekend ? 'text-slate-400' : 'text-slate-400'
                      }`}>
                        {d.getDate()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Job rows */}
        {visibleJobs.map(job => {
          const bar = barProps(job);
          return (
            <div
              key={job.id}
              className="flex border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
              style={{ height: 44 }}
            >
              {/* Job name column */}
              <div className="w-48 shrink-0 px-3 flex items-center border-r border-slate-200 overflow-hidden">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{job.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {job.supervisorName ?? job.teamLabel ?? (job.jobNumber ? `#${job.jobNumber}` : '')}
                  </p>
                </div>
              </div>

              {/* Bar area */}
              <div className="relative" style={{ width: totalDays * DAY_WIDTH }}>
                {/* Weekend shading */}
                {headerDays.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return isWeekend ? (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 bg-slate-50/80"
                      style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                    />
                  ) : null;
                })}

                {/* Today line */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-orange-400 z-10 opacity-70"
                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                  />
                )}

                {/* Gantt bar */}
                {bar && (
                  <Link
                    to={`/jobs/${job.id}`}
                    title={`${job.name}\n${fmt(job.scheduledStartDate)} → ${fmt(job.expectedCompletionDate)}\n${job.supervisorName ?? job.teamLabel ?? ''}`}
                    className={`absolute top-2.5 h-[18px] flex items-center text-white text-[10px] font-semibold truncate shadow-sm hover:brightness-110 transition-all ${barColor(job.status)} ${
                      bar.clippedLeft  ? 'rounded-r-md' : ''
                    } ${
                      bar.clippedRight ? 'rounded-l-md' : ''
                    } ${
                      !bar.clippedLeft && !bar.clippedRight ? 'rounded-md' : ''
                    }`}
                    style={{ left: bar.left, width: bar.width }}
                  >
                    {/* Clip indicators */}
                    {bar.clippedLeft && (
                      <span className="shrink-0 pl-0.5 opacity-70">◀</span>
                    )}
                    <span className="px-1.5 truncate">
                      {bar.width > 50 ? job.name : ''}
                    </span>
                    {bar.clippedRight && (
                      <span className="shrink-0 pr-0.5 ml-auto opacity-70">▶</span>
                    )}
                  </Link>
                )}
              </div>
            </div>
          );
        })}

        {/* Legend row at bottom */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex-wrap">
          {Object.entries(STATUS_BAR).map(([status, cls]) => (
            <span key={status} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
              {status}
            </span>
          ))}
        </div>
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
        <span className="text-xs text-slate-400 hidden sm:inline">— open the job and set Scheduled Start + Expected Completion</span>
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
                    {job.client    && <span className="text-xs text-slate-500">{job.client}</span>}
                    {job.address   && <span className="text-xs text-slate-400 truncate">{job.address}</span>}
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
  const [jobs, setJobs]                         = useState<SchedulerJob[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState('');
  const [view, setView]                         = useState<ViewMode>('table');
  const [timeWindow, setTimeWindow]             = useState<TimeWindow>('month');
  const [anchorDate, setAnchorDate]             = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [search, setSearch]                     = useState('');
  const [statusFilter, setStatusFilter]         = useState('All');
  const [supervisorFilter, setSupervisorFilter] = useState('All');

  useEffect(() => {
    fetch('/api/scheduler/jobs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Failed'))
      .then(data => setJobs(data.jobs ?? []))
      .catch(() => setError('Failed to load scheduler data. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  // Supervisor filter options — built from actual job data
  const supervisors = useMemo(() => {
    const names = jobs
      .map(j => j.supervisorName ?? j.teamLabel)
      .filter((n): n is string => !!n);
    return ['All', ...Array.from(new Set(names)).sort()];
  }, [jobs]);

  // Split: scheduled = both dates set; unscheduled = either missing
  const scheduled   = jobs.filter(isScheduled);
  const unscheduled = jobs.filter(j => !isScheduled(j));

  // Apply search + status + supervisor filters to scheduled jobs
  const filtered = scheduled.filter(job => {
    if (statusFilter !== 'All' && job.status !== statusFilter) return false;
    if (supervisorFilter !== 'All') {
      const sup = job.supervisorName ?? job.teamLabel ?? '';
      if (sup !== supervisorFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        job.name.toLowerCase().includes(q) ||
        (job.client    ?? '').toLowerCase().includes(q) ||
        (job.address   ?? '').toLowerCase().includes(q) ||
        (job.jobNumber ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Navigation: move anchor by one window period
  function navigate(direction: -1 | 1) {
    const cfg = WINDOW_CONFIG[timeWindow];
    setAnchorDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + direction * cfg.days);
      return d;
    });
  }

  function goToToday() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    setAnchorDate(d);
  }

  // Window label for the nav bar
  const windowLabel = useMemo(() => {
    const cfg = WINDOW_CONFIG[timeWindow];
    const end = new Date(anchorDate);
    end.setDate(end.getDate() + cfg.days - 1);

    if (timeWindow === 'day') {
      return anchorDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (timeWindow === 'week') {
      return `${fmtShort(anchorDate.toISOString())} – ${fmtShort(end.toISOString())}`;
    }
    if (timeWindow === 'month') {
      return anchorDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    }
    // 3 months
    const startLabel = anchorDate.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    const endLabel   = end.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
  }, [anchorDate, timeWindow]);

  // Count jobs visible in the current timeline window (for the counter)
  const windowStart = useMemo(() => { const d = new Date(anchorDate); d.setHours(0,0,0,0); return d; }, [anchorDate]);
  const windowEnd   = useMemo(() => {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + WINDOW_CONFIG[timeWindow].days - 1);
    d.setHours(23,59,59,999);
    return d;
  }, [windowStart, timeWindow]);

  const visibleCount = view === 'timeline'
    ? filtered.filter(j => overlapsWindow(j, windowStart, windowEnd)).length
    : filtered.length;

  return (
    <div className="portal-page">
      <Helmet>
        <title>Scheduler — IWILLBUILD</title>
        <meta name="description" content="View and manage job schedules, timelines and upcoming work." />
        <link rel="canonical" href="https://iwillbuild.com/scheduler" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top bar ── */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4 shrink-0">
          <div className="md:hidden">
            <MobileMenuButton onClick={() => window.dispatchEvent(new CustomEvent('portal:open-menu'))} />
          </div>
          <CalendarDays size={18} className="text-orange-500 shrink-0" />
          <h1 className="text-base font-bold text-slate-800">Scheduler</h1>

          <div className="ml-auto flex items-center gap-2">
            {/* View toggle: Table / Timeline */}
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

        {/* ── Filters + period nav bar ── */}
        <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-2 shrink-0">

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 w-40"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
          >
            <option value="All">All statuses</option>
            {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Supervisor filter */}
          {supervisors.length > 1 && (
            <select
              value={supervisorFilter}
              onChange={e => setSupervisorFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            >
              {supervisors.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All supervisors' : s}</option>
              ))}
            </select>
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Time window selector: Day / Week / Month / 3 Months */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {(Object.entries(WINDOW_CONFIG) as [TimeWindow, typeof WINDOW_CONFIG[TimeWindow]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => { setTimeWindow(key); goToToday(); }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  timeWindow === key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Period navigation: prev / label / today / next */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              title="Previous period"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-medium text-slate-700 min-w-[120px] text-center px-1">
              {windowLabel}
            </span>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              title="Next period"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={goToToday}
              className="px-2 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50 rounded-md transition-colors border border-orange-200 ml-1"
            >
              Today
            </button>
          </div>

          {/* Counts */}
          <div className="ml-auto text-xs text-slate-400 hidden sm:block">
            {visibleCount} scheduled · {unscheduled.length} unscheduled
          </div>
        </div>

        {/* ── Main content ── */}
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
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {view === 'table' ? (
                  <TableView jobs={filtered} />
                ) : (
                  <TimelineView
                    jobs={filtered}
                    window={timeWindow}
                    anchorDate={anchorDate}
                  />
                )}
              </div>
              <UnscheduledSection jobs={unscheduled} />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
