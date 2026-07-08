/**
 * /team/schedule — Team shift scheduling, time tracking, and payroll export.
 * Tabs: Shifts (weekly grid) | Time Tracking | Payroll Export
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  CalendarDays, Clock, DollarSign, Plus, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, Check, X, Download, Edit2, Trash2,
  CheckCircle2, XCircle, Users, RefreshCw,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

// ── Types ─────────────────────────────────────────────────────────────────────
interface TeamMember {
  id: number;
  display_name: string;
  role: string;
  email: string;
}

interface Shift {
  id: number;
  profile_id: number;
  member_name: string;
  member_role: string;
  job_id?: number;
  job_name?: string;
  job_number?: string;
  title: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
}

interface TimeEntry {
  id: number;
  profile_id: number;
  member_name: string;
  member_role: string;
  job_name?: string;
  job_number?: string;
  entry_date: string;
  clock_in: string;
  clock_out?: string;
  break_minutes: number;
  total_minutes?: number;
  hourly_rate?: number;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by_name?: string;
  approved_at?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getWeekDates(anchor: Date): Date[] {
  const d = new Date(anchor);
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return x;
  });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`;
}

function fmtMinutes(mins?: number | null) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function shiftDuration(s: Shift) {
  const [sh, sm] = s.start_time.split(':').map(Number);
  const [eh, em] = s.end_time.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm) - s.break_minutes;
  return fmtMinutes(Math.max(0, mins));
}

const STATUS_SHIFT: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  scheduled:  { label: 'Scheduled',  color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500' },
  confirmed:  { label: 'Confirmed',  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  completed:  { label: 'Completed',  color: 'text-slate-600',   bg: 'bg-slate-100 border-slate-200',  dot: 'bg-slate-400' },
  cancelled:  { label: 'Cancelled',  color: 'text-red-600',     bg: 'bg-red-50 border-red-200',       dot: 'bg-red-400' },
};

const STATUS_TIME: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'text-amber-600',   icon: Clock },
  approved: { label: 'Approved', color: 'text-emerald-600', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-500',     icon: XCircle },
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'from-amber-500 to-orange-600',
  admin: 'from-blue-500 to-blue-700',
  manager: 'from-violet-500 to-violet-700',
  supervisor: 'from-indigo-500 to-indigo-700',
  worker: 'from-emerald-500 to-emerald-700',
  readonly: 'from-slate-400 to-slate-600',
};

function Avatar({ name, role }: { name: string; role: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const grad = ROLE_COLORS[role] ?? ROLE_COLORS.worker;
  return (
    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 bg-gradient-to-br ${grad}`}>
      {initials}
    </div>
  );
}

// ── Shift Form Modal ──────────────────────────────────────────────────────────
function ShiftModal({
  members, initial, onClose, onSave,
}: {
  members: TeamMember[];
  initial?: Partial<Shift> & { shift_date?: string };
  onClose: () => void;
  onSave: (data: Partial<Shift>) => Promise<void>;
}) {
  const [profileId, setProfileId] = useState(String(initial?.profile_id ?? members[0]?.id ?? ''));
  const [title, setTitle] = useState(initial?.title ?? 'Shift');
  const [shiftDate, setShiftDate] = useState(initial?.shift_date ?? isoDate(new Date()));
  const [startTime, setStartTime] = useState(initial?.start_time ?? '07:00');
  const [endTime, setEndTime] = useState(initial?.end_time ?? '15:00');
  const [breakMins, setBreakMins] = useState(String(initial?.break_minutes ?? 30));
  const [status, setStatus] = useState(initial?.status ?? 'scheduled');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ profileId: parseInt(profileId), title, shiftDate, startTime, endTime, breakMinutes: parseInt(breakMins), status, notes: notes || undefined });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">{initial?.id ? 'Edit Shift' : 'New Shift'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Team Member</label>
            <select value={profileId} onChange={e => setProfileId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400">
              {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Date</label>
            <input type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Break (min)</label>
              <input type="number" min={0} max={120} value={breakMins} onChange={e => setBreakMins(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as Shift['status'])}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400">
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400 resize-none" />
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {initial?.id ? 'Save Changes' : 'Create Shift'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Time Entry Form Modal ─────────────────────────────────────────────────────
function TimeEntryModal({
  members, initial, onClose, onSave,
}: {
  members: TeamMember[];
  initial?: Partial<TimeEntry>;
  onClose: () => void;
  onSave: (data: Partial<TimeEntry>) => Promise<void>;
}) {
  const [profileId, setProfileId] = useState(String(initial?.profile_id ?? members[0]?.id ?? ''));
  const [entryDate, setEntryDate] = useState(initial?.entry_date ?? isoDate(new Date()));
  const [clockIn, setClockIn] = useState(initial?.clock_in?.slice(11, 16) ?? '07:00');
  const [clockOut, setClockOut] = useState(initial?.clock_out?.slice(11, 16) ?? '15:00');
  const [breakMins, setBreakMins] = useState(String(initial?.break_minutes ?? 30));
  const [hourlyRate, setHourlyRate] = useState(String(initial?.hourly_rate ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      profileId: parseInt(profileId),
      entryDate,
      clockIn: `${entryDate} ${clockIn}:00`,
      clockOut: clockOut ? `${entryDate} ${clockOut}:00` : undefined,
      breakMinutes: parseInt(breakMins),
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
      notes: notes || undefined,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">{initial?.id ? 'Edit Time Entry' : 'Add Time Entry'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Team Member</label>
            <select value={profileId} onChange={e => setProfileId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400">
              {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Date</label>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Clock In</label>
              <input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Clock Out</label>
              <input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Break (min)</label>
              <input type="number" min={0} max={120} value={breakMins} onChange={e => setBreakMins(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Hourly Rate ($)</label>
            <input type="number" min={0} step={0.01} placeholder="e.g. 35.00" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400 resize-none" />
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {initial?.id ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = 'shifts' | 'time' | 'payroll';

export default function TeamSchedulePage() {
  const [tab, setTab] = useState<Tab>('shifts');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrated, setMigrated] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Week navigation
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const weekDates = getWeekDates(weekAnchor);

  // Month for time entries / payroll
  const [month, setMonth] = useState(() => isoDate(new Date()).slice(0, 7));

  // Filters
  const [filterMember, setFilterMember] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);

  // Payroll export
  const [exporting, setExporting] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => isoDate(new Date()).slice(0, 7));

  // ── Migrate on first load ──────────────────────────────────────────────────
  useEffect(() => {
    async function migrate() {
      setMigrating(true);
      try {
        const res = await fetch('/api/team/schedule/migrate', { method: 'POST' });
        if (res.ok) setMigrated(true);
      } catch { /* ignore */ }
      setMigrating(false);
    }
    migrate();
  }, []);

  // ── Load members ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/team/members')
      .then(r => r.json() as Promise<{ members?: TeamMember[] }>)
      .then(d => setMembers(d.members ?? []))
      .catch(() => {});
  }, []);

  // ── Load shifts ────────────────────────────────────────────────────────────
  const loadShifts = useCallback(async () => {
    if (!migrated) return;
    setLoading(true);
    setError(null);
    try {
      const weekOf = isoDate(weekDates[0]);
      const qs = new URLSearchParams({ weekOf });
      if (filterMember) qs.set('profileId', filterMember);
      const res = await fetch(`/api/team/shifts?${qs}`);
      const data = await res.json() as { shifts?: Shift[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setShifts(data.shifts ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [migrated, weekDates[0].toISOString(), filterMember]);

  useEffect(() => { if (tab === 'shifts') loadShifts(); }, [tab, loadShifts]);

  // ── Load time entries ──────────────────────────────────────────────────────
  const loadTimeEntries = useCallback(async () => {
    if (!migrated) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ month });
      if (filterMember) qs.set('profileId', filterMember);
      if (filterStatus) qs.set('status', filterStatus);
      const res = await fetch(`/api/team/time-entries?${qs}`);
      const data = await res.json() as { entries?: TimeEntry[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setTimeEntries(data.entries ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [migrated, month, filterMember, filterStatus]);

  useEffect(() => { if (tab === 'time' || tab === 'payroll') loadTimeEntries(); }, [tab, loadTimeEntries]);

  // ── Shift CRUD ─────────────────────────────────────────────────────────────
  async function handleSaveShift(data: Partial<Shift>) {
    if (editShift?.id) {
      await fetch(`/api/team/shifts/${editShift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/team/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    setShowShiftModal(false);
    setEditShift(null);
    loadShifts();
  }

  async function handleDeleteShift(id: number) {
    if (!confirm('Delete this shift?')) return;
    await fetch(`/api/team/shifts/${id}`, { method: 'DELETE' });
    loadShifts();
  }

  // ── Time entry CRUD ────────────────────────────────────────────────────────
  async function handleSaveEntry(data: Partial<TimeEntry>) {
    if (editEntry?.id) {
      await fetch(`/api/team/time-entries/${editEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/team/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    setShowTimeModal(false);
    setEditEntry(null);
    loadTimeEntries();
  }

  async function handleApprove(id: number, status: 'approved' | 'rejected') {
    await fetch(`/api/team/time-entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadTimeEntries();
  }

  // ── Payroll export ─────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ month: exportMonth });
      if (filterMember) qs.set('profileId', filterMember);
      const res = await fetch(`/api/team/time-entries/export?${qs}`);
      if (!res.ok) { setExporting(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${exportMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // ── Payroll summary ────────────────────────────────────────────────────────
  const approvedEntries = timeEntries.filter(e => e.status === 'approved');
  const totalHours = approvedEntries.reduce((sum, e) => sum + (e.total_minutes ?? 0), 0) / 60;
  const totalPay = approvedEntries.reduce((sum, e) => {
    if (e.hourly_rate && e.total_minutes) return sum + (e.total_minutes / 60) * e.hourly_rate;
    return sum;
  }, 0);

  // Group shifts by date for the weekly grid
  const shiftsByDate = weekDates.reduce<Record<string, Shift[]>>((acc, d) => {
    const key = isoDate(d);
    acc[key] = shifts.filter(s => s.shift_date === key);
    return acc;
  }, {});

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = isoDate(new Date());

  return (
    <>
      <Helmet>
        <title>Team Schedule — IWILLBUILD</title>
        <meta name="description" content="Shift scheduling, time tracking and payroll export for your team." />
        <link rel="canonical" href="https://iwillbuild.com/team/schedule" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <PortalSidebar />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Page header */}
          <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
              <CalendarDays size={18} className="text-orange-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Team Schedule</h1>
              <p className="text-xs text-slate-400">Shifts, time tracking and payroll</p>
            </div>
            <div className="flex-1" />

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
              {([
                { id: 'shifts', label: 'Shifts', icon: CalendarDays },
                { id: 'time',   label: 'Time Tracking', icon: Clock },
                { id: 'payroll', label: 'Payroll Export', icon: DollarSign },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    tab === id ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
                  ].join(' ')}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>

          {migrating && (
            <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-600">
              <Loader2 size={12} className="animate-spin" /> Setting up scheduling tables…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-6 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          {/* ── SHIFTS TAB ─────────────────────────────────────────────────── */}
          {tab === 'shifts' && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Week nav + controls */}
              <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
                <button onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold text-slate-700 min-w-[200px] text-center">
                  {weekDates[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} — {weekDates[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <button onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => setWeekAnchor(new Date())}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors">
                  Today
                </button>

                <div className="flex-1" />

                {/* Member filter */}
                <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:outline-none focus:border-orange-400 bg-white">
                  <option value="">All members</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>

                <button onClick={() => { setEditShift(null); setShowShiftModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors">
                  <Plus size={13} /> Add Shift
                </button>
              </div>

              {/* Weekly grid */}
              <div className="flex-1 overflow-auto p-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 text-slate-400 mt-20">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm">Loading shifts…</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-2 min-w-[700px]">
                    {weekDates.map((d, i) => {
                      const key = isoDate(d);
                      const dayShifts = shiftsByDate[key] ?? [];
                      const isToday = key === today;
                      return (
                        <div key={key} className="flex flex-col gap-1.5">
                          {/* Day header */}
                          <div className={[
                            'text-center py-2 rounded-xl text-xs font-bold border',
                            isToday
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-white text-slate-500 border-slate-200',
                          ].join(' ')}>
                            <div>{DAY_LABELS[i]}</div>
                            <div className={`text-base font-black ${isToday ? 'text-white' : 'text-slate-700'}`}>
                              {d.getDate()}
                            </div>
                          </div>

                          {/* Shifts */}
                          {dayShifts.map(shift => {
                            const sc = STATUS_SHIFT[shift.status] ?? STATUS_SHIFT.scheduled;
                            return (
                              <motion.div
                                key={shift.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`relative rounded-xl border p-2.5 cursor-pointer hover:shadow-sm transition-shadow group ${sc.bg}`}
                                onClick={() => { setEditShift(shift); setShowShiftModal(true); }}
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                                  <span className={`text-[10px] font-bold truncate ${sc.color}`}>{shift.title}</span>
                                </div>
                                <div className="flex items-center gap-1 mb-1">
                                  <Avatar name={shift.member_name} role={shift.member_role} />
                                  <span className="text-[10px] text-slate-600 truncate">{shift.member_name.split(' ')[0]}</span>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}
                                </div>
                                <div className="text-[10px] text-slate-400">{shiftDuration(shift)}</div>

                                {/* Delete button */}
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteShift(shift.id); }}
                                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash2 size={10} />
                                </button>
                              </motion.div>
                            );
                          })}

                          {/* Add shift for this day */}
                          <button
                            onClick={() => {
                              setEditShift({ shift_date: key } as Shift);
                              setShowShiftModal(true);
                            }}
                            className="w-full py-1.5 rounded-xl border border-dashed border-slate-200 text-[10px] text-slate-400 hover:border-orange-300 hover:text-orange-400 transition-colors"
                          >
                            + Add
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TIME TRACKING TAB ──────────────────────────────────────────── */}
          {tab === 'time' && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Controls */}
              <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0 flex-wrap">
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:outline-none focus:border-orange-400 bg-white" />
                <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:outline-none focus:border-orange-400 bg-white">
                  <option value="">All members</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:outline-none focus:border-orange-400 bg-white">
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button onClick={loadTimeEntries} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                  <RefreshCw size={14} />
                </button>
                <div className="flex-1" />
                <button onClick={() => { setEditEntry(null); setShowTimeModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors">
                  <Plus size={13} /> Add Entry
                </button>
              </div>

              {/* Summary bar */}
              <div className="flex items-center gap-6 px-6 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-500">Approved hours:</span>
                  <span className="text-sm font-bold text-slate-700">{totalHours.toFixed(1)}h</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-500">Est. gross pay:</span>
                  <span className="text-sm font-bold text-emerald-600">${totalPay.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" />
                  <span className="text-xs text-slate-500">Pending:</span>
                  <span className="text-sm font-bold text-amber-600">{timeEntries.filter(e => e.status === 'pending').length}</span>
                </div>
              </div>

              {/* Entries table */}
              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 text-slate-400 mt-20">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm">Loading entries…</span>
                  </div>
                ) : timeEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 mt-20 text-slate-400">
                    <Clock size={36} className="text-slate-200" />
                    <p className="text-sm font-semibold">No time entries for this period</p>
                    <button onClick={() => { setEditEntry(null); setShowTimeModal(true); }}
                      className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
                      Add first entry
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                      <tr>
                        {['Member', 'Date', 'Clock In', 'Clock Out', 'Break', 'Total', 'Rate', 'Pay', 'Job', 'Status', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timeEntries.map((entry, i) => {
                        const sc = STATUS_TIME[entry.status] ?? STATUS_TIME.pending;
                        const Icon = sc.icon;
                        const grossPay = entry.hourly_rate && entry.total_minutes
                          ? (entry.total_minutes / 60) * entry.hourly_rate
                          : null;
                        return (
                          <motion.tr
                            key={entry.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={entry.member_name} role={entry.member_role} />
                                <span className="font-semibold text-slate-700 text-xs">{entry.member_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtDate(entry.entry_date)}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{entry.clock_in?.slice(11, 16) ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{entry.clock_out?.slice(11, 16) ?? <span className="text-amber-500">Active</span>}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{entry.break_minutes}m</td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">{fmtMinutes(entry.total_minutes)}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{entry.hourly_rate ? `$${entry.hourly_rate}/h` : '—'}</td>
                            <td className="px-4 py-3 text-xs font-semibold text-emerald-600">{grossPay != null ? `$${grossPay.toFixed(2)}` : '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[100px] truncate">{entry.job_name ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${sc.color}`}>
                                <Icon size={10} /> {sc.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {entry.status === 'pending' && (
                                  <>
                                    <button onClick={() => handleApprove(entry.id, 'approved')}
                                      title="Approve"
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-500 hover:bg-emerald-50 transition-colors">
                                      <Check size={13} />
                                    </button>
                                    <button onClick={() => handleApprove(entry.id, 'rejected')}
                                      title="Reject"
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors">
                                      <X size={13} />
                                    </button>
                                  </>
                                )}
                                <button onClick={() => { setEditEntry(entry); setShowTimeModal(true); }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                                  <Edit2 size={12} />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── PAYROLL EXPORT TAB ─────────────────────────────────────────── */}
          {tab === 'payroll' && (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-2xl mx-auto flex flex-col gap-6">
                {/* Summary card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h2 className="text-base font-bold text-slate-800 mb-4">Payroll Summary</h2>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: 'Approved Hours', value: `${totalHours.toFixed(1)}h`, color: 'text-slate-800', icon: Clock },
                      { label: 'Est. Gross Pay', value: `$${totalPay.toFixed(2)}`, color: 'text-emerald-600', icon: DollarSign },
                      { label: 'Team Members', value: String(new Set(approvedEntries.map(e => e.profile_id)).size), color: 'text-blue-600', icon: Users },
                    ].map(({ label, value, color, icon: Icon }) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={14} className="text-slate-400" />
                          <span className="text-xs text-slate-500">{label}</span>
                        </div>
                        <p className={`text-2xl font-black ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-member breakdown */}
                  {approvedEntries.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Per Member</h3>
                      <div className="flex flex-col gap-2">
                        {Array.from(new Set(approvedEntries.map(e => e.profile_id))).map(pid => {
                          const memberEntries = approvedEntries.filter(e => e.profile_id === pid);
                          const name = memberEntries[0]?.member_name ?? 'Unknown';
                          const role = memberEntries[0]?.member_role ?? 'worker';
                          const mins = memberEntries.reduce((s, e) => s + (e.total_minutes ?? 0), 0);
                          const pay = memberEntries.reduce((s, e) => {
                            if (e.hourly_rate && e.total_minutes) return s + (e.total_minutes / 60) * e.hourly_rate;
                            return s;
                          }, 0);
                          return (
                            <div key={pid} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                              <Avatar name={name} role={role} />
                              <span className="text-sm font-semibold text-slate-700 flex-1">{name}</span>
                              <span className="text-xs text-slate-500">{fmtMinutes(mins)}</span>
                              <span className="text-sm font-bold text-emerald-600 min-w-[70px] text-right">
                                {pay > 0 ? `$${pay.toFixed(2)}` : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Export card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h2 className="text-base font-bold text-slate-800 mb-1">Export CSV</h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Exports all <strong>approved</strong> time entries for the selected month. Compatible with Xero, MYOB, and most payroll systems.
                  </p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Month</label>
                      <input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-orange-400" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Member (optional)</label>
                      <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 focus:outline-none focus:border-orange-400 bg-white">
                        <option value="">All members</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={handleExport}
                      disabled={exporting}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                    >
                      {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {exporting ? 'Exporting…' : 'Download CSV'}
                    </button>
                  </div>

                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500">
                    <strong className="text-slate-600">CSV columns:</strong> Member, Email, Date, Clock In, Clock Out, Break (min), Total Hours, Hourly Rate, Gross Pay, Job, Job Number, Notes, Status
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {(showShiftModal || editShift?.id) && (
          <ShiftModal
            members={members}
            initial={editShift ?? undefined}
            onClose={() => { setShowShiftModal(false); setEditShift(null); }}
            onSave={handleSaveShift}
          />
        )}
        {(showTimeModal || editEntry) && (
          <TimeEntryModal
            members={members}
            initial={editEntry ?? undefined}
            onClose={() => { setShowTimeModal(false); setEditEntry(null); }}
            onSave={handleSaveEntry}
          />
        )}
      </AnimatePresence>
    </>
  );
}
