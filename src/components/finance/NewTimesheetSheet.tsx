/**
 * NewTimesheetSheet
 * Renders as a bottom sheet on mobile, right-side panel on desktop.
 * Matches the NewPOSheet layout pattern exactly.
 */
import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X, Plus, Trash2, Clock, ChevronDown, Loader2, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  job_number: string | null;
  name: string;
}

interface EntryRow {
  _key: string;
  work_date: string;
  job_id: number | null;
  description: string;
  hours: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (id: number, andSubmit: boolean) => void;
  editId?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Use local date arithmetic to avoid UTC offset shifting dates (e.g. Brisbane UTC+10).
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}



function nextSaturday(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const daysUntilSat = day === 6 ? 0 : 6 - day;
  d.setDate(d.getDate() + daysUntilSat);
  return toLocalISO(d);
}

function weekDates(weekEnding: string): string[] {
  // weekEnding is a Saturday (YYYY-MM-DD local).
  // Returns Mon Tue Wed Thu Fri Sat Sun — 7 days starting 5 days before Saturday.
  // Parse as local date to avoid UTC offset shifting the day.
  const [y, mo, dy] = weekEnding.split('-').map(Number);
  const end = new Date(y, mo - 1, dy); // local midnight, no UTC shift
  const offsets = [-5, -4, -3, -2, -1, 0, 1]; // Mon … Sun
  return offsets.map(offset => {
    const d = new Date(end);
    d.setDate(end.getDate() + offset);
    return toLocalISO(d);
  });
}

function fmtDayLabel(dateStr: string): string {
  try {
    const [y, mo, dy] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, dy).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch { return dateStr; }
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function totalHours(entries: EntryRow[]): number {
  return entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewTimesheetSheet({ open, onClose, onSaved, editId }: Props) {
  const [weekEnding, setWeekEnding] = useState(nextSaturday);
  const [globalJobId, setGlobalJobId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rebuild entry rows when weekEnding changes
  useEffect(() => {
    if (!weekEnding) return;
    const dates = weekDates(weekEnding);
    setEntries(prev => {
      const byDate: Record<string, EntryRow[]> = {};
      for (const e of prev) {
        if (!byDate[e.work_date]) byDate[e.work_date] = [];
        byDate[e.work_date].push(e);
      }
      const next: EntryRow[] = [];
      for (const d of dates) {
        if (byDate[d]?.length) {
          next.push(...byDate[d]);
        } else {
          next.push({ _key: uid(), work_date: d, job_id: null, description: '', hours: '' });
        }
      }
      return next;
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
        setWeekEnding(ts.week_ending?.slice(0, 10) ?? nextSaturday());
        setGlobalJobId(ts.job_id ?? null);
        setNotes(ts.notes ?? '');
        if (Array.isArray(ts.entries) && ts.entries.length > 0) {
          setEntries(ts.entries.map((e: { work_date: string; job_id: number | null; description: string; hours: number }) => ({
            _key: uid(),
            work_date: e.work_date?.slice(0, 10) ?? '',
            job_id: e.job_id ?? null,
            description: e.description ?? '',
            hours: String(e.hours ?? ''),
          })));
        }
      })
      .catch(() => setError('Failed to load timesheet'));
  }, [open, editId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setWeekEnding(nextSaturday());
      setGlobalJobId(null);
      setNotes('');
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const updateEntry = useCallback((key: string, field: keyof EntryRow, value: string | number | null) => {
    setEntries(prev => prev.map(e => e._key === key ? { ...e, [field]: value } : e));
  }, []);

  const addEntryForDate = useCallback((date: string) => {
    setEntries(prev => {
      const idx = prev.map(e => e.work_date).lastIndexOf(date);
      const newEntry: EntryRow = { _key: uid(), work_date: date, job_id: null, description: '', hours: '' };
      const next = [...prev];
      next.splice(idx + 1, 0, newEntry);
      return next;
    });
  }, []);

  const removeEntry = useCallback((key: string) => {
    setEntries(prev => {
      const date = prev.find(e => e._key === key)?.work_date;
      const sameDate = prev.filter(e => e.work_date === date);
      if (sameDate.length <= 1) {
        return prev.map(e => e._key === key ? { ...e, description: '', hours: '' } : e);
      }
      return prev.filter(e => e._key !== key);
    });
  }, []);

  async function save(andSubmit: boolean) {
    setError(null);
    if (!weekEnding) { setError('Week ending date is required'); return; }
    const validEntries = entries.filter(e => e.description.trim() || parseFloat(e.hours) > 0);
    if (validEntries.length === 0) { setError('Add at least one time entry with hours'); return; }
    const badHours = validEntries.find(e => {
      const h = parseFloat(e.hours);
      return !isFinite(h) || h <= 0 || h > 24;
    });
    if (badHours) { setError('Hours must be between 0.1 and 24 per entry'); return; }

    const payload = {
      weekEnding,
      jobId: globalJobId,
      notes: notes.trim() || null,
      entries: validEntries.map(e => ({
        work_date: e.work_date,
        job_id: e.job_id,
        description: e.description.trim(),
        hours: parseFloat(e.hours),
      })),
    };

    setSaving(true);
    try {
      let id: number;
      if (editId) {
        const r = await fetch(`/api/finance/timesheets/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Failed to save');
        id = editId;
      } else {
        const r = await fetch('/api/finance/timesheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Failed to create');
        id = data.timesheet.id;
      }

      if (andSubmit) {
        const r2 = await fetch(`/api/finance/timesheets/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
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

  const dates = weekEnding ? weekDates(weekEnding) : [];
  const byDate: Record<string, EntryRow[]> = {};
  for (const e of entries) {
    if (!byDate[e.work_date]) byDate[e.work_date] = [];
    byDate[e.work_date].push(e);
  }
  const total = totalHours(entries);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1200] flex items-end md:items-center justify-center md:justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel — bottom sheet on mobile, right panel on desktop */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative z-10 w-full md:w-[520px] md:h-full bg-background flex flex-col rounded-t-2xl md:rounded-none shadow-2xl"
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
                  {total > 0 ? `${total.toFixed(2)} hrs entered` : 'Fill in your hours for the week'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
                  >
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
                  <input
                    type="date"
                    value={weekEnding}
                    onChange={e => setWeekEnding(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Default job
                  </label>
                  <div className="relative">
                    <select
                      value={globalJobId ?? ''}
                      onChange={e => setGlobalJobId(e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="w-full h-9 pl-3 pr-8 rounded-lg border border-border bg-background text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">No default job</option>
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>
                          {j.job_number ? `${j.job_number} — ` : ''}{j.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Day-by-day entries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time entries</p>
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-bold text-foreground">{total.toFixed(2)} hrs</span>
                  </span>
                </div>

                {dates.map(date => {
                  const dayEntries = byDate[date] ?? [];
                  const dayTotal = dayEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
                  return (
                    <div key={date} className="rounded-xl border border-border overflow-hidden">
                      {/* Day header */}
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                        <span className="text-xs font-semibold text-foreground">{fmtDayLabel(date)}</span>
                        {dayTotal > 0 && (
                          <span className="text-xs font-medium text-primary">{dayTotal.toFixed(2)} hrs</span>
                        )}
                      </div>

                      {/* Entry rows */}
                      <div className="divide-y divide-border">
                        {dayEntries.map(entry => (
                          <div key={entry._key} className="px-3 py-2.5 space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="What did you work on?"
                                value={entry.description}
                                onChange={e => updateEntry(entry._key, 'description', e.target.value)}
                                className="flex-1 h-8 px-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              <input
                                type="number"
                                placeholder="hrs"
                                min="0.1"
                                max="24"
                                step="0.25"
                                value={entry.hours}
                                onChange={e => updateEntry(entry._key, 'hours', e.target.value)}
                                className="w-[72px] h-8 px-2.5 rounded-lg border border-border bg-background text-sm text-foreground text-right placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              <button
                                onClick={() => removeEntry(entry._key)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            {jobs.length > 0 && (
                              <div className="relative">
                                <select
                                  value={entry.job_id ?? ''}
                                  onChange={e => updateEntry(entry._key, 'job_id', e.target.value ? parseInt(e.target.value, 10) : null)}
                                  className="w-full h-7 pl-2.5 pr-7 rounded-lg border border-border bg-background text-xs text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                  <option value="">{globalJobId ? 'Using default job' : 'No job assigned'}</option>
                                  {jobs.map(j => (
                                    <option key={j.id} value={j.id}>
                                      {j.job_number ? `${j.job_number} — ` : ''}{j.name}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add entry for this day */}
                      <button
                        onClick={() => addEntryForDate(date)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-primary hover:bg-primary/5 transition-colors border-t border-border"
                      >
                        <Plus size={12} />
                        Add entry for this day
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Any additional notes for the office…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Bottom spacer so last item clears the fixed footer */}
              <div className="h-2" />
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 pb-6 pt-3 border-t border-border flex gap-3">
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save draft
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
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
