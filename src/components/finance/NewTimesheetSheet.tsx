/**
 * NewTimesheetSheet — FairWork compliant
 * Each day: Start time · Finish time · Unpaid break (mins) → hours auto-calculated.
 * Non-work days (Leave / Sick / Public Holiday) collapse to a badge row.
 */
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Clock, ChevronDown, Loader2, AlertCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type DayType = 'work' | 'leave' | 'sick' | 'public-holiday';

interface Job {
  id: number;
  job_number: string | null;
  name: string;
}

/** One row per calendar day — mirrors FairWork template exactly */
interface DayRow {
  work_date: string;       // YYYY-MM-DD
  day_type: DayType;
  start_time: string;      // HH:MM 24h, empty = blank
  finish_time: string;     // HH:MM 24h, empty = blank
  unpaid_break_mins: string; // numeric string, empty = 0
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

const DAY_TYPES: { key: DayType; label: string; color: string; activeBg: string; activeBorder: string; rowBg: string }[] = [
  { key: 'leave',          label: 'Leave',          color: 'text-blue-700',   activeBg: 'bg-blue-100',   activeBorder: 'border-blue-400',   rowBg: 'bg-blue-50/60'   },
  { key: 'sick',           label: 'Sick',           color: 'text-amber-700',  activeBg: 'bg-amber-100',  activeBorder: 'border-amber-400',  rowBg: 'bg-amber-50/60'  },
  { key: 'public-holiday', label: 'Public Holiday', color: 'text-purple-700', activeBg: 'bg-purple-100', activeBorder: 'border-purple-400', rowBg: 'bg-purple-50/60' },
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

function fmtDayLabel(dateStr: string): string {
  try {
    const [y, mo, dy] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, dy).toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'short',
    });
  } catch { return dateStr; }
}

/** Convert HH:MM strings + break minutes → decimal hours, null if incomplete */
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
  return { work_date: date, day_type: 'work', start_time: '', finish_time: '', unpaid_break_mins: '', job_id: null, description: '' };
}

function totalHours(rows: DayRow[]): number {
  return rows.reduce((sum, r) => {
    if (r.day_type !== 'work') return sum + STANDARD_HOURS;
    return sum + (calcHours(r.start_time, r.finish_time, r.unpaid_break_mins) ?? 0);
  }, 0);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewTimesheetSheet({ open, onClose, onSaved, editId }: Props) {
  const [weekEnding, setWeekEnding] = useState(nextSunday);
  const [globalJobId, setGlobalJobId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<DayRow[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
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

  // Load jobs
  useEffect(() => {
    if (!open) return;
    fetch('/api/jobs?status=active&limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => setJobs(Array.isArray(data.jobs) ? data.jobs : []))
      .catch(() => setJobs([]));
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

    // Build entries payload
    const entries = rows.map(r => {
      if (r.day_type !== 'work') {
        const cfg = DAY_TYPES.find(d => d.key === r.day_type)!;
        return { work_date: r.work_date, job_id: null, description: cfg.label, hours: STANDARD_HOURS, start_time: null, finish_time: null, unpaid_break_mins: 0, day_type: r.day_type };
      }
      const hrs = calcHours(r.start_time, r.finish_time, r.unpaid_break_mins);
      if (hrs === null) return null; // skip blank days
      return {
        work_date: r.work_date,
        job_id: r.job_id,
        description: r.description.trim() || 'Work',
        hours: hrs,
        start_time: r.start_time || null,
        finish_time: r.finish_time || null,
        unpaid_break_mins: parseInt(r.unpaid_break_mins, 10) || 0,
        day_type: 'work',
      };
    }).filter(Boolean);

    if (entries.length === 0) {
      setError('Enter start/finish times for at least one day, or mark a day as leave/sick/public holiday');
      return;
    }

    const payload = { weekEnding, jobId: globalJobId, notes: notes.trim() || null, entries };

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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1200] flex items-end md:items-center justify-center md:justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative z-10 w-full md:w-[560px] md:h-full bg-background flex flex-col rounded-t-2xl md:rounded-none shadow-2xl"
            style={{ maxHeight: 'min(92dvh, 900px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Clock size={15} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-foreground">
                  {editId ? 'Edit Timesheet' : 'New Timesheet'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {total > 0 ? `${total.toFixed(2)} hrs total` : 'Enter start & finish times for each day'}
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Week ending + default job */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Week ending <span className="text-destructive">*</span>
                  </label>
                  <input type="date" value={weekEnding} onChange={e => setWeekEnding(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Default job</label>
                  <div className="relative">
                    <select value={globalJobId ?? ''} onChange={e => setGlobalJobId(e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="w-full h-9 pl-3 pr-8 rounded-lg border border-border bg-background text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <option value="">No default job</option>
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Column headers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Daily hours</p>
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-bold text-foreground">{total.toFixed(2)} hrs</span>
                  </span>
                </div>

                {/* FairWork column header */}
                <div className="grid grid-cols-[1fr_64px_64px_52px_64px] gap-1.5 px-3 mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">Day</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-center">Start</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-center">Finish</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-center">Break</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-right">Hours</span>
                </div>

                {/* Day rows */}
                <div className="space-y-1.5">
                  {rows.map(row => {
                    const isWork = row.day_type === 'work';
                    const cfg = DAY_TYPES.find(d => d.key === row.day_type);
                    const hrs = isWork ? calcHours(row.start_time, row.finish_time, row.unpaid_break_mins) : STANDARD_HOURS;

                    return (
                      <div key={row.work_date} className={`rounded-xl border overflow-hidden transition-colors ${isWork ? 'border-border' : `border ${cfg?.activeBorder}`}`}>

                        {/* Main row */}
                        <div className={`grid grid-cols-[1fr_64px_64px_52px_64px] gap-1.5 items-center px-3 py-2 ${isWork ? '' : cfg?.rowBg}`}>
                          {/* Day label */}
                          <div className="min-w-0">
                            <span className={`text-xs font-semibold truncate block ${isWork ? 'text-foreground' : cfg?.color}`}>
                              {fmtDayLabel(row.work_date)}
                            </span>
                          </div>

                          {/* Start */}
                          {isWork ? (
                            <input type="time" value={row.start_time}
                              onChange={e => updateRow(row.work_date, { start_time: e.target.value })}
                              className="w-full h-8 px-1.5 rounded-lg border border-border bg-background text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
                          ) : (
                            <span className={`text-xs text-center ${cfg?.color}`}>—</span>
                          )}

                          {/* Finish */}
                          {isWork ? (
                            <input type="time" value={row.finish_time}
                              onChange={e => updateRow(row.work_date, { finish_time: e.target.value })}
                              className="w-full h-8 px-1.5 rounded-lg border border-border bg-background text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
                          ) : (
                            <span className={`text-xs text-center ${cfg?.color}`}>—</span>
                          )}

                          {/* Break (mins) */}
                          {isWork ? (
                            <input type="number" placeholder="0" min="0" max="480" step="5"
                              value={row.unpaid_break_mins}
                              onChange={e => updateRow(row.work_date, { unpaid_break_mins: e.target.value })}
                              className="w-full h-8 px-1.5 rounded-lg border border-border bg-background text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
                          ) : (
                            <span className={`text-xs text-center ${cfg?.color}`}>—</span>
                          )}

                          {/* Calculated hours */}
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

                        {/* Day type pills + optional job/description row */}
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 border-t border-border/50 ${isWork ? 'bg-muted/20' : cfg?.rowBg}`}>
                          {DAY_TYPES.map(d => (
                            <button key={d.key}
                              onClick={() => setDayType(row.work_date, row.day_type === d.key ? 'work' : d.key)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                                row.day_type === d.key
                                  ? `${d.activeBg} ${d.color} ${d.activeBorder}`
                                  : 'bg-transparent text-muted-foreground border-transparent hover:border-border hover:text-foreground'
                              }`}>
                              {d.label}
                            </button>
                          ))}

                          {/* Per-day job override (work days only) */}
                          {isWork && jobs.length > 0 && (
                            <div className="relative ml-auto">
                              <select value={row.job_id ?? ''}
                                onChange={e => updateRow(row.work_date, { job_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                                className="h-6 pl-2 pr-6 rounded-lg border border-border bg-background text-[10px] text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 max-w-[140px]">
                                <option value="">{globalJobId ? 'Default job' : 'No job'}</option>
                                {jobs.map(j => (
                                  <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number}` : j.name}</option>
                                ))}
                              </select>
                              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            </div>
                          )}
                        </div>

                        {/* Description (work days only) */}
                        {isWork && (
                          <div className="px-3 pb-2.5 pt-1">
                            <input type="text" placeholder="Work description (optional)"
                              value={row.description}
                              onChange={e => updateRow(row.work_date, { description: e.target.value })}
                              className="w-full h-7 px-2.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Notes (optional)</label>
                <textarea rows={3} placeholder="Any additional notes for the office…" value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>

              <div className="h-2" />
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 pb-6 pt-3 border-t border-border flex gap-3">
              <button onClick={() => save(false)} disabled={saving}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save draft
              </button>
              <button onClick={() => save(true)} disabled={saving}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
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
