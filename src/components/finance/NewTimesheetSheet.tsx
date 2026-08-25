/**
 * NewTimesheetSheet — FairWork compliant
 *
 * Mobile  (<640px): stacked day-card layout — full day name, labelled time
 *                   fields in 2-col rows, wrapping day-type pills, full-width
 *                   job selector and description.
 * Desktop (≥640px): compact table-row layout (Day | Start | Finish | Break | Hrs).
 *
 * Employee field required before saving.
 */
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Clock, ChevronDown, Loader2, AlertCircle, User } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type DayType = 'work' | 'leave' | 'sick' | 'public-holiday' | 'unpaid-leave';

interface Job {
  id: number;
  job_number: string | null;
  name: string;
}

interface Employee {
  profileId: number;
  name: string;
  email: string;
}

interface DayRow {
  work_date: string;          // YYYY-MM-DD
  day_type: DayType;
  start_time: string;         // HH:MM 24h
  finish_time: string;        // HH:MM 24h
  lunch_start: string;        // HH:MM 24h
  lunch_finish: string;       // HH:MM 24h
  unpaid_break_mins: string;  // numeric string
  job_id: number | null;
  description: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (id: number, andSubmit: boolean) => void;
  editId?: number | null;
}

// ── Day type config ───────────────────────────────────────────────────────────

const DAY_TYPES: {
  key: DayType;
  label: string;
  color: string;
  activeBg: string;
  activeBorder: string;
  rowBg: string;
  hours: number;
}[] = [
  { key: 'leave',         label: 'Leave',         color: 'text-blue-700',   activeBg: 'bg-blue-100',   activeBorder: 'border-blue-400',   rowBg: 'bg-blue-50/60',   hours: 7.6 },
  { key: 'sick',          label: 'Sick',           color: 'text-amber-700',  activeBg: 'bg-amber-100',  activeBorder: 'border-amber-400',  rowBg: 'bg-amber-50/60',  hours: 7.6 },
  { key: 'public-holiday',label: 'Public Holiday', color: 'text-purple-700', activeBg: 'bg-purple-100', activeBorder: 'border-purple-400', rowBg: 'bg-purple-50/60', hours: 7.6 },
  { key: 'unpaid-leave',  label: 'Unpaid Leave',   color: 'text-rose-700',   activeBg: 'bg-rose-100',   activeBorder: 'border-rose-400',   rowBg: 'bg-rose-50/60',   hours: 0   },
];

const STANDARD_HOURS = 7.6;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextSunday(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDay();
  const daysUntilSun = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSun);
  return toLocalISO(d);
}

function weekDates(weekEnding: string): string[] {
  const [y, mo, dy] = weekEnding.split('-').map(Number);
  const end = new Date(y, mo - 1, dy);
  return [-6, -5, -4, -3, -2, -1, 0].map(offset => {
    const d = new Date(end);
    d.setDate(end.getDate() + offset);
    return toLocalISO(d);
  });
}

/** Full label: "Monday, 25 Aug" */
function fmtDayLabel(dateStr: string): string {
  try {
    const [y, mo, dy] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, dy).toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'short',
    });
  } catch { return dateStr; }
}

/** Short label for desktop table: "Mon 25" */
function fmtDayShort(dateStr: string): string {
  try {
    const [y, mo, dy] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, dy).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric',
    });
  } catch { return dateStr; }
}

/** HH:MM + break mins → decimal hours, null if incomplete */
function calcHours(start: string, finish: string, breakMins: string): number | null {
  if (!start || !finish) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [fh, fm] = finish.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(fh) || isNaN(fm)) return null;
  let mins = (fh * 60 + fm) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // overnight
  mins -= (parseInt(breakMins, 10) || 0);
  if (mins <= 0) return null;
  return Math.round((mins / 60) * 100) / 100;
}

function blankDay(date: string): DayRow {
  return {
    work_date: date, day_type: 'work',
    start_time: '', finish_time: '',
    lunch_start: '', lunch_finish: '',
    unpaid_break_mins: '',
    job_id: null, description: '',
  };
}

function rowHours(row: DayRow): number | null {
  if (row.day_type !== 'work') {
    const cfg = DAY_TYPES.find(d => d.key === row.day_type);
    return cfg?.hours ?? STANDARD_HOURS;
  }
  return calcHours(row.start_time, row.finish_time, row.unpaid_break_mins);
}

function totalHours(rows: DayRow[]): number {
  return rows.reduce((sum, r) => sum + (rowHours(r) ?? 0), 0);
}

// ── Shared input class ────────────────────────────────────────────────────────

const inputCls =
  'w-full h-11 sm:h-8 px-2 rounded-lg border border-border bg-background text-sm sm:text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40';

// ── Mobile Day Card ───────────────────────────────────────────────────────────

interface DayCardMobileProps {
  row: DayRow;
  jobs: Job[];
  globalJobId: number | null;
  onUpdate: (date: string, patch: Partial<DayRow>) => void;
  onSetType: (date: string, type: DayType) => void;
}

function DayCardMobile({ row, jobs, globalJobId, onUpdate, onSetType }: DayCardMobileProps) {
  const isWork = row.day_type === 'work';
  const cfg = DAY_TYPES.find(d => d.key === row.day_type);
  const hrs = rowHours(row);

  return (
    <div className={`rounded-2xl border overflow-hidden ${isWork ? 'border-border' : `border ${cfg?.activeBorder}`}`}>

      {/* ── Card header: day name + daily total ── */}
      <div className={`flex items-center justify-between px-4 py-3 ${isWork ? 'bg-muted/30' : cfg?.rowBg}`}>
        <span className={`text-sm font-bold ${isWork ? 'text-foreground' : cfg?.color}`}>
          {fmtDayLabel(row.work_date)}
        </span>
        <span className={`text-sm font-bold tabular-nums ${hrs && hrs > 0 ? (isWork ? 'text-primary' : cfg?.color) : 'text-muted-foreground/40'}`}>
          {hrs !== null && hrs > 0 ? `${hrs.toFixed(2)} hrs` : '—'}
        </span>
      </div>

      <div className="px-4 pb-4 pt-3 space-y-3">

        {/* ── Day-type pills ── */}
        <div className="flex flex-wrap gap-2">
          {DAY_TYPES.map(d => (
            <button
              key={d.key}
              type="button"
              onClick={() => onSetType(row.work_date, row.day_type === d.key ? 'work' : d.key)}
              className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                row.day_type === d.key
                  ? `${d.activeBg} ${d.color} ${d.activeBorder}`
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* ── Non-work: show selected type info ── */}
        {!isWork && cfg && (
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${cfg.rowBg}`}>
            <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
            {cfg.hours > 0 && (
              <span className={`text-xs ${cfg.color} opacity-80`}>· {cfg.hours} hrs</span>
            )}
          </div>
        )}

        {/* ── Work day: time fields ── */}
        {isWork && (
          <>
            {/* Row 1: Start + Finish */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Start time</label>
                <input
                  type="time"
                  value={row.start_time}
                  onChange={e => onUpdate(row.work_date, { start_time: e.target.value })}
                  className={inputCls}
                  aria-label="Start time"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Finish time</label>
                <input
                  type="time"
                  value={row.finish_time}
                  onChange={e => onUpdate(row.work_date, { finish_time: e.target.value })}
                  className={inputCls}
                  aria-label="Finish time"
                />
              </div>
            </div>

            {/* Row 2: Lunch start + Lunch finish */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Lunch start</label>
                <input
                  type="time"
                  value={row.lunch_start}
                  onChange={e => onUpdate(row.work_date, { lunch_start: e.target.value })}
                  className={inputCls}
                  aria-label="Lunch start"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Lunch finish</label>
                <input
                  type="time"
                  value={row.lunch_finish}
                  onChange={e => onUpdate(row.work_date, { lunch_finish: e.target.value })}
                  className={inputCls}
                  aria-label="Lunch finish"
                />
              </div>
            </div>

            {/* Break mins */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Unpaid break (mins)
              </label>
              <input
                type="number"
                placeholder="0"
                min="0"
                max="480"
                step="5"
                value={row.unpaid_break_mins}
                onChange={e => onUpdate(row.work_date, { unpaid_break_mins: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="Unpaid break minutes"
              />
            </div>

            {/* Job selector */}
            {jobs.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Job</label>
                <div className="relative">
                  <select
                    value={row.job_id ?? ''}
                    onChange={e => onUpdate(row.work_date, { job_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full h-11 pl-3 pr-8 rounded-lg border border-border bg-background text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">{globalJobId ? 'Default job' : 'No job'}</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>
                        {j.job_number ? `${j.job_number} — ${j.name}` : j.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Description <span className="font-normal text-muted-foreground/60">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Work description…"
                value={row.description}
                onChange={e => onUpdate(row.work_date, { description: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Desktop Day Row ───────────────────────────────────────────────────────────

interface DayRowDesktopProps {
  row: DayRow;
  jobs: Job[];
  globalJobId: number | null;
  onUpdate: (date: string, patch: Partial<DayRow>) => void;
  onSetType: (date: string, type: DayType) => void;
}

function DayRowDesktop({ row, jobs, globalJobId, onUpdate, onSetType }: DayRowDesktopProps) {
  const isWork = row.day_type === 'work';
  const cfg = DAY_TYPES.find(d => d.key === row.day_type);
  const hrs = rowHours(row);

  return (
    <div className={`rounded-xl border overflow-hidden transition-colors ${isWork ? 'border-border' : `border ${cfg?.activeBorder}`}`}>

      {/* Main table row */}
      <div className={`grid grid-cols-[1fr_72px_72px_56px_64px] gap-1.5 items-center px-3 py-2 ${isWork ? '' : cfg?.rowBg}`}>
        <div className="min-w-0">
          <span className={`text-xs font-semibold truncate block ${isWork ? 'text-foreground' : cfg?.color}`}>
            {fmtDayShort(row.work_date)}
          </span>
        </div>

        {isWork ? (
          <input type="time" value={row.start_time}
            onChange={e => onUpdate(row.work_date, { start_time: e.target.value })}
            className="w-full h-8 px-1 rounded-lg border border-border bg-background text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
        ) : <span className={`text-xs text-center ${cfg?.color}`}>—</span>}

        {isWork ? (
          <input type="time" value={row.finish_time}
            onChange={e => onUpdate(row.work_date, { finish_time: e.target.value })}
            className="w-full h-8 px-1 rounded-lg border border-border bg-background text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
        ) : <span className={`text-xs text-center ${cfg?.color}`}>—</span>}

        {isWork ? (
          <input type="number" placeholder="0" min="0" max="480" step="5"
            value={row.unpaid_break_mins}
            onChange={e => onUpdate(row.work_date, { unpaid_break_mins: e.target.value })}
            className="w-full h-8 px-1 rounded-lg border border-border bg-background text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
        ) : <span className={`text-xs text-center ${cfg?.color}`}>—</span>}

        <div className="text-right">
          {hrs !== null && hrs > 0 ? (
            <span className={`text-xs font-semibold ${isWork ? 'text-primary' : cfg?.color}`}>
              {hrs.toFixed(2)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/40">—</span>
          )}
        </div>
      </div>

      {/* Pills + job row */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 border-t border-border/50 ${isWork ? 'bg-muted/20' : cfg?.rowBg}`}>
        {DAY_TYPES.map(d => (
          <button key={d.key} type="button"
            onClick={() => onSetType(row.work_date, row.day_type === d.key ? 'work' : d.key)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
              row.day_type === d.key
                ? `${d.activeBg} ${d.color} ${d.activeBorder}`
                : 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground'
            }`}>
            {d.label}
          </button>
        ))}

        {isWork && jobs.length > 0 && (
          <div className="relative ml-auto">
            <select value={row.job_id ?? ''}
              onChange={e => onUpdate(row.work_date, { job_id: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="h-6 pl-2 pr-6 rounded-lg border border-border bg-background text-[10px] text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 max-w-[140px]">
              <option value="">{globalJobId ? 'Default job' : 'No job'}</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.job_number ?? j.name}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        )}
      </div>

      {/* Description */}
      {isWork && (
        <div className="px-3 pb-2.5 pt-1">
          <input type="text" placeholder="Work description (optional)"
            value={row.description}
            onChange={e => onUpdate(row.work_date, { description: e.target.value })}
            className="w-full h-7 px-2.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
      )}
    </div>
  );
}

// ── Main Sheet ────────────────────────────────────────────────────────────────

export default function NewTimesheetSheet({ open, onClose, onSaved, editId }: Props) {
  const [weekEnding, setWeekEnding] = useState(nextSunday);
  const [globalJobId, setGlobalJobId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<DayRow[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeProfileId, setEmployeeProfileId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rebuild day rows when weekEnding changes
  useEffect(() => {
    if (!weekEnding) return;
    const dates = weekDates(weekEnding);
    setRows(prev => {
      const byDate: Record<string, DayRow> = {};
      for (const r of prev) byDate[r.work_date] = r;
      return dates.map(d => byDate[d] ?? blankDay(d));
    });
  }, [weekEnding]);

  // Load jobs + employees when sheet opens
  useEffect(() => {
    if (!open) return;
    fetch('/api/jobs?status=active&limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => setJobs(Array.isArray(data.jobs) ? data.jobs : []))
      .catch(() => setJobs([]));

    fetch('/api/finance/timesheets/employees', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => setEmployees(Array.isArray(data.employees) ? data.employees : []))
      .catch(() => setEmployees([]));
  }, [open]);

  // Load existing timesheet for editing
  useEffect(() => {
    if (!open || !editId) return;
    fetch(`/api/finance/timesheets/${editId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        const ts = data.timesheet;
        const we = ts.week_ending?.slice(0, 10) ?? nextSunday();
        setWeekEnding(we);
        setGlobalJobId(ts.job_id ?? null);
        setNotes(ts.notes ?? '');
        setEmployeeProfileId(ts.employee_profile_id ?? null);
        if (Array.isArray(ts.entries) && ts.entries.length > 0) {
          const dates = weekDates(we);
          const byDate: Record<string, DayRow> = {};
          for (const e of ts.entries) {
            const d = e.work_date?.slice(0, 10) ?? '';
            byDate[d] = {
              work_date: d,
              day_type: (e.day_type as DayType) ?? 'work',
              start_time: e.start_time ?? '',
              finish_time: e.finish_time ?? '',
              lunch_start: e.lunch_start ?? '',
              lunch_finish: e.lunch_finish ?? '',
              unpaid_break_mins: e.unpaid_break_mins != null ? String(e.unpaid_break_mins) : '',
              job_id: e.job_id ?? null,
              description: e.description ?? '',
            };
          }
          setRows(dates.map(d => byDate[d] ?? blankDay(d)));
        }
      })
      .catch(() => setError('Failed to load timesheet'));
  }, [open, editId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setWeekEnding(nextSunday());
      setGlobalJobId(null);
      setNotes('');
      setEmployeeProfileId(null);
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const updateRow = useCallback((date: string, patch: Partial<DayRow>) => {
    setRows(prev => prev.map(r => r.work_date === date ? { ...r, ...patch } : r));
  }, []);

  const setDayType = useCallback((date: string, type: DayType) => {
    setRows(prev => prev.map(r => r.work_date === date ? { ...r, day_type: type } : r));
  }, []);

  async function save(andSubmit: boolean) {
    setError(null);
    if (!weekEnding) { setError('Week ending date is required'); return; }
    if (!employeeProfileId) { setError('Please select an employee'); return; }

    const entries = rows.map(r => {
      if (r.day_type !== 'work') {
        const cfg = DAY_TYPES.find(d => d.key === r.day_type)!;
        return {
          work_date: r.work_date, job_id: null,
          description: cfg.label, hours: cfg.hours,
          start_time: null, finish_time: null,
          lunch_start: null, lunch_finish: null,
          unpaid_break_mins: 0, day_type: r.day_type,
        };
      }
      const hrs = calcHours(r.start_time, r.finish_time, r.unpaid_break_mins);
      if (hrs === null) return null;
      return {
        work_date: r.work_date,
        job_id: r.job_id,
        description: r.description.trim() || 'Work',
        hours: hrs,
        start_time: r.start_time || null,
        finish_time: r.finish_time || null,
        lunch_start: r.lunch_start || null,
        lunch_finish: r.lunch_finish || null,
        unpaid_break_mins: parseInt(r.unpaid_break_mins, 10) || 0,
        day_type: 'work',
      };
    }).filter(Boolean);

    if (entries.length === 0) {
      setError('Enter start/finish times for at least one day, or mark a day as leave/sick/public holiday');
      return;
    }

    const payload = { weekEnding, employeeProfileId, jobId: globalJobId, notes: notes.trim() || null, entries };

    setSaving(true);
    try {
      let id: number;
      if (editId) {
        const r = await fetch(`/api/finance/timesheets/${editId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Failed to save');
        id = editId;
      } else {
        const r = await fetch('/api/finance/timesheets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Failed to create');
        id = data.timesheet.id;
      }

      if (andSubmit) {
        const r2 = await fetch(`/api/finance/timesheets/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ status: 'submitted' }),
        });
        const d2 = await r2.json();
        if (!r2.ok) throw new Error(d2.error ?? 'Failed to submit');
      }

      onSaved(id, andSubmit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  const total = totalHours(rows);
  const selectedEmployee = employees.find(e => e.profileId === employeeProfileId);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center sm:justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative z-10 w-full sm:w-[580px] sm:h-full bg-background flex flex-col rounded-t-2xl sm:rounded-none shadow-2xl"
            style={{ maxHeight: 'min(94dvh, 960px)' }}
          >
            {/* ── Sheet header ── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Clock size={15} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-foreground">
                  {editId ? 'Edit Timesheet' : 'New Timesheet'}
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedEmployee
                    ? <span className="font-semibold text-foreground">{selectedEmployee.name}</span>
                    : total > 0 ? `${total.toFixed(2)} hrs total` : 'Select employee to begin'}
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5 pb-safe">

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Employee picker ── */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Employee <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <select
                    value={employeeProfileId ?? ''}
                    onChange={e => setEmployeeProfileId(e.target.value ? parseInt(e.target.value, 10) : null)}
                    className="w-full h-11 pl-9 pr-8 rounded-lg border border-border bg-background text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">Select employee…</option>
                    {employees.map(emp => (
                      <option key={emp.profileId} value={emp.profileId}>{emp.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                {selectedEmployee && (
                  <p className="text-xs text-muted-foreground mt-1 pl-1">{selectedEmployee.email}</p>
                )}
              </div>

              {/* ── Week ending + default job ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Week ending <span className="text-destructive">*</span>
                  </label>
                  <input type="date" value={weekEnding} onChange={e => setWeekEnding(e.target.value)}
                    className="w-full h-11 sm:h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Default job</label>
                  <div className="relative">
                    <select value={globalJobId ?? ''} onChange={e => setGlobalJobId(e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="w-full h-11 sm:h-9 pl-3 pr-8 rounded-lg border border-border bg-background text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <option value="">No default</option>
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* ── Daily hours section ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Daily hours</p>
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-bold text-foreground">{total.toFixed(2)} hrs</span>
                  </span>
                </div>

                {/* Desktop column headers — hidden on mobile */}
                <div className="hidden sm:grid grid-cols-[1fr_72px_72px_56px_64px] gap-1.5 px-3 mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Day</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-center">Start</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-center">Finish</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-center">Break</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-right">Hours</span>
                </div>

                {/* Day cards/rows */}
                <div className="space-y-3 sm:space-y-1.5">
                  {rows.map(row => (
                    <div key={row.work_date}>
                      {/* Mobile card */}
                      <div className="sm:hidden">
                        <DayCardMobile
                          row={row}
                          jobs={jobs}
                          globalJobId={globalJobId}
                          onUpdate={updateRow}
                          onSetType={setDayType}
                        />
                      </div>
                      {/* Desktop row */}
                      <div className="hidden sm:block">
                        <DayRowDesktop
                          row={row}
                          jobs={jobs}
                          globalJobId={globalJobId}
                          onUpdate={updateRow}
                          onSetType={setDayType}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Notes ── */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Notes (optional)</label>
                <textarea rows={3} placeholder="Any additional notes for the office…" value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>

              <div className="h-2" />
            </div>

            {/* ── Footer ── */}
            <div className="shrink-0 px-4 sm:px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 border-t border-border flex gap-3">
              <button onClick={() => save(false)} disabled={saving}
                className="flex-1 h-12 sm:h-11 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save draft
              </button>
              <button onClick={() => save(true)} disabled={saving}
                className="flex-1 h-12 sm:h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Submit to office
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
