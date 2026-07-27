/**
 * JobTodos — full task editor for a job
 *
 * Fields: title, description, start date (optional), due date (optional),
 *         status (Open / In Progress / Completed / Cancelled), assigned person,
 *         notes/comments.
 *
 * Date UX:
 *  - Quick buttons: Today, Tomorrow, This week, Next week
 *  - No date → displayed as "Unscheduled"
 *  - Year-warning if the entered year looks wrong (< current year or > current+2)
 *  - Bad dates never silently disappear — shown as-is with a warning
 *
 * Behaviour:
 *  - Create / edit stays in-context (no redirect)
 *  - Completing a task updates the same record in-place
 *  - Existing records (old schema: no description/assignee/startDate) load fine
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Check, AlertCircle, Calendar, ChevronDown, ChevronUp,
  Pencil, User, Clock, X, CheckCircle2, CircleDashed, Ban, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: number;
  jobId: number;
  title: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
  assignedUserId: string | null;
  assignedName: string | null;
  notes: string | null;
  createdAt: string;
}

type TaskStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled';

interface Member {
  userId: string;
  name: string;
  role: string;
}

interface Props {
  jobId: number;
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

/** Monday of the current week */
function thisMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Monday of next week */
function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Sunday of the current week */
function thisSunday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Sunday of next week */
function nextSunday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 7 : 14 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d; // malformed — show raw
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

/**
 * Returns a warning string if the year looks suspicious, otherwise null.
 */
function yearWarning(dateStr: string): string | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(year)) return null;
  const currentYear = new Date().getFullYear();
  if (year < currentYear) return `Year ${year} is in the past — is that right?`;
  if (year > currentYear + 2) return `Year ${year} is more than 2 years away — is that right?`;
  return null;
}

const STATUS_META: Record<TaskStatus, { label: string; icon: React.ReactNode; colour: string; bg: string; border: string }> = {
  'Open':        { label: 'Open',        icon: <CircleDashed size={12} />,  colour: 'text-slate-600',  bg: 'bg-slate-50',   border: 'border-slate-200' },
  'In Progress': { label: 'In Progress', icon: <Clock size={12} />,         colour: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'  },
  'Completed':   { label: 'Completed',   icon: <CheckCircle2 size={12} />,  colour: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200'},
  'Cancelled':   { label: 'Cancelled',   icon: <Ban size={12} />,           colour: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200'   },
};

const ALL_STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Completed', 'Cancelled'];

// ─── Date field with quick-buttons ────────────────────────────────────────────

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}

function DateField({ label, value, onChange, optional = true }: DateFieldProps) {
  const warn = yearWarning(value);

  const quickButtons = [
    { label: 'Today',     value: todayStr() },
    { label: 'Tomorrow',  value: addDays(1) },
    { label: 'This week', value: thisSunday() },
    { label: 'Next week', value: nextSunday() },
  ];

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-muted-foreground">
        {label}{optional && <span className="font-normal text-muted-foreground/60 ml-1">(optional)</span>}
      </label>
      {/* Quick buttons */}
      <div className="flex flex-wrap gap-1 mb-1">
        {quickButtons.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange(q.value)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              value === q.value
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-600 border-slate-200 hover:border-primary/50 hover:text-primary'
            }`}
          >
            {q.label}
          </button>
        ))}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors flex items-center gap-0.5"
          >
            <X size={9} /> Clear
          </button>
        )}
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
      />
      {warn && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
          <AlertCircle size={10} /> {warn}
        </p>
      )}
    </div>
  );
}

// ─── Task form (create or edit) ───────────────────────────────────────────────

interface TaskFormProps {
  initial?: Partial<Task>;
  members: Member[];
  onSave: (data: TaskFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  submitLabel?: string;
}

interface TaskFormData {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  assignedUserId: string;
  assignedName: string;
  notes: string;
}

function TaskForm({ initial, members, onSave, onCancel, saving, submitLabel = 'Add Task' }: TaskFormProps) {
  const [title, setTitle]             = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startDate, setStartDate]     = useState(initial?.startDate ?? '');
  const [dueDate, setDueDate]         = useState(initial?.dueDate ?? '');
  const [status, setStatus]           = useState<TaskStatus>((initial?.status as TaskStatus) ?? 'Open');
  const [assignedUserId, setAssignedUserId] = useState(initial?.assignedUserId ?? '');
  const [assignedName, setAssignedName]     = useState(initial?.assignedName ?? '');
  const [notes, setNotes]             = useState(initial?.notes ?? '');
  const [formError, setFormError]     = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  function handleAssignee(userId: string) {
    setAssignedUserId(userId);
    const member = members.find((m) => m.userId === userId);
    setAssignedName(member?.name ?? '');
  }

  async function handleSubmit() {
    if (!title.trim()) { setFormError('Title is required.'); return; }
    setFormError('');
    await onSave({ title, description, startDate, dueDate, status, assignedUserId, assignedName, notes });
  }

  return (
    <div className="border border-primary/30 rounded-xl p-4 flex flex-col gap-3 bg-muted/20 shadow-sm">
      {/* Title */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1 block">
          Task title <span className="text-red-500">*</span>
        </label>
        <input
          ref={titleRef}
          type="text"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); if (e.key === 'Escape') onCancel(); }}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1 block">
          Description <span className="font-normal text-muted-foreground/60">(optional)</span>
        </label>
        <textarea
          placeholder="More detail about this task…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>

      {/* Dates — side by side on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DateField label="Start date" value={startDate} onChange={setStartDate} optional />
        <DateField label="Due date"   value={dueDate}   onChange={setDueDate}   optional />
      </div>

      {/* Status + Assignee — side by side on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Status */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </div>

        {/* Assigned person */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">
            Assigned to <span className="font-normal text-muted-foreground/60">(optional)</span>
          </label>
          <select
            value={assignedUserId}
            onChange={(e) => handleAssignee(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
          >
            <option value="">— Unassigned —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1 block">
          Notes / comments <span className="font-normal text-muted-foreground/60">(optional)</span>
        </label>
        <textarea
          placeholder="Any additional notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>

      {formError && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle size={11} /> {formError}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving || !title.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Task row (read mode) ─────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: TaskStatus) => void;
}

function TaskRow({ task, onEdit, onDelete, onStatusChange }: TaskRowProps) {
  const overdue  = isOverdue(task.dueDate, task.status);
  const dueToday = isDueToday(task.dueDate, task.status);
  const isTerminal = task.status === 'Completed' || task.status === 'Cancelled';
  const meta = STATUS_META[task.status] ?? STATUS_META['Open'];

  // Quick-complete: clicking the checkbox toggles Open↔Completed
  function handleCheckbox() {
    onStatusChange(task.status === 'Completed' ? 'Open' : 'Completed');
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors group ${
      isTerminal ? 'bg-muted/20 border-border opacity-60' :
      overdue    ? 'bg-red-50 border-red-200' :
      dueToday   ? 'bg-amber-50 border-amber-200' :
                   'bg-white border-border hover:bg-muted/10'
    }`}>
      {/* Checkbox */}
      <button
        type="button"
        onClick={handleCheckbox}
        title={task.status === 'Completed' ? 'Mark open' : 'Mark complete'}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
          task.status === 'Completed'
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-border hover:border-primary'
        }`}
      >
        {task.status === 'Completed' && <Check size={11} className="text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title + status badge */}
        <div className="flex items-start gap-2 flex-wrap">
          <p className={`text-sm font-medium leading-snug ${isTerminal ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {task.title}
          </p>
          {/* Status badge (only show non-Open) */}
          {task.status !== 'Open' && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${meta.colour} ${meta.bg} ${meta.border}`}>
              {meta.icon} {meta.label}
            </span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
        )}

        {/* Dates row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          {task.startDate && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar size={10} />
              Start: {formatDate(task.startDate)}
            </span>
          )}
          {task.dueDate ? (
            <span className={`flex items-center gap-1 text-xs font-medium ${
              overdue ? 'text-red-600' : dueToday ? 'text-amber-700' : 'text-muted-foreground'
            }`}>
              <Calendar size={10} />
              {overdue ? 'Overdue — ' : dueToday ? 'Due today — ' : 'Due: '}
              {formatDate(task.dueDate)}
            </span>
          ) : (
            !isTerminal && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/50 italic">
                <Calendar size={10} /> Unscheduled
              </span>
            )
          )}
        </div>

        {/* Assignee */}
        {task.assignedName && (
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <User size={10} />
            {task.assignedName}
          </div>
        )}

        {/* Notes */}
        {task.notes && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed italic">{task.notes}</p>
        )}
      </div>

      {/* Row actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JobTodos({ jobId }: Props) {
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [members, setMembers]           = useState<Member[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [adding, setAdding]             = useState(false);
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  // Load tasks + team members in parallel
  const load = useCallback(async () => {
    try {
      const [tasksRes, membersRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/todos`, { credentials: 'include' }),
        fetch('/api/team/members', { credentials: 'include' }),
      ]);
      if (!tasksRes.ok) throw new Error('Failed to load tasks');
      const tasksData = await tasksRes.json() as { todos: Task[] };
      setTasks(tasksData.todos ?? []);

      if (membersRes.ok) {
        const membersData = await membersRes.json() as { members: Member[] };
        setMembers(membersData.members ?? []);
      }
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────
  async function handleCreate(data: TaskFormData) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate || null,
          startDate: data.startDate || null,
          notes: data.notes || null,
          assignedUserId: data.assignedUserId || null,
          assignedName: data.assignedName || null,
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json() as { todo: Task };
      setTasks((prev) => [...prev, result.todo]);
      setAdding(false);
    } catch {
      setError('Failed to add task.');
    } finally {
      setSaving(false);
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  async function handleUpdate(id: number, data: TaskFormData) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate || null,
          startDate: data.startDate || null,
          status: data.status,
          notes: data.notes || null,
          assignedUserId: data.assignedUserId || null,
          assignedName: data.assignedName || null,
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json() as { todo: Task };
      setTasks((prev) => prev.map((t) => (t.id === id ? result.todo : t)));
      setEditingId(null);
    } catch {
      setError('Failed to save task.');
    } finally {
      setSaving(false);
    }
  }

  // ── Quick status change (checkbox / status dropdown) ────────────────────────
  async function handleStatusChange(id: number, status: TaskStatus) {
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json() as { todo: Task };
      setTasks((prev) => prev.map((t) => (t.id === id ? result.todo : t)));
    } catch {
      setError('Failed to update task.');
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!confirm('Delete this task?')) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError('Failed to delete task.');
    }
  }

  // ── Partition ───────────────────────────────────────────────────────────────
  const active   = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled');
  const terminal = tasks.filter((t) => t.status === 'Completed' || t.status === 'Cancelled');

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Tasks</h2>
          {active.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
              {active.length}
            </span>
          )}
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => { setAdding(true); setEditingId(null); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-orange-600 transition-colors"
          >
            <Plus size={12} /> Add Task
          </button>
        )}
      </div>

      {/* Global error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {/* Add form */}
      {adding && (
        <TaskForm
          members={members}
          onSave={handleCreate}
          onCancel={() => { setAdding(false); setError(''); }}
          saving={saving}
          submitLabel="Add Task"
        />
      )}

      {/* Active tasks */}
      {active.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Check size={18} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">No open tasks</p>
          <p className="text-xs text-muted-foreground">Click Add Task to create one.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((task) =>
            editingId === task.id ? (
              <TaskForm
                key={task.id}
                initial={task}
                members={members}
                onSave={(data) => handleUpdate(task.id, data)}
                onCancel={() => { setEditingId(null); setError(''); }}
                saving={saving}
                submitLabel="Save Changes"
              />
            ) : (
              <TaskRow
                key={task.id}
                task={task}
                onEdit={() => { setEditingId(task.id); setAdding(false); setError(''); }}
                onDelete={() => void handleDelete(task.id)}
                onStatusChange={(s) => void handleStatusChange(task.id, s)}
              />
            )
          )}
        </div>
      )}

      {/* Completed / Cancelled toggle */}
      {terminal.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowTerminal((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {showTerminal ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showTerminal ? 'Hide' : 'Show'} completed / cancelled ({terminal.length})
          </button>
          {showTerminal && (
            <div className="flex flex-col gap-2 mt-2">
              {terminal.map((task) =>
                editingId === task.id ? (
                  <TaskForm
                    key={task.id}
                    initial={task}
                    members={members}
                    onSave={(data) => handleUpdate(task.id, data)}
                    onCancel={() => { setEditingId(null); setError(''); }}
                    saving={saving}
                    submitLabel="Save Changes"
                  />
                ) : (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onEdit={() => { setEditingId(task.id); setAdding(false); setError(''); }}
                    onDelete={() => void handleDelete(task.id)}
                    onStatusChange={(s) => void handleStatusChange(task.id, s)}
                  />
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
