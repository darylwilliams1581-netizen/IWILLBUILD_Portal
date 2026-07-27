/**
 * TasksSchedulerView
 *
 * Renders all company job-tasks in the Scheduler Tasks tab.
 *
 * Layout:
 *  - Scheduled tasks grouped by date (earliest first), with a date header per group
 *  - Unscheduled section at the bottom for tasks with no start/due date
 *  - Clicking any task row opens an inline edit drawer (slide-up on mobile, side panel on desktop)
 *  - Save/complete stays inside Scheduler — no redirect
 *
 * Data:
 *  - Fetches from GET /api/scheduler/tasks (all non-cancelled company tasks + job info)
 *  - Saves via PUT /api/jobs/:jobId/todos/:todoId (same endpoint as Job Detail)
 *
 * Status colours match the Step 3 palette.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckSquare, AlertTriangle, Loader2, AlertCircle,
  Calendar, User, Briefcase, ChevronDown, ChevronUp,
  Check, X, Clock, CircleDashed, CheckCircle2, Ban,
  Pencil, ExternalLink, Plus,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerTask {
  id: number;
  jobId: number;
  jobName: string;
  jobNumber: string | null;
  title: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
  assignedUserId: string | null;
  assignedName: string | null;
  notes: string | null;
  createdAt: string | null;
}

type TaskStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled';

interface Member {
  userId: string;
  name: string;
  role: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function thisSunday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function nextSunday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 7 : 14 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDateShort(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'Completed' || status === 'Cancelled') return false;
  return dueDate < todayStr();
}

function isDueToday(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'Completed' || status === 'Cancelled') return false;
  return dueDate === todayStr();
}

function yearWarning(dateStr: string): string | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(year)) return null;
  const currentYear = new Date().getFullYear();
  if (year < currentYear) return `Year ${year} is in the past`;
  if (year > currentYear + 2) return `Year ${year} is more than 2 years away`;
  return null;
}

/** The "anchor date" for sorting/grouping: prefer dueDate, fall back to startDate */
function anchorDate(t: SchedulerTask): string | null {
  return t.dueDate ?? t.startDate ?? null;
}

const STATUS_META: Record<TaskStatus, { label: string; icon: React.ReactNode; colour: string; bg: string; border: string }> = {
  'Open':        { label: 'Open',        icon: <CircleDashed size={11} />,  colour: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200'  },
  'In Progress': { label: 'In Progress', icon: <Clock size={11} />,         colour: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200'   },
  'Completed':   { label: 'Completed',   icon: <CheckCircle2 size={11} />,  colour: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200'},
  'Cancelled':   { label: 'Cancelled',   icon: <Ban size={11} />,           colour: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200'    },
};

const ALL_STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Completed', 'Cancelled'];

// ─── Date quick-button field ──────────────────────────────────────────────────

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const warn = yearWarning(value);
  const quick = [
    { label: 'Today',     value: todayStr() },
    { label: 'Tomorrow',  value: addDays(1) },
    { label: 'This week', value: thisSunday() },
    { label: 'Next week', value: nextSunday() },
  ];
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <div className="flex flex-wrap gap-1 mb-0.5">
        {quick.map((q) => (
          <button key={q.label} type="button" onClick={() => onChange(q.value)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              value === q.value ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-600'
            }`}>
            {q.label}
          </button>
        ))}
        {value && (
          <button type="button" onClick={() => onChange('')}
            className="px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors flex items-center gap-0.5">
            <X size={9} /> Clear
          </button>
        )}
      </div>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />
      {warn && <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertCircle size={10} /> {warn}</p>}
    </div>
  );
}

// ─── Edit drawer ──────────────────────────────────────────────────────────────

interface EditDrawerProps {
  task: SchedulerTask;
  members: Member[];
  onClose: () => void;
  onSaved: (updated: SchedulerTask) => void;
}

function EditDrawer({ task, members, onClose, onSaved }: EditDrawerProps) {
  const [title,           setTitle]           = useState(task.title);
  const [description,     setDescription]     = useState(task.description ?? '');
  const [startDate,       setStartDate]       = useState(task.startDate ?? '');
  const [dueDate,         setDueDate]         = useState(task.dueDate ?? '');
  const [status,          setStatus]          = useState<TaskStatus>(task.status);
  const [assignedUserId,  setAssignedUserId]  = useState(task.assignedUserId ?? '');
  const [assignedName,    setAssignedName]    = useState(task.assignedName ?? '');
  const [notes,           setNotes]           = useState(task.notes ?? '');
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  function handleAssignee(userId: string) {
    setAssignedUserId(userId);
    setAssignedName(members.find((m) => m.userId === userId)?.name ?? '');
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return; }
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${task.jobId}/todos/${task.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
          status,
          notes: notes.trim() || null,
          assignedUserId: assignedUserId || null,
          assignedName: assignedName || null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { todo: SchedulerTask & { jobName?: string; jobNumber?: string } };
      // Merge back job info (PUT response doesn't include job fields)
      onSaved({ ...data.todo, jobName: task.jobName, jobNumber: task.jobNumber });
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${task.jobId}/todos/${task.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { todo: SchedulerTask };
      onSaved({ ...data.todo, jobName: task.jobName, jobNumber: task.jobNumber });
    } catch {
      setError('Failed to update.');
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end" onClick={onClose}>
      {/* Dim */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel — full-width bottom sheet on mobile, right-side panel on sm+ */}
      <div
        className="relative z-10 bg-white w-full sm:w-[420px] sm:h-full sm:max-h-full overflow-y-auto rounded-t-2xl sm:rounded-none shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <CheckSquare size={16} className="text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 truncate">
              {task.jobNumber ? `#${task.jobNumber} · ` : ''}{task.jobName}
            </p>
            <p className="text-sm font-bold text-slate-800 truncate">Edit Task</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Title <span className="text-red-500">*</span></label>
            <input ref={titleRef} type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') onClose(); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-3">
            <DateField label="Start date (optional)" value={startDate} onChange={setStartDate} />
            <DateField label="Due date (optional)"   value={dueDate}   onChange={setDueDate} />
          </div>

          {/* Status + Assignee */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Assigned to <span className="font-normal text-slate-400">(optional)</span></label>
              <select value={assignedUserId} onChange={(e) => handleAssignee(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                <option value="">— Unassigned —</option>
                {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>

          {/* Job link */}
          <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-100 pt-3">
            <Briefcase size={11} />
            <span>Linked job:</span>
            <Link to={`/jobs/${task.jobId}?tab=tasks`} className="text-orange-600 hover:text-orange-700 font-medium flex items-center gap-0.5" onClick={onClose}>
              {task.jobName} <ExternalLink size={10} />
            </Link>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertCircle size={11} /> {error}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 px-5 py-4 border-t border-slate-200 flex gap-2">
          {task.status !== 'Completed' && (
            <button type="button" onClick={() => void handleComplete()} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors">
              <Check size={12} /> Complete
            </button>
          )}
          <button type="button" onClick={() => void handleSave()} disabled={saving || !title.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition-colors ml-auto">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onEdit }: { task: SchedulerTask; onEdit: () => void }) {
  const overdue  = isOverdue(task.dueDate, task.status);
  const dueToday = isDueToday(task.dueDate, task.status);
  const isTerminal = task.status === 'Completed' || task.status === 'Cancelled';
  const meta = STATUS_META[task.status] ?? STATUS_META['Open'];

  return (
    <button
      type="button"
      onClick={onEdit}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group ${
        overdue  ? 'bg-red-50/60' :
        dueToday ? 'bg-amber-50/60' :
        ''
      }`}
    >
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
        task.status === 'Completed'   ? 'bg-emerald-500' :
        task.status === 'In Progress' ? 'bg-blue-500' :
        task.status === 'Cancelled'   ? 'bg-red-400' :
        overdue                       ? 'bg-red-500' :
        dueToday                      ? 'bg-amber-500' :
        'bg-slate-300'
      }`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title + status badge */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-sm font-semibold leading-snug ${isTerminal ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {task.title}
          </span>
          {task.status !== 'Open' && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${meta.colour} ${meta.bg} ${meta.border}`}>
              {meta.icon} {meta.label}
            </span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{task.description}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          {/* Job */}
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Briefcase size={10} />
            {task.jobNumber ? `#${task.jobNumber} · ` : ''}{task.jobName}
          </span>

          {/* Assignee */}
          {task.assignedName && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <User size={10} /> {task.assignedName}
            </span>
          )}

          {/* Start date */}
          {task.startDate && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar size={10} /> Start: {formatDateShort(task.startDate)}
            </span>
          )}
        </div>
      </div>

      {/* Edit hint */}
      <Pencil size={12} className="shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors mt-1" />
    </button>
  );
}

// ─── Date group header ────────────────────────────────────────────────────────

function DateGroupHeader({ dateStr, count }: { dateStr: string; count: number }) {
  const today    = todayStr();
  const tomorrow = addDays(1);
  const overdue  = dateStr < today;
  const isToday  = dateStr === today;
  const isTomorrow = dateStr === tomorrow;

  let label = formatDate(dateStr);
  if (isToday)    label = `Today — ${formatDate(dateStr)}`;
  if (isTomorrow) label = `Tomorrow — ${formatDate(dateStr)}`;
  if (overdue)    label = `Overdue — ${formatDate(dateStr)}`;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-b border-slate-100 ${
      overdue  ? 'bg-red-50'    :
      isToday  ? 'bg-orange-50' :
      'bg-slate-50'
    }`}>
      <Calendar size={12} className={overdue ? 'text-red-500' : isToday ? 'text-orange-500' : 'text-slate-400'} />
      <span className={`text-xs font-bold ${overdue ? 'text-red-700' : isToday ? 'text-orange-700' : 'text-slate-600'}`}>
        {label}
      </span>
      <span className="ml-auto text-[10px] text-slate-400">{count} task{count !== 1 ? 's' : ''}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  /** If provided, only show tasks for this job */
  filterJobId?: number;
}

export default function TasksSchedulerView({ filterJobId }: Props) {
  const [tasks,    setTasks]    = useState<SchedulerTask[]>([]);
  const [members,  setMembers]  = useState<Member[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [editing,  setEditing]  = useState<SchedulerTask | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [statusFilter, setStatusFilter]   = useState<'all' | 'active' | 'completed'>('active');

  const load = useCallback(async () => {
    try {
      const [tasksRes, membersRes] = await Promise.all([
        fetch('/api/scheduler/tasks', { credentials: 'include' }),
        fetch('/api/team/members',    { credentials: 'include' }),
      ]);
      if (!tasksRes.ok) throw new Error('Failed to load tasks');
      const tasksData = await tasksRes.json() as { tasks: SchedulerTask[] };
      setTasks(tasksData.tasks ?? []);
      if (membersRes.ok) {
        const membersData = await membersRes.json() as { members: Member[] };
        setMembers(membersData.members ?? []);
      }
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(updated: SchedulerTask) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditing(null);
  }

  // Apply job filter if provided
  const allTasks = filterJobId ? tasks.filter((t) => t.jobId === filterJobId) : tasks;

  // Partition
  const activeTasks    = allTasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled');
  const completedTasks = allTasks.filter((t) => t.status === 'Completed');

  const displayTasks = statusFilter === 'completed' ? completedTasks : activeTasks;

  // Split into scheduled (has at least one date) and unscheduled
  const scheduled   = displayTasks.filter((t) => anchorDate(t) !== null);
  const unscheduled = displayTasks.filter((t) => anchorDate(t) === null);

  // Group scheduled by anchor date
  const grouped = new Map<string, SchedulerTask[]>();
  for (const t of scheduled) {
    const key = anchorDate(t)!;
    const arr = grouped.get(key) ?? [];
    arr.push(t);
    grouped.set(key, arr);
  }
  const sortedDates = Array.from(grouped.keys()).sort();

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-orange-500" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4 m-4">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col min-h-0">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0 flex-wrap">
          {/* Status filter */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {([
              { key: 'active',    label: 'Active' },
              { key: 'completed', label: 'Completed' },
              { key: 'all',       label: 'All' },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  statusFilter === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400 ml-auto">
            {activeTasks.length} active · {unscheduled.length} unscheduled
          </span>
        </div>

        {/* ── Empty state ── */}
        {displayTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
              <CheckSquare size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">
              {statusFilter === 'completed' ? 'No completed tasks' : 'No active tasks'}
            </p>
            <p className="text-xs text-slate-400">
              {statusFilter === 'completed'
                ? 'Complete a task in Job Detail to see it here.'
                : 'Create tasks inside a job to see them here.'}
            </p>
          </div>
        )}

        {/* ── Scheduled groups ── */}
        {sortedDates.map((dateStr) => {
          const group = grouped.get(dateStr)!;
          return (
            <div key={dateStr} className="border-b border-slate-100">
              <DateGroupHeader dateStr={dateStr} count={group.length} />
              <div className="divide-y divide-slate-100">
                {group.map((task) => (
                  <TaskRow key={task.id} task={task} onEdit={() => setEditing(task)} />
                ))}
              </div>
            </div>
          );
        })}

        {/* ── Unscheduled section ── */}
        {unscheduled.length > 0 && (
          <div className="border-b border-slate-100">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-amber-700">Unscheduled</span>
              <span className="text-[10px] text-amber-600 ml-1">{unscheduled.length} task{unscheduled.length !== 1 ? 's' : ''}</span>
              <span className="ml-auto text-slate-400">
                {showCompleted ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>
            {showCompleted && (
              <div className="divide-y divide-slate-100">
                {unscheduled.map((task) => (
                  <TaskRow key={task.id} task={task} onEdit={() => setEditing(task)} />
                ))}
              </div>
            )}
            {!showCompleted && (
              <button
                type="button"
                onClick={() => setShowCompleted(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-amber-600 hover:text-amber-700 transition-colors"
              >
                <Plus size={11} /> Show {unscheduled.length} unscheduled task{unscheduled.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Edit drawer ── */}
      {editing && (
        <EditDrawer
          task={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
