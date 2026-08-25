/**
 * NewTimesheetSheet
 * Slide-up sheet for employees to fill out and submit a timesheet.
 *
 * Features:
 *  - Week-ending date picker (defaults to coming Saturday)
 *  - Optional job selector
 *  - Day-by-day time entries (Mon–Sun) with hours + description per row
 *  - Add extra entries per day (e.g. multiple jobs in one day)
 *  - Notes field
 *  - Save as Draft or Submit directly
 *  - Total hours summary
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Clock, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  job_number: string | null;
  name: string;
}

interface EntryRow {
  _key: string;
  work_date: string;   // YYYY-MM-DD
  job_id: number | null;
  description: string;
  hours: string;       // string for input binding
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (id: number, andSubmit: boolean) => void;
  /** If editing an existing draft */
  editId?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextSaturday(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const daysUntilSat = day === 6 ? 0 : 6 - day;
  d.setDate(d.getDate() + daysUntilSat);
  return d.toISOString().slice(0, 10);
}

function weekDates(weekEnding: string): string[] {
  // Returns Mon–Sun for the week that ends on weekEnding
  const end = new Date(weekEnding + 'T00:00:00');
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function fmtDayLabel(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
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
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rebuild entry rows whenever weekEnding changes (keep existing values where dates match)
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

  // Load jobs list
  useEffect(() => {
    if (!open) return;
    setLoadingJobs(true);
    fetch('/api/jobs?status=active&limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => setJobs(Array.isArray(data.jobs) ? data.jobs : []))
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
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
      // Don't remove the last entry for a date — just clear it
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

  // Group entries by date for rendering
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
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '92dvh' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  {editId ? 'Edit Timesheet' : 'New Timesheet'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
                  >
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Week ending + global job */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
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
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Default job (optional)
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
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Day-by-day entries */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Time entries</h3>
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-semibold text-foreground">{total.toFixed(2)} hrs</span>
                  </span>
                </div>

                {dates.map(date => {
                  const dayEntries = byDate[date] ?? [];
                  return (
                    <div key={date} className="rounded-xl border border-border overflow-hidden">
                      {/* Day header */}
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                        <span className="text-xs font-semibold text-foreground">{fmtDayLabel(date)}</span>
                        <span className="text-xs text-muted-foreground">
                          {dayEntries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0).toFixed(2)} hrs
                        </span>
                      </div>

                      {/* Entry rows */}
                      <div className="divide-y divide-border">
                        {dayEntries.map((entry, idx) => (
                          <div key={entry._key} className="px-3 py-2.5 space-y-2">
                            <div className="flex gap-2">
                              {/* Description */}
                              <input
                                type="text"
                                placeholder="What did you work on?"
                                value={entry.description}
                                onChange={e => updateEntry(entry._key, 'description', e.target.value)}
                                className="flex-1 h-8 px-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              {/* Hours */}
                              <input
                                type="number"
                                placeholder="hrs"
                                min="0.1"
                                max="24"
                                step="0.25"
                                value={entry.hours}
                                onChange={e => updateEntry(entry._key, 'hours', e.target.value)}
                                className="w-20 h-8 px-2.5 rounded-lg border border-border bg-background text-sm text-foreground text-right placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              {/* Remove */}
                              <button
                                onClick={() => removeEntry(entry._key)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            {/* Per-entry job override */}
                            {jobs.length > 0 && (
                              <div className="relative">
                                <select
                                  value={entry.job_id ?? ''}
                                  onChange={e => updateEntry(entry._key, 'job_id', e.target.value ? parseInt(e.target.value, 10) : null)}
                                  className="w-full h-7 pl-2.5 pr-7 rounded-lg border border-border bg-background text-xs text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                  <option value="">
                                    {globalJobId
                                      ? `Using default job`
                                      : 'No job assigned'}
                                  </option>
                                  {jobs.map(j => (
                                    <option key={j.id} value={j.id}>
                                      {j.job_number ? `${j.job_number} — ` : ''}{j.name}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
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
                        Add another entry for this day
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Notes (optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Any additional notes for the office…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Spacer for bottom buttons */}
              <div className="h-2" />
            </div>

            {/* Footer actions */}
            <div className="shrink-0 px-4 pb-6 pt-3 border-t border-border flex gap-3">
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                Save draft
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                Submit to office
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
