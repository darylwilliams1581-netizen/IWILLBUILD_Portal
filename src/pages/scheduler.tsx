import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams, useNavigate as useRRNavigate } from 'react-router-dom';
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
  Users,
  GripVertical,
  CheckCircle2,
  AlertTriangle,
  Truck,
  ArrowLeft,
  Home,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { getStatusStyle, JOB_STATUSES } from '@/lib/jobs-api';
import AssetSchedulerView from '@/components/scheduler/AssetSchedulerView';
import TasksSchedulerView from '@/components/scheduler/TasksSchedulerView';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  actualStartDate: string | null;
  actualCompletionDate: string | null;
  supervisorUserId: string | null;
  supervisorName: string | null;
  teamLabel: string | null;
  createdAt: string | null;
}

interface CrewMember {
  id: string;
  name: string;
  role: string;
  trade: string | null;
  jobs: SchedulerJob[];
}

type ViewMode   = 'table' | 'timeline' | 'calendar' | 'crew' | 'assets';
type TimeWindow = 'day' | 'week' | 'month' | '3months';

// ─── Window config ────────────────────────────────────────────────────────────

const WINDOW_LABELS: Record<TimeWindow, string> = {
  day:      'Day',
  week:     'Week',
  month:    'Month',
  '3months':'3 Months',
};

const DAY_WIDTH: Record<TimeWindow, number> = {
  day:      80,
  week:     60,
  month:    36,
  '3months':14,
};

function snapAnchor(tw: TimeWindow): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (tw === 'month' || tw === '3months') d.setDate(1);
  return d;
}

function windowEndDate(anchor: Date, tw: TimeWindow): Date {
  const d = new Date(anchor);
  if (tw === 'day') { d.setHours(23, 59, 59, 999); return d; }
  if (tw === 'week') { d.setDate(d.getDate() + 6); d.setHours(23, 59, 59, 999); return d; }
  if (tw === 'month') { d.setMonth(d.getMonth() + 1, 0); d.setHours(23, 59, 59, 999); return d; }
  d.setMonth(d.getMonth() + 3, 0); d.setHours(23, 59, 59, 999); return d;
}

function stepAnchor(anchor: Date, tw: TimeWindow, dir: -1 | 1): Date {
  const d = new Date(anchor);
  if (tw === 'day')   { d.setDate(d.getDate() + dir); return d; }
  if (tw === 'week')  { d.setDate(d.getDate() + dir * 7); return d; }
  if (tw === 'month') { d.setMonth(d.getMonth() + dir); return d; }
  d.setMonth(d.getMonth() + dir * 3); return d;
}

function windowDayCount(anchor: Date, tw: TimeWindow): number {
  const end = windowEndDate(anchor, tw);
  end.setHours(0, 0, 0, 0);
  const start = new Date(anchor); start.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmt(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format HH:MM or HH:MM:SS to 12-hour time, e.g. "8:00 am" */
function fmtTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h < 12 ? 'am' : 'pm';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${ampm}`;
}

function fmtShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function daysBetween(a: string, b: string): number {
  const ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function isScheduled(job: SchedulerJob): boolean {
  return !!(job.scheduledStartDate && job.expectedCompletionDate);
}

function overlapsWindow(job: SchedulerJob, windowStart: Date, windowEnd: Date): boolean {
  if (!job.scheduledStartDate || !job.expectedCompletionDate) return false;
  const s = parseLocalDate(job.scheduledStartDate);
  const e = parseLocalDate(job.expectedCompletionDate);
  return s <= windowEnd && e >= windowStart;
}

// ─── Status bar colours ───────────────────────────────────────────────────────

const STATUS_BAR: Record<string, string> = {
  'New':                    'bg-slate-400',
  'Quoting':                'bg-amber-400',
  'Submitted':              'bg-blue-400',
  'Awaiting Approval':      'bg-purple-400',
  'Works Approved':         'bg-teal-400',
  'Ready to Start':         'bg-cyan-400',
  'Works in Progress':      'bg-emerald-500',
  'On Hold':                'bg-violet-500',
  'Completed':              'bg-green-500',
  'Rectification Required': 'bg-red-500',
  'Closed':                 'bg-gray-400',
};

const STATUS_BAR_HEX: Record<string, string> = {
  'New':                    '#94a3b8',
  'Quoting':                '#fbbf24',
  'Submitted':              '#60a5fa',
  'Awaiting Approval':      '#c084fc',
  'Works Approved':         '#2dd4bf',
  'Ready to Start':         '#22d3ee',
  'Works in Progress':      '#10b981',
  'On Hold':                '#fb923c',
  'Completed':              '#22c55e',
  'Rectification Required': '#ef4444',
  'Closed':                 '#9ca3af',
};

function barColor(status: string) {
  return STATUS_BAR[status] ?? 'bg-slate-400';
}

function barHex(status: string) {
  return STATUS_BAR_HEX[status] ?? '#94a3b8';
}

// ─── Reschedule API call ──────────────────────────────────────────────────────

async function rescheduleJob(
  jobId: number,
  scheduledStartDate: string,
  expectedCompletionDate: string,
  scheduledStartTime?: string,
  scheduledEndTime?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/scheduler/jobs/${jobId}/reschedule`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduledStartDate,
        expectedCompletionDate,
        ...(scheduledStartTime !== undefined && { scheduledStartTime: scheduledStartTime || null }),
        ...(scheduledEndTime   !== undefined && { scheduledEndTime:   scheduledEndTime   || null }),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['Job', 'Client', 'Location', 'Status', 'Sched. Start', 'Exp. Completion', 'Duration', 'Supervisor / Team', 'Progress', ''].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
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
                  <td className="px-3 py-1.5">
                    <div className="font-semibold text-slate-800 truncate max-w-[160px] leading-snug">{job.name}</div>
                    {job.jobNumber && <div className="text-[11px] text-slate-400">#{job.jobNumber}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 truncate max-w-[120px] text-xs">{job.client ?? '—'}</td>
                  <td className="px-3 py-1.5 max-w-[140px]">
                    {job.address ? (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-violet-700 hover:text-violet-800 text-xs truncate"
                        title={job.address}
                      >
                        <MapPin size={10} className="shrink-0" />
                        <span className="truncate">{job.address}</span>
                      </a>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${style.bg} ${style.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {job.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap text-xs">
                    <div>{fmt(job.scheduledStartDate)}</div>
                    {job.scheduledStartTime && <div className="text-[11px] text-violet-700 font-medium">{fmtTime(job.scheduledStartTime)}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap text-xs">
                    <div>{fmt(job.expectedCompletionDate)}</div>
                    {job.scheduledEndTime && <div className="text-[11px] text-slate-400">{fmtTime(job.scheduledEndTime)}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap text-xs">{duration}</td>
                  <td className="px-3 py-1.5 text-slate-600 truncate max-w-[140px] text-xs">{supervisor}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden w-14">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${job.progress}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500 w-7 text-right">{job.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <Link to={`/jobs/${job.id}`} className="flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-800 whitespace-nowrap">
                      Open <ExternalLink size={11} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                {job.address
                  ? <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-violet-700"><MapPin size={10} className="shrink-0" /><span className="truncate">{job.address}</span></a>
                  : null}
                <span className="flex items-center gap-1">
                  <Calendar size={10} />{fmt(job.scheduledStartDate)}
                  {job.scheduledStartTime && <span className="text-violet-700 font-medium ml-1">{fmtTime(job.scheduledStartTime)}</span>}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />{fmt(job.expectedCompletionDate)}
                  {job.scheduledEndTime && <span className="ml-1">{fmtTime(job.scheduledEndTime)}</span>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${job.progress}%` }} />
                </div>
                <span className="text-xs text-slate-500">{job.progress}%</span>
              </div>
              <Link to={`/jobs/${job.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-800">
                Open Job <ChevronRight size={12} />
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

interface CalendarViewProps {
  jobs: SchedulerJob[];
  anchorDate: Date;
  onNavigate: (dir: -1 | 1) => void;
  onReschedule: (job: SchedulerJob, newStart: string, newEnd: string) => void;
}

/** Small popup shown when user taps/clicks a calendar event pill */
function EventPopup({
  job,
  onClose,
  onOpen,
}: {
  job: SchedulerJob;
  onClose: () => void;
  onOpen: () => void;
}) {
  const style = getStatusStyle(job.status);
  const color = barHex(job.status);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />
      {/* Card */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Colour strip */}
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="p-4">
          {/* Status badge */}
          <div className="flex items-center justify-between mb-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${style.bg} ${style.color}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              {job.status}
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors text-xs font-bold"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Job name */}
          <h3 className="text-sm font-bold text-slate-800 leading-snug mb-0.5">{job.name}</h3>
          {job.jobNumber && (
            <p className="text-[11px] text-slate-400 font-mono mb-2">#{job.jobNumber}</p>
          )}

          {/* Details */}
          <div className="space-y-1.5 text-xs text-slate-600">
            {/* Dates */}
            <div className="flex items-center gap-2">
              <Calendar size={11} className="shrink-0 text-slate-400" />
              <span>
                {fmt(job.scheduledStartDate)}
                {job.scheduledStartTime && (
                  <span className="text-violet-600 font-medium ml-1">{fmtTime(job.scheduledStartTime)}</span>
                )}
                {' → '}
                {fmt(job.expectedCompletionDate)}
                {job.scheduledEndTime && (
                  <span className="text-slate-400 ml-1">{fmtTime(job.scheduledEndTime)}</span>
                )}
              </span>
            </div>
            {/* Duration */}
            {job.scheduledStartDate && job.expectedCompletionDate && (
              <div className="flex items-center gap-2">
                <Clock size={11} className="shrink-0 text-slate-400" />
                <span>{daysBetween(job.scheduledStartDate, job.expectedCompletionDate)} day{daysBetween(job.scheduledStartDate, job.expectedCompletionDate) !== 1 ? 's' : ''}</span>
              </div>
            )}
            {/* Client */}
            {job.client && (
              <div className="flex items-center gap-2">
                <User size={11} className="shrink-0 text-slate-400" />
                <span className="truncate">{job.client}</span>
              </div>
            )}
            {/* Address */}
            {job.address && (
              <div className="flex items-start gap-2">
                <MapPin size={11} className="shrink-0 text-slate-400 mt-0.5" />
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-600 hover:underline leading-snug"
                  onClick={e => e.stopPropagation()}
                >
                  {job.address}
                </a>
              </div>
            )}
            {/* Supervisor */}
            {(job.supervisorName ?? job.teamLabel) && (
              <div className="flex items-center gap-2">
                <Users size={11} className="shrink-0 text-slate-400" />
                <span className="truncate">{job.supervisorName ?? job.teamLabel}</span>
              </div>
            )}
            {/* Progress */}
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${job.progress}%`, background: color }} />
              </div>
              <span className="text-[11px] text-slate-500 w-8 text-right">{job.progress}%</span>
            </div>
          </div>

          {/* Open job button */}
          <button
            onClick={onOpen}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-colors"
            style={{ background: color }}
          >
            <ExternalLink size={12} />
            Open Job
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ jobs, anchorDate, onNavigate, onReschedule }: CalendarViewProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingJob, setDraggingJob] = useState<SchedulerJob | null>(null);
  const [popupJob, setPopupJob] = useState<SchedulerJob | null>(null);
  const navigate = useRRNavigate();

  // Build the month grid
  const year  = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Start grid on Monday
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
  const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

  const cells: Array<Date | null> = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null;
    return new Date(year, month, dayNum);
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Jobs that fall on a given date
  function jobsOnDate(date: Date): SchedulerJob[] {
    return jobs.filter(j => {
      if (!j.scheduledStartDate || !j.expectedCompletionDate) return false;
      const s = parseLocalDate(j.scheduledStartDate);
      const e = parseLocalDate(j.expectedCompletionDate);
      return date >= s && date <= e;
    });
  }

  function handleDragStart(e: React.DragEvent, job: SchedulerJob) {
    setDraggingJob(job);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('jobId', String(job.id));
  }

  function handleDrop(e: React.DragEvent, date: Date) {
    e.preventDefault();
    setDragOver(null);
    if (!draggingJob) return;

    const duration = draggingJob.scheduledStartDate && draggingJob.expectedCompletionDate
      ? daysBetween(draggingJob.scheduledStartDate, draggingJob.expectedCompletionDate) - 1
      : 0;

    const newStart = toDateStr(date);
    const endDate  = new Date(date);
    endDate.setDate(endDate.getDate() + duration);
    const newEnd = toDateStr(endDate);

    onReschedule(draggingJob, newStart, newEnd);
    setDraggingJob(null);
  }

  const monthLabel = anchorDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  return (
    <div className="p-2 sm:p-3">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onNavigate(-1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
          <ChevronLeft size={15} />
        </button>
        <h2 className="text-xs font-bold text-slate-700">{monthLabel}</h2>
        <button onClick={() => onNavigate(1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold text-slate-400 uppercase py-0.5">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
        {cells.map((date, i) => {
          if (!date) {
            return <div key={i} className="bg-slate-50 min-h-[52px]" />;
          }
          const dateStr   = toDateStr(date);
          const isToday   = date.getTime() === today.getTime();
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const cellJobs  = jobsOnDate(date);
          const isDragTarget = dragOver === dateStr;

          return (
            <div
              key={i}
              className={`min-h-[52px] p-1 transition-colors ${
                isToday      ? 'bg-violet-50' :
                isWeekend    ? 'bg-slate-50/80' :
                isDragTarget ? 'bg-blue-50' :
                'bg-white'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(dateStr); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, date)}
            >
              {/* Day number */}
              <div className={`text-[10px] font-bold mb-0.5 w-5 h-5 flex items-center justify-center rounded-full leading-none ${
                isToday ? 'bg-violet-500 text-white' : 'text-slate-400'
              }`}>
                {date.getDate()}
              </div>

              {/* Event pills */}
              <div className="space-y-px">
                {cellJobs.slice(0, 2).map(job => {
                  const isStart = job.scheduledStartDate === dateStr;
                  return (
                    <button
                      key={job.id}
                      draggable={isStart}
                      onDragStart={isStart ? (e) => handleDragStart(e, job) : undefined}
                      onClick={(e) => { e.stopPropagation(); setPopupJob(job); }}
                      className={`w-full text-left text-[9px] font-semibold text-white px-1 py-px rounded-sm truncate leading-tight transition-opacity hover:opacity-90 active:opacity-75 ${
                        isStart ? 'cursor-pointer' : 'cursor-pointer opacity-80'
                      }`}
                      style={{ background: barHex(job.status) }}
                    >
                      {isStart && job.name}
                      {!isStart && <span className="opacity-60">▬</span>}
                    </button>
                  );
                })}
                {cellJobs.length > 2 && (
                  <button
                    onClick={() => setPopupJob(cellJobs[2])}
                    className="w-full text-left text-[9px] text-slate-500 font-semibold pl-0.5 hover:text-violet-600 transition-colors"
                  >
                    +{cellJobs.length - 2}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend — compact, 2 rows */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(STATUS_BAR_HEX).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
            <span className="text-[9px] text-slate-400 leading-none">{status}</span>
          </div>
        ))}
      </div>

      {/* Event popup */}
      {popupJob && (
        <EventPopup
          job={popupJob}
          onClose={() => setPopupJob(null)}
          onOpen={() => { navigate(`/jobs/${popupJob.id}`); setPopupJob(null); }}
        />
      )}
    </div>
  );
}

// ─── Timeline / Gantt View ────────────────────────────────────────────────────

// ─── Day View (hourly 6am–6pm) ────────────────────────────────────────────────

const DAY_START_HOUR = 6;
const DAY_END_HOUR   = 18;
const HOUR_HEIGHT    = 64; // px per hour
const TOTAL_HOURS    = DAY_END_HOUR - DAY_START_HOUR; // 12

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

function DayView({ jobs, anchorDate, onReschedule }: {
  jobs: SchedulerJob[];
  anchorDate: Date;
  onReschedule: (job: SchedulerJob, start: string, end: string, startTime?: string, endTime?: string) => void;
}) {
  const dateStr = toDateStr(anchorDate);
  const dayJobs = jobs.filter(j => j.scheduledStartDate === dateStr);

  // Jobs with times → positioned blocks
  const timedJobs   = dayJobs.filter(j => j.scheduledStartTime);
  // Jobs without times → all-day strip at top
  const allDayJobs  = dayJobs.filter(j => !j.scheduledStartTime);

  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => DAY_START_HOUR + i);

  function topPct(timeStr: string): number {
    const mins = timeToMinutes(timeStr);
    const startMins = DAY_START_HOUR * 60;
    const totalMins = TOTAL_HOURS * 60;
    return Math.max(0, Math.min(100, ((mins - startMins) / totalMins) * 100));
  }

  function heightPct(startStr: string, endStr: string | null | undefined): number {
    const startMins = timeToMinutes(startStr);
    const endMins   = endStr ? timeToMinutes(endStr) : startMins + 60;
    const totalMins = TOTAL_HOURS * 60;
    return Math.max(4, Math.min(100 - topPct(startStr), ((endMins - startMins) / totalMins) * 100));
  }

  // Current time indicator
  const now = new Date();
  const isToday = anchorDate.toDateString() === now.toDateString();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowPct  = ((nowMins - DAY_START_HOUR * 60) / (TOTAL_HOURS * 60)) * 100;
  const showNow = isToday && nowPct >= 0 && nowPct <= 100;

  return (
    <div className="flex flex-col h-full">
      {/* All-day strip */}
      {allDayJobs.length > 0 && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">All day</p>
          <div className="flex flex-wrap gap-1.5">
            {allDayJobs.map(job => (
              <Link key={job.id} to={`/jobs/${job.id}`}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-white ${barColor(job.status)}`}>
                {job.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Hourly grid */}
      <div className="flex flex-1 overflow-y-auto">
        {/* Time gutter */}
        <div className="w-16 shrink-0 border-r border-slate-200 bg-slate-50 relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {hours.map(h => (
            <div key={h} className="absolute w-full flex items-start justify-end pr-2"
              style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT - 8, height: HOUR_HEIGHT }}>
              <span className="text-[10px] font-medium text-slate-400 leading-none">
                {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
              </span>
            </div>
          ))}
        </div>

        {/* Grid + events */}
        <div className="flex-1 relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Hour lines */}
          {hours.map(h => (
            <div key={h} className="absolute left-0 right-0 border-t border-slate-100"
              style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT }} />
          ))}
          {/* Half-hour lines */}
          {hours.slice(0, -1).map(h => (
            <div key={`h${h}`} className="absolute left-0 right-0 border-t border-slate-50"
              style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
          ))}

          {/* Now indicator */}
          {showNow && (
            <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top: `${nowPct}%` }}>
              <div className="w-2 h-2 rounded-full bg-violet-500 -ml-1 shrink-0" />
              <div className="flex-1 h-px bg-violet-500" />
            </div>
          )}

          {/* Timed job blocks */}
          {timedJobs.map(job => {
            const top  = topPct(job.scheduledStartTime!);
            const ht   = heightPct(job.scheduledStartTime!, job.scheduledEndTime);
            const startLabel = fmtTime(job.scheduledStartTime);
            const endLabel   = job.scheduledEndTime ? fmtTime(job.scheduledEndTime) : '';
            return (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                title={`${job.name}${job.address ? `\n📍 ${job.address}` : ''}`}
                className={`absolute left-2 right-2 rounded-lg px-2 py-1 text-white shadow-sm hover:brightness-110 transition-all overflow-hidden ${barColor(job.status)}`}
                style={{ top: `${top}%`, height: `${ht}%`, minHeight: 28 }}
              >
                <p className="text-[11px] font-bold leading-tight truncate">{job.name}</p>
                <p className="text-[10px] opacity-80 leading-tight">
                  {startLabel}{endLabel ? `–${endLabel}` : ''}
                </p>
                {job.address && (
                  <p className="text-[10px] opacity-70 leading-tight truncate flex items-center gap-0.5 mt-0.5">
                    <MapPin size={8} className="shrink-0" />{job.address}
                  </p>
                )}
                {job.client && (
                  <p className="text-[10px] opacity-70 leading-tight truncate">{job.client}</p>
                )}
              </Link>
            );
          })}

          {/* Empty state */}
          {dayJobs.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
              <CalendarDays size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No jobs scheduled for this day</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

interface TimelineViewProps {
  jobs: SchedulerJob[];
  window: TimeWindow;
  anchorDate: Date;
  onReschedule: (job: SchedulerJob, newStart: string, newEnd: string) => void;
}

function TimelineView({ jobs, window: timeWindow, anchorDate, onReschedule }: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const DW = DAY_WIDTH[timeWindow];

  const windowStart = useMemo(() => {
    const d = new Date(anchorDate); d.setHours(0, 0, 0, 0); return d;
  }, [anchorDate]);

  const windowEnd   = useMemo(() => windowEndDate(anchorDate, timeWindow), [anchorDate, timeWindow]);
  const totalDays   = useMemo(() => windowDayCount(anchorDate, timeWindow), [anchorDate, timeWindow]);

  const headerDays  = useMemo(() =>
    Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(windowStart); d.setDate(d.getDate() + i); return d;
    }),
  [windowStart, totalDays]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayOffset = Math.round((today.getTime() - windowStart.getTime()) / 86400000);

  const visibleJobs = jobs.filter(j => overlapsWindow(j, windowStart, windowEnd));

  // Drag state
  const [dragging, setDragging] = useState<{ jobId: number; startX: number; origStart: string; origEnd: string } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  function barProps(job: SchedulerJob) {
    if (!job.scheduledStartDate || !job.expectedCompletionDate) return null;
    const jobStart  = parseLocalDate(job.scheduledStartDate);
    const jobFinish = parseLocalDate(job.expectedCompletionDate);
    const clampedStart  = jobStart  < windowStart ? windowStart : jobStart;
    const clampedFinish = jobFinish > windowEnd   ? windowEnd   : jobFinish;
    const leftDays  = Math.round((clampedStart.getTime()  - windowStart.getTime()) / 86400000);
    const widthDays = Math.max(1, Math.round((clampedFinish.getTime() - clampedStart.getTime()) / 86400000) + 1);
    return {
      left: leftDays * DW,
      width: widthDays * DW,
      clippedLeft:  jobStart  < windowStart,
      clippedRight: jobFinish > windowEnd,
    };
  }

  function shouldShowMonth(d: Date, i: number): boolean { return i === 0 || d.getDate() === 1; }
  function showDayLabel(i: number): boolean {
    if (timeWindow === 'day')   return true;
    if (timeWindow === 'week')  return true;
    if (timeWindow === 'month') return i % 2 === 0;
    return i % 7 === 0;
  }

  // Drag handlers for Gantt bars
  function handleBarMouseDown(e: React.MouseEvent, job: SchedulerJob) {
    if (!job.scheduledStartDate || !job.expectedCompletionDate) return;
    e.preventDefault();
    setDragging({ jobId: job.id, startX: e.clientX, origStart: job.scheduledStartDate, origEnd: job.expectedCompletionDate });
    setDragOffset(0);
  }

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) {
      setDragOffset(e.clientX - dragging!.startX);
    }
    function onMouseUp() {
      if (dragging && dragOffset !== 0) {
        const dayShift = Math.round(dragOffset / DW);
        if (dayShift !== 0) {
          const newStart = new Date(parseLocalDate(dragging.origStart));
          newStart.setDate(newStart.getDate() + dayShift);
          const newEnd = new Date(parseLocalDate(dragging.origEnd));
          newEnd.setDate(newEnd.getDate() + dayShift);
          const job = jobs.find(j => j.id === dragging!.jobId);
          if (job) onReschedule(job, toDateStr(newStart), toDateStr(newEnd));
        }
      }
      setDragging(null);
      setDragOffset(0);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, dragOffset, DW, jobs, onReschedule]);

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
    <div className="overflow-x-auto select-none" ref={scrollRef}>
      <div style={{ minWidth: totalDays * DW + 200 }}>

        {/* Header */}
        <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
          <div className="w-48 shrink-0 border-r border-slate-200" style={{ minHeight: 48 }}>
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Job</div>
          </div>
          <div className="flex flex-col flex-1">
            <div className="flex border-b border-slate-100">
              {headerDays.map((d, i) => {
                if (!shouldShowMonth(d, i)) return <div key={i} style={{ width: DW }} className="shrink-0" />;
                let span = 1;
                for (let j = i + 1; j < headerDays.length; j++) {
                  if (headerDays[j].getDate() === 1) break;
                  span++;
                }
                return (
                  <div key={i} style={{ width: span * DW }} className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide border-r border-slate-200 bg-slate-50">
                    {d.toLocaleDateString('en-AU', { month: 'short', year: timeWindow === '3months' ? '2-digit' : undefined })}
                  </div>
                );
              })}
            </div>
            <div className="flex">
              {headerDays.map((d, i) => {
                const isToday   = d.toDateString() === new Date().toDateString();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isMonthEdge = d.getDate() === 1;
                return (
                  <div key={i} style={{ width: DW }} className={`shrink-0 text-center py-0.5 border-r ${isMonthEdge ? 'border-slate-300' : 'border-slate-100'} ${isToday ? 'bg-violet-50' : isWeekend ? 'bg-slate-50/60' : ''}`}>
                    {showDayLabel(i) && (
                      <span className={`text-[10px] font-medium ${isToday ? 'text-violet-700 font-bold' : 'text-slate-400'}`}>
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
          const isDraggingThis = dragging?.jobId === job.id;
          const dayShift = isDraggingThis ? Math.round(dragOffset / DW) : 0;

          return (
            <div key={job.id} className="flex border-b border-slate-100 hover:bg-slate-50/60 transition-colors" style={{ height: 44 }}>
              <div className="w-48 shrink-0 px-3 flex items-center border-r border-slate-200 overflow-hidden">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{job.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {job.supervisorName ?? job.teamLabel ?? (job.jobNumber ? `#${job.jobNumber}` : '')}
                  </p>
                </div>
              </div>
              <div className="relative" style={{ width: totalDays * DW }}>
                {headerDays.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return isWeekend ? (
                    <div key={i} className="absolute top-0 bottom-0 bg-slate-50/80" style={{ left: i * DW, width: DW }} />
                  ) : null;
                })}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div className="absolute top-0 bottom-0 w-px bg-violet-500 z-10 opacity-70" style={{ left: todayOffset * DW + DW / 2 }} />
                )}
                {bar && (
                  <div
                    title={`${job.name}\n${fmt(job.scheduledStartDate)} → ${fmt(job.expectedCompletionDate)}\nDrag to reschedule`}
                    onMouseDown={(e) => handleBarMouseDown(e, job)}
                    className={`absolute top-2.5 h-[18px] flex items-center text-white text-[10px] font-semibold truncate shadow-sm cursor-grab active:cursor-grabbing transition-all ${barColor(job.status)} ${
                      bar.clippedLeft && !bar.clippedRight ? 'rounded-r-md' :
                      bar.clippedRight && !bar.clippedLeft ? 'rounded-l-md' :
                      bar.clippedLeft && bar.clippedRight  ? '' :
                      'rounded-md'
                    } ${isDraggingThis ? 'opacity-70 ring-2 ring-white/60' : 'hover:brightness-110'}`}
                    style={{ left: bar.left + dayShift * DW, width: bar.width }}
                  >
                    {bar.clippedLeft  && <span className="shrink-0 pl-0.5 opacity-70">◀</span>}
                    <GripVertical size={10} className="shrink-0 ml-1 opacity-60" />
                    <span className="px-1 truncate">{bar.width > 50 ? job.name : ''}</span>
                    {bar.clippedRight && <span className="shrink-0 pr-0.5 ml-auto opacity-70">▶</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50">
          {Object.entries(STATUS_BAR).map(([status, cls]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${cls}`} />
              <span className="text-[10px] text-slate-500">{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Crew Availability View ───────────────────────────────────────────────────

interface CrewViewProps {
  members: CrewMember[];
  unassignedJobs: SchedulerJob[];
  window: TimeWindow;
  anchorDate: Date;
  loading: boolean;
  onReschedule: (job: SchedulerJob, newStart: string, newEnd: string) => void;
}

function CrewView({ members, unassignedJobs, window: timeWindow, anchorDate, loading, onReschedule }: CrewViewProps) {
  const DW = DAY_WIDTH[timeWindow];

  const windowStart = useMemo(() => {
    const d = new Date(anchorDate); d.setHours(0, 0, 0, 0); return d;
  }, [anchorDate]);

  const windowEnd   = useMemo(() => windowEndDate(anchorDate, timeWindow), [anchorDate, timeWindow]);
  const totalDays   = useMemo(() => windowDayCount(anchorDate, timeWindow), [anchorDate, timeWindow]);

  const headerDays  = useMemo(() =>
    Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(windowStart); d.setDate(d.getDate() + i); return d;
    }),
  [windowStart, totalDays]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayOffset = Math.round((today.getTime() - windowStart.getTime()) / 86400000);

  function barProps(job: SchedulerJob) {
    if (!job.scheduledStartDate || !job.expectedCompletionDate) return null;
    const jobStart  = parseLocalDate(job.scheduledStartDate);
    const jobFinish = parseLocalDate(job.expectedCompletionDate);
    if (jobStart > windowEnd || jobFinish < windowStart) return null;
    const clampedStart  = jobStart  < windowStart ? windowStart : jobStart;
    const clampedFinish = jobFinish > windowEnd   ? windowEnd   : jobFinish;
    const leftDays  = Math.round((clampedStart.getTime()  - windowStart.getTime()) / 86400000);
    const widthDays = Math.max(1, Math.round((clampedFinish.getTime() - clampedStart.getTime()) / 86400000) + 1);
    return { left: leftDays * DW, width: widthDays * DW };
  }

  function showDayLabel(i: number): boolean {
    if (timeWindow === 'day')   return true;
    if (timeWindow === 'week')  return true;
    if (timeWindow === 'month') return i % 2 === 0;
    return i % 7 === 0;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-violet-600" size={24} />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Users size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No team members found.</p>
        <p className="text-xs mt-1">Add team members in Settings → Team to see crew availability.</p>
      </div>
    );
  }

  const allRows = [
    ...members.map(m => ({ id: m.id, label: m.name, sublabel: m.role, jobs: m.jobs })),
    ...(unassignedJobs.length > 0 ? [{ id: 'unassigned', label: 'Unassigned', sublabel: `${unassignedJobs.length} jobs`, jobs: unassignedJobs }] : []),
  ];

  return (
    <div className="overflow-x-auto select-none">
      <div style={{ minWidth: totalDays * DW + 200 }}>

        {/* Header */}
        <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
          <div className="w-48 shrink-0 border-r border-slate-200 px-3 py-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Team Member</p>
          </div>
          <div className="flex">
            {headerDays.map((d, i) => {
              const isToday   = d.toDateString() === new Date().toDateString();
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} style={{ width: DW }} className={`shrink-0 text-center py-1.5 border-r border-slate-100 ${isToday ? 'bg-violet-50' : isWeekend ? 'bg-slate-50/60' : ''}`}>
                  {showDayLabel(i) && (
                    <span className={`text-[10px] font-medium ${isToday ? 'text-violet-700 font-bold' : 'text-slate-400'}`}>
                      {d.getDate()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Member rows */}
        {allRows.map(row => {
          const rowJobs = row.jobs.filter(j => overlapsWindow(j, windowStart, windowEnd));
          const isUnassigned = row.id === 'unassigned';

          // Stack overlapping jobs into lanes
          const lanes: SchedulerJob[][] = [];
          rowJobs.forEach(job => {
            const jobStart = job.scheduledStartDate ? parseLocalDate(job.scheduledStartDate) : null;
            const jobEnd   = job.expectedCompletionDate ? parseLocalDate(job.expectedCompletionDate) : null;
            if (!jobStart || !jobEnd) return;
            let placed = false;
            for (const lane of lanes) {
              const lastJob = lane[lane.length - 1];
              const lastEnd = lastJob.expectedCompletionDate ? parseLocalDate(lastJob.expectedCompletionDate) : null;
              if (!lastEnd || jobStart > lastEnd) {
                lane.push(job);
                placed = true;
                break;
              }
            }
            if (!placed) lanes.push([job]);
          });

          const rowH = Math.max(44, lanes.length * 24 + 12);

          return (
            <div key={row.id} className="flex border-b border-slate-100" style={{ height: rowH }}>
              <div className={`w-48 shrink-0 px-3 flex flex-col justify-center border-r border-slate-200 ${isUnassigned ? 'bg-amber-50' : ''}`}>
                <p className="text-xs font-semibold text-slate-800 truncate">{row.label}</p>
                <p className="text-[10px] text-slate-500 truncate capitalize">{row.sublabel}</p>
              </div>
              <div className="relative flex-1" style={{ width: totalDays * DW }}>
                {headerDays.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return isWeekend ? (
                    <div key={i} className="absolute top-0 bottom-0 bg-slate-50/80" style={{ left: i * DW, width: DW }} />
                  ) : null;
                })}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div className="absolute top-0 bottom-0 w-px bg-violet-500 z-10 opacity-70" style={{ left: todayOffset * DW + DW / 2 }} />
                )}
                {lanes.map((lane, laneIdx) =>
                  lane.map(job => {
                    const bar = barProps(job);
                    if (!bar) return null;
                    return (
                      <Link
                        key={job.id}
                        to={`/jobs/${job.id}`}
                        title={`${job.name}${job.scheduledStartTime ? ` · ${fmtTime(job.scheduledStartTime)}${job.scheduledEndTime ? `–${fmtTime(job.scheduledEndTime)}` : ''}` : ''}\n${fmt(job.scheduledStartDate)} → ${fmt(job.expectedCompletionDate)}${job.address ? `\n📍 ${job.address}` : ''}`}
                        className={`absolute h-[18px] flex items-center text-white text-[10px] font-semibold truncate shadow-sm hover:brightness-110 transition-all rounded-md ${barColor(job.status)}`}
                        style={{ left: bar.left, width: bar.width, top: 4 + laneIdx * 24 }}
                      >
                        <span className="px-1.5 truncate">{bar.width > 40 ? (job.scheduledStartTime ? `${fmtTime(job.scheduledStartTime)} ${job.name}` : job.name) : ''}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Availability summary */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-4">
          {members.map(m => {
            const activeJobs = m.jobs.filter(j => overlapsWindow(j, windowStart, windowEnd));
            return (
              <div key={m.id} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeJobs.length === 0 ? 'bg-green-400' : activeJobs.length === 1 ? 'bg-violet-500' : 'bg-red-400'}`} />
                <span className="text-[10px] text-slate-600 font-medium">{m.name}</span>
                <span className="text-[10px] text-slate-500">{activeJobs.length === 0 ? 'Available' : `${activeJobs.length} job${activeJobs.length > 1 ? 's' : ''}`}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Unscheduled Section ──────────────────────────────────────────────────────

function UnscheduledSection({ jobs, onSchedule }: { jobs: SchedulerJob[]; onSchedule: (job: SchedulerJob) => void }) {
  if (jobs.length === 0) return null;
  return (
    <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-amber-50 flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-500" />
        <h3 className="text-sm font-bold text-slate-700">Unscheduled Jobs</h3>
        <span className="ml-auto text-xs text-slate-400">{jobs.length} job{jobs.length !== 1 ? 's' : ''} need scheduling</span>
      </div>
      <div className="divide-y divide-slate-100">
        {jobs.map(job => {
          const style = getStatusStyle(job.status);
          return (
            <div key={job.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
              <GripVertical size={14} className="text-slate-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{job.name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {[job.client, job.address, job.supervisorName ?? job.teamLabel].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${style.bg} ${style.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                {job.status}
              </span>
              <button
                onClick={() => onSchedule(job)}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 border border-violet-200 rounded-lg transition-colors"
              >
                Schedule
              </button>
              <Link to={`/jobs/${job.id}`} className="shrink-0 text-slate-600 hover:text-slate-800 transition-colors">
                <ExternalLink size={13} />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quick Schedule Modal ─────────────────────────────────────────────────────

function QuickScheduleModal({ job, onClose, onSave }: {
  job: SchedulerJob;
  onClose: () => void;
  onSave: (start: string, end: string, startTime: string, endTime: string) => void;
}) {
  const today = toDateStr(new Date());
  const [start,     setStart]     = useState(job.scheduledStartDate ?? today);
  const [end,       setEnd]       = useState(job.expectedCompletionDate ?? today);
  const [startTime, setStartTime] = useState(job.scheduledStartTime ?? '');
  const [endTime,   setEndTime]   = useState(job.scheduledEndTime   ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!start || !end) return;
    setSaving(true);
    await onSave(start, end, startTime, endTime);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-800 mb-1">Schedule Job</h2>
        <p className="text-sm text-slate-500 mb-4 truncate">{job.name}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Start Date</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">End Date</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !start || !end}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-violet-500 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') === 'tasks' ? 'tasks' : searchParams.get('tab') === 'team-shifts' ? 'team-shifts' : 'jobs') as 'jobs' | 'tasks' | 'team-shifts';
  const rrNavigate = useRRNavigate();

  const [jobs,            setJobs]            = useState<SchedulerJob[]>([]);
  const [crewMembers,     setCrewMembers]      = useState<CrewMember[]>([]);
  const [unassignedJobs,  setUnassignedJobs]   = useState<SchedulerJob[]>([]);
  const [loading,         setLoading]          = useState(true);
  const [crewLoading,     setCrewLoading]      = useState(false);
  const [error,           setError]            = useState('');
  const [view,            setView]             = useState<ViewMode>('timeline');
  const [timeWindow,      setTimeWindow]       = useState<TimeWindow>('week');
  const [anchorDate,      setAnchorDate]       = useState<Date>(() => snapAnchor('week'));
  const [search,          setSearch]           = useState('');
  const [statusFilter,    setStatusFilter]     = useState('All');
  const [supervisorFilter,setSupervisorFilter] = useState('All');
  const [scheduleTarget,  setScheduleTarget]   = useState<SchedulerJob | null>(null);
  const [saveMsg,         setSaveMsg]          = useState('');

  // Load jobs
  useEffect(() => {
    setLoading(true);
    fetch('/api/scheduler/jobs', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: SchedulerJob[] }) => {
        setJobs(data.jobs ?? []);
        setError('');
      })
      .catch(() => setError('Failed to load scheduler data'))
      .finally(() => setLoading(false));
  }, []);

  // Load crew when crew view is selected
  useEffect(() => {
    if (view !== 'crew') return;
    setCrewLoading(true);
    fetch('/api/scheduler/crew', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { members?: CrewMember[]; unassignedJobs?: SchedulerJob[] }) => {
        setCrewMembers(data.members ?? []);
        setUnassignedJobs(data.unassignedJobs ?? []);
      })
      .catch(() => {})
      .finally(() => setCrewLoading(false));
  }, [view]);

  // Reschedule handler — optimistic update + API call
  const handleReschedule = useCallback(async (job: SchedulerJob, newStart: string, newEnd: string, newStartTime?: string, newEndTime?: string) => {
    // Optimistic update
    setJobs(prev => prev.map(j => j.id === job.id
      ? { ...j, scheduledStartDate: newStart, expectedCompletionDate: newEnd,
          ...(newStartTime !== undefined && { scheduledStartTime: newStartTime || null }),
          ...(newEndTime   !== undefined && { scheduledEndTime:   newEndTime   || null }),
        }
      : j
    ));
    setCrewMembers(prev => prev.map(m => ({
      ...m,
      jobs: m.jobs.map(j => j.id === job.id
        ? { ...j, scheduledStartDate: newStart, expectedCompletionDate: newEnd }
        : j
      ),
    })));

    const ok = await rescheduleJob(job.id, newStart, newEnd, newStartTime, newEndTime);
    if (ok) {
      setSaveMsg(`${job.name} rescheduled to ${fmt(newStart)}${newStartTime ? ` at ${fmtTime(newStartTime)}` : ''}`);
      setTimeout(() => setSaveMsg(''), 3000);
    } else {
      // Revert
      setJobs(prev => prev.map(j => j.id === job.id
        ? { ...j, scheduledStartDate: job.scheduledStartDate, expectedCompletionDate: job.expectedCompletionDate,
            scheduledStartTime: job.scheduledStartTime, scheduledEndTime: job.scheduledEndTime }
        : j
      ));
      setSaveMsg('Failed to save — please try again');
      setTimeout(() => setSaveMsg(''), 3000);
    }
  }, []);

  const handleQuickSchedule = useCallback(async (start: string, end: string, startTime: string, endTime: string) => {
    if (!scheduleTarget) return;
    await handleReschedule(scheduleTarget, start, end, startTime, endTime);
    setJobs(prev => prev.map(j => j.id === scheduleTarget.id
      ? { ...j, scheduledStartDate: start, expectedCompletionDate: end,
          scheduledStartTime: startTime || null, scheduledEndTime: endTime || null }
      : j
    ));
    setScheduleTarget(null);
  }, [scheduleTarget, handleReschedule]);

  const supervisors = useMemo(() => {
    const names = jobs.map(j => j.supervisorName ?? j.teamLabel).filter((n): n is string => !!n);
    return ['All', ...Array.from(new Set(names)).sort()];
  }, [jobs]);

  const scheduled   = jobs.filter(isScheduled);
  const unscheduled = jobs.filter(j => !isScheduled(j));

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

  function navigate(direction: -1 | 1) {
    setAnchorDate(prev => stepAnchor(prev, timeWindow, direction));
  }

  function goToToday() {
    setAnchorDate(snapAnchor(timeWindow));
  }

  function switchWindow(tw: TimeWindow) {
    setTimeWindow(tw);
    setAnchorDate(snapAnchor(tw));
  }

  const windowLabel = useMemo(() => {
    const end = windowEndDate(anchorDate, timeWindow);
    if (timeWindow === 'day')   return anchorDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (timeWindow === 'week')  return `${fmtShort(toDateStr(anchorDate))} – ${fmtShort(toDateStr(end))}`;
    if (timeWindow === 'month') return anchorDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    const s = anchorDate.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    const e = end.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    return `${s} – ${e}`;
  }, [anchorDate, timeWindow]);

  const windowStart = useMemo(() => { const d = new Date(anchorDate); d.setHours(0,0,0,0); return d; }, [anchorDate]);
  const windowEnd   = useMemo(() => windowEndDate(anchorDate, timeWindow), [anchorDate, timeWindow]);

  const visibleCount = view === 'timeline' || view === 'crew'
    ? filtered.filter(j => overlapsWindow(j, windowStart, windowEnd)).length
    : filtered.length;

  return (
    <div className="portal-page">
      <Helmet>
        <title>Scheduler — IWILLBUILD</title>
        <meta name="description" content="View and manage job schedules, timelines and upcoming work." />
        <link rel="canonical" href="https://iwillbuild.com/scheduler" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Scheduler — IWILLBUILD" />
        <meta property="og:description" content="View and manage job schedules, timelines and upcoming work." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/scheduler" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Scheduler — IWILLBUILD" />
        <meta name="twitter:description" content="View and manage job schedules, timelines and upcoming work." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col min-w-0 lg:pt-[104px]">

        {/* ── Top bar ── */}
        <div className="op-page-header flex flex-wrap items-center gap-x-2 gap-y-1.5 shrink-0 min-w-0">

          {/* Back — mobile only (desktop navigates via sidebar) */}
          <button type="button" onClick={() => rrNavigate(-1)} title="Back"
            className="lg:hidden shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft size={14} />
          </button>
          {/* Home — mobile only */}
          <Link to="/home" title="Home"
            className="lg:hidden shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <Home size={14} />
          </Link>

          <CalendarDays size={14} className="text-primary shrink-0" />
          <h1 className="op-page-title shrink-0">Scheduler</h1>

          {/* ── Top-level page tabs ── */}
          <div className="flex items-center bg-gray-100 rounded p-0.5 gap-0.5 shrink-0">
            <button onClick={() => setSearchParams({})}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${activeTab === 'jobs' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Jobs
            </button>
            <button onClick={() => setSearchParams({ tab: 'tasks' })}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${activeTab === 'tasks' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Tasks
            </button>
          </div>

          {/* Save message toast */}
          {saveMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-semibold text-green-700 shrink-0"
            >
              <CheckCircle2 size={11} />
              {saveMsg}
            </motion.div>
          )}

          {/* Time window + view toggles — pushed right on desktop, wraps to new row on mobile */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Time window and view toggle — jobs tab only */}
            {activeTab === 'jobs' && (
              <>
                {/* Time window — only for timeline/crew/calendar views (assets has its own) */}
                {view !== 'table' && view !== 'assets' && (
                  <div className="flex items-center bg-gray-100 rounded p-0.5 gap-0.5 shrink-0">
                    {(Object.keys(WINDOW_LABELS) as TimeWindow[]).map(key => (
                      <button key={key} onClick={() => switchWindow(key)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${timeWindow === key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {WINDOW_LABELS[key]}
                      </button>
                    ))}
                  </div>
                )}

                <div className="h-4 w-px bg-gray-200 hidden sm:block" />

                {/* View toggle */}
                <div className="flex items-center bg-gray-100 rounded p-0.5 gap-0.5 shrink-0">
                  {([
                    { key: 'table',    icon: <List size={12} />,        label: 'Table' },
                    { key: 'timeline', icon: <BarChart2 size={12} />,   label: 'Timeline' },
                    { key: 'calendar', icon: <Calendar size={12} />,    label: 'Calendar' },
                    { key: 'crew',     icon: <Users size={12} />,       label: 'Crew' },
                    { key: 'assets',   icon: <Truck size={12} />,       label: 'Assets' },
                  ] as const).map(({ key, icon, label }) => (
                    <button key={key} onClick={() => setView(key)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${view === key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

          {/* ── Filters + period nav bar — jobs tab only, hidden in assets view ── */}
          {activeTab === 'jobs' && view !== 'assets' && (
          <div className="op-toolbar flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs..."
              className="op-toolbar-search pl-7 w-40"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="op-toolbar-search appearance-none cursor-pointer"
          >
            <option value="All">All statuses</option>
            {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {supervisors.length > 1 && (
            <select
              value={supervisorFilter}
              onChange={e => setSupervisorFilter(e.target.value)}
              className="op-toolbar-search appearance-none cursor-pointer"
            >
              {supervisors.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All supervisors' : s}</option>
              ))}
            </select>
          )}

          {/* Period navigation */}
          {view !== 'table' && (
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Previous period">
                <ChevronLeft size={13} />
              </button>
              <span className="text-xs font-semibold text-gray-700 min-w-[130px] text-center px-1">{windowLabel}</span>
              <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors" title="Next period">
                <ChevronRight size={13} />
              </button>
              <button onClick={goToToday} className="px-2 py-0.5 text-xs font-semibold text-primary hover:bg-violet-50 rounded transition-colors border border-violet-200 ml-1">
                Today
              </button>
            </div>
          )}

          <div className="text-[11px] text-gray-400 hidden lg:block ml-auto">
            {visibleCount} scheduled · {unscheduled.length} unscheduled
          </div>
          </div>
          )}

        {/* ── Main content ── */}
        <div className={`flex-1 overflow-y-auto ${view === 'assets' && activeTab === 'jobs' ? '' : 'p-3 md:p-4'}`}>

          {/* ── Tasks tab ── */}
          {activeTab === 'tasks' && (
            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <TasksSchedulerView />
            </div>
          )}

          {/* ── Jobs tab ── */}
          {activeTab === 'jobs' && (
            <>
              {/* Assets view — full-height, manages its own layout */}
              {view === 'assets' && (
                <div className="h-full flex flex-col bg-white border border-gray-200 rounded-none overflow-hidden">
                  <AssetSchedulerView
                    timeWindow={timeWindow === 'day' ? 'week' : timeWindow as 'week' | 'month' | '3months'}
                    anchorDate={anchorDate}
                    onWindowChange={(tw) => switchWindow(tw)}
                    onNavigate={navigate}
                    onGoToday={goToToday}
                    windowLabel={windowLabel}
                  />
                </div>
              )}

              {view !== 'assets' && loading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-violet-600" size={28} />
                </div>
              )}

              {view !== 'assets' && !loading && error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-4">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              {view !== 'assets' && !loading && !error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
                    {view === 'table' && <TableView jobs={filtered} />}
                    {view === 'timeline' && timeWindow === 'day' && (
                      <DayView
                        jobs={filtered}
                        anchorDate={anchorDate}
                        onReschedule={handleReschedule}
                      />
                    )}
                    {view === 'timeline' && timeWindow !== 'day' && (
                      <TimelineView
                        jobs={filtered}
                        window={timeWindow}
                        anchorDate={anchorDate}
                        onReschedule={handleReschedule}
                      />
                    )}
                    {view === 'calendar' && (
                      <CalendarView
                        jobs={filtered}
                        anchorDate={anchorDate}
                        onNavigate={navigate}
                        onReschedule={handleReschedule}
                      />
                    )}
                    {view === 'crew' && (
                      <CrewView
                        members={crewMembers}
                        unassignedJobs={unassignedJobs}
                        window={timeWindow}
                        anchorDate={anchorDate}
                        loading={crewLoading}
                        onReschedule={handleReschedule}
                      />
                    )}
                  </div>

                  {view !== 'crew' && (
                    <UnscheduledSection
                      jobs={unscheduled}
                      onSchedule={setScheduleTarget}
                    />
                  )}
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quick Schedule Modal */}
      {scheduleTarget && (
        <QuickScheduleModal
          job={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
          onSave={handleQuickSchedule}
        />
      )}
    </div>
  );
}
