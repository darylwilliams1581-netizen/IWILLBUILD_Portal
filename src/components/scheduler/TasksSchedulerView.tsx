/**
 * TasksSchedulerView
 *
 * Renders all company tasks in the Scheduler Tasks tab.
 * Tasks may be linked to a job or be general (no job).
 *
 * Layout:
 *  - Toolbar: status filter + "+ Add Task" button
 *  - Scheduled tasks grouped by anchor date (dueDate ?? startDate)
 *  - Unscheduled section at the bottom
 *  - Clicking any task row opens a centered modal form
 *
 * Data:
 *  - Fetches from GET /api/scheduler/tasks (LEFT JOIN — includes jobless tasks)
 *  - Creates via POST /api/tasks
 *  - Saves via PUT /api/tasks/:id  (works for both job-linked and general tasks)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from "react-router";
import { CheckSquare, AlertTriangle, Loader2, AlertCircle, Calendar, User, Briefcase, ChevronDown, ChevronUp, Check, X, Clock, CircleDashed, CheckCircle2, Ban, Pencil, ExternalLink, Plus, Tag } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerTask {
  id: number;
  jobId: number | null;
  jobName: string | null;
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
interface JobOption {
  id: number;
  name: string;
  jobNumber: string | null;
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
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
function formatDateShort(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
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
const STATUS_META: Record<TaskStatus, {
  label: string;
  icon: React.ReactNode;
  colour: string;
  bg: string;
  border: string;
}> = {
  'Open': {
    label: 'Open',
    icon: <CircleDashed size={11} />,
    colour: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200'
  },
  'In Progress': {
    label: 'In Progress',
    icon: <Clock size={11} />,
    colour: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200'
  },
  'Completed': {
    label: 'Completed',
    icon: <CheckCircle2 size={11} />,
    colour: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200'
  },
  'Cancelled': {
    label: 'Cancelled',
    icon: <Ban size={11} />,
    colour: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200'
  }
};
const ALL_STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Completed', 'Cancelled'];

// ─── Date quick-button field ──────────────────────────────────────────────────

function DateField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const warn = yearWarning(value);
  const quick = [{
    label: 'Today',
    value: todayStr()
  }, {
    label: 'Tomorrow',
    value: addDays(1)
  }, {
    label: 'This week',
    value: thisSunday()
  }, {
    label: 'Next week',
    value: nextSunday()
  }];
  return <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <div className="flex flex-wrap gap-1 mb-0.5">
        {quick.map(q => <button key={q.label} type="button" onClick={() => onChange(q.value)} className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${value === q.value ? 'bg-violet-500 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-violet-700'}`}>
            {q.label}
          </button>)}
        {value && <button type="button" onClick={() => onChange('')} className="px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors flex items-center gap-0.5">
            <X size={9} /> Clear
          </button>}
      </div>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white" />
      {warn && <p className="text-[11px] text-amber-600 flex items-center gap-1">
          <AlertCircle size={10} /> {warn}
        </p>}
    </div>;
}

// ─── Task form state ──────────────────────────────────────────────────────────

interface TaskFormState {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  assignedUserId: string;
  assignedName: string;
  notes: string;
  jobId: number | null;
}

// ─── Centered Task Modal ──────────────────────────────────────────────────────
// Used for both Add (task === null) and Edit (task !== null).

interface TaskModalProps {
  /** null = Add mode, SchedulerTask = Edit mode */
  task: SchedulerTask | null;
  members: Member[];
  jobs: JobOption[];
  onClose: () => void;
  onSaved: (updated: SchedulerTask) => void;
  onCreated: (created: SchedulerTask) => void;
}
function TaskModal({
  task,
  members,
  jobs,
  onClose,
  onSaved,
  onCreated
}: TaskModalProps) {
  const isEdit = task !== null;
  const [form, setForm] = useState<TaskFormState>({
    title: isEdit ? task.title : '',
    description: isEdit ? task.description ?? '' : '',
    startDate: isEdit ? task.startDate ?? '' : '',
    dueDate: isEdit ? task.dueDate ?? '' : '',
    status: isEdit ? task.status : 'Open',
    assignedUserId: isEdit ? task.assignedUserId ?? '' : '',
    assignedName: isEdit ? task.assignedName ?? '' : '',
    notes: isEdit ? task.notes ?? '' : '',
    jobId: isEdit ? task.jobId ?? null : null
  });
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus title on open
  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  function handleAssignee(userId: string) {
    setForm(f => ({
      ...f,
      assignedUserId: userId,
      assignedName: members.find(m => m.userId === userId)?.name ?? ''
    }));
  }
  async function handleSave() {
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        status: form.status,
        notes: form.notes.trim() || null,
        assignedUserId: form.assignedUserId || null,
        assignedName: form.assignedName || null,
        jobId: form.jobId
      };
      if (isEdit) {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          task: SchedulerTask;
        };
        onSaved(data.task);
      } else {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as {
          task: SchedulerTask;
        };
        const job = form.jobId ? jobs.find(j => j.id === form.jobId) : null;
        onCreated({
          ...data.task,
          jobId: form.jobId,
          jobName: data.task.jobName ?? job?.name ?? null,
          jobNumber: data.task.jobNumber ?? job?.jobNumber ?? null
        });
      }
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }
  async function handleComplete() {
    if (!isEdit) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'Completed'
        })
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        task: SchedulerTask;
      };
      onSaved(data.task);
    } catch {
      setError('Failed to mark complete.');
    } finally {
      setCompleting(false);
    }
  }

  // Linked job display helpers
  const linkedJob = form.jobId ? jobs.find(j => j.id === form.jobId) : null;
  const linkedJobLabel = linkedJob ? linkedJob.jobNumber ? `#${linkedJob.jobNumber} · ${linkedJob.name}` : linkedJob.name : null;
  return createPortal(/* Full-screen overlay — click outside to close */<div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose} aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* Modal panel — max-w-lg keeps it compact on desktop */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col" style={{
      maxHeight: 'min(90vh, 760px)'
    }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 shrink-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isEdit ? 'bg-violet-50' : 'bg-emerald-50'}`}>
            {isEdit ? <CheckSquare size={14} className="text-violet-600" /> : <Plus size={14} className="text-emerald-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-tight">
              {isEdit ? 'Edit Task' : 'New Task'}
            </p>
            {isEdit && <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {task.jobId ? (task.jobNumber ? `#${task.jobNumber} · ` : '') + (task.jobName ?? '') : 'General task — no linked job'}
              </p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Title <span className="text-red-400">*</span>
            </label>
            <input ref={titleRef} type="text" value={form.title} onChange={e => setForm(f => ({
            ...f,
            title: e.target.value
          }))} onKeyDown={e => {
            if (e.key === 'Enter') void handleSave();
          }} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white placeholder:text-slate-300" placeholder="e.g. Pick up ute from hire shop" />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Description <span className="text-slate-300 font-normal">optional</span>
            </label>
            <textarea value={form.description} onChange={e => setForm(f => ({
            ...f,
            description: e.target.value
          }))} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none bg-white" placeholder="Add more detail…" />
          </div>

          {/* Dates — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <DateField label="Start date" value={form.startDate} onChange={v => setForm(f => ({
            ...f,
            startDate: v
          }))} />
            <DateField label="Due date" value={form.dueDate} onChange={v => setForm(f => ({
            ...f,
            dueDate: v
          }))} />
          </div>

          {/* Status + Assignee — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({
              ...f,
              status: e.target.value as TaskStatus
            }))} className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Assigned to <span className="text-slate-300 font-normal">optional</span>
              </label>
              <select value={form.assignedUserId} onChange={e => handleAssignee(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
                <option value="">Unassigned</option>
                {members.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Notes <span className="text-slate-300 font-normal">optional</span>
            </label>
            <textarea value={form.notes} onChange={e => setForm(f => ({
            ...f,
            notes: e.target.value
          }))} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none bg-white" placeholder="Internal notes…" />
          </div>

          {/* Linked job — full-width, clearly optional */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Linked job <span className="text-slate-300 font-normal">optional</span>
            </label>
            <select value={form.jobId ?? ''} onChange={e => setForm(f => ({
            ...f,
            jobId: e.target.value === '' ? null : parseInt(e.target.value, 10)
          }))} className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
              <option value="">No linked job — general task</option>
              {jobs.map(j => <option key={j.id} value={j.id}>
                  {j.jobNumber ? `#${j.jobNumber} · ` : ''}{j.name}
                </option>)}
            </select>

            {/* Contextual hint row */}
            {form.jobId === null ? <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Tag size={10} className="shrink-0" />
                This task will be listed under <span className="font-semibold text-violet-500">General</span> — not tied to any job.
              </p> : linkedJobLabel && <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Briefcase size={10} className="shrink-0 text-violet-400" />
                <span>Linked to</span>
                <Link to={`/jobs/${form.jobId}?tab=tasks`} className="text-violet-700 hover:text-violet-800 font-medium flex items-center gap-0.5" onClick={onClose}>
                  {linkedJobLabel} <ExternalLink size={9} />
                </Link>
              </p>}
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertCircle size={11} /> {error}
            </p>}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 rounded-b-xl flex items-center gap-2">
          {/* Complete — only in edit mode when not already complete */}
          {isEdit && task.status !== 'Completed' && <button type="button" onClick={() => void handleComplete()} disabled={completing || saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors">
              {completing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Complete
            </button>}

          {/* Spacer pushes Save + Cancel to the right */}
          <div className="flex-1" />

          <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving || completing || !form.title.trim()} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors shadow-sm">
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            {isEdit ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </div>
    </div>, document.body);
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onEdit
}: {
  task: SchedulerTask;
  onEdit: () => void;
}) {
  const overdue = isOverdue(task.dueDate, task.status);
  const dueToday = isDueToday(task.dueDate, task.status);
  const isTerminal = task.status === 'Completed' || task.status === 'Cancelled';
  const meta = STATUS_META[task.status] ?? STATUS_META['Open'];
  const isGeneral = task.jobId === null;
  return <button type="button" onClick={onEdit} className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group ${overdue ? 'bg-red-50/60' : dueToday ? 'bg-amber-50/60' : ''}`}>
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${task.status === 'Completed' ? 'bg-emerald-500' : task.status === 'In Progress' ? 'bg-blue-500' : task.status === 'Cancelled' ? 'bg-red-400' : overdue ? 'bg-red-500' : dueToday ? 'bg-amber-500' : 'bg-slate-300'}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title + status badge */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`text-sm font-semibold leading-snug ${isTerminal ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {task.title}
          </span>
          {task.status !== 'Open' && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${meta.colour} ${meta.bg} ${meta.border}`}>
              {meta.icon} {meta.label}
            </span>}
        </div>

        {/* Description */}
        {task.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{task.description}</p>}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          {isGeneral ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-600 border border-violet-200">
              <Tag size={9} /> General
            </span> : <span className="flex items-center gap-1 text-xs text-slate-400">
              <Briefcase size={10} />
              {task.jobNumber ? `#${task.jobNumber} · ` : ''}{task.jobName}
            </span>}

          {task.assignedName && <span className="flex items-center gap-1 text-xs text-slate-400">
              <User size={10} /> {task.assignedName}
            </span>}

          {task.startDate && <span className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar size={10} /> Start: {formatDateShort(task.startDate)}
            </span>}
        </div>
      </div>

      {/* Edit hint */}
      <Pencil size={12} className="shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors mt-1" />
    </button>;
}

// ─── Date group header ────────────────────────────────────────────────────────

function DateGroupHeader({
  dateStr,
  count
}: {
  dateStr: string;
  count: number;
}) {
  const today = todayStr();
  const tomorrow = addDays(1);
  const overdue = dateStr < today;
  const isToday = dateStr === today;
  const isTomorrow = dateStr === tomorrow;
  let label = formatDate(dateStr);
  if (isToday) label = `Today — ${formatDate(dateStr)}`;
  if (isTomorrow) label = `Tomorrow — ${formatDate(dateStr)}`;
  if (overdue) label = `Overdue — ${formatDate(dateStr)}`;
  return <div className={`flex items-center gap-2 px-4 py-2 border-b border-slate-100 ${overdue ? 'bg-red-50' : isToday ? 'bg-violet-50' : 'bg-slate-50'}`}>
      <Calendar size={12} className={overdue ? 'text-red-500' : isToday ? 'text-violet-600' : 'text-slate-400'} />
      <span className={`text-xs font-bold ${overdue ? 'text-red-700' : isToday ? 'text-violet-800' : 'text-slate-600'}`}>
        {label}
      </span>
      <span className="ml-auto text-[10px] text-slate-400">{count} task{count !== 1 ? 's' : ''}</span>
    </div>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  /** If provided, only show tasks for this job (used by Job Detail tasks tab) */
  filterJobId?: number;
}
export default function TasksSchedulerView({
  filterJobId
}: Props) {
  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [jobsList, setJobsList] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // null = closed, undefined = add mode, SchedulerTask = edit mode
  const [modalTask, setModalTask] = useState<SchedulerTask | null | undefined>(undefined);
  const isModalOpen = modalTask !== undefined;
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('active');
  const load = useCallback(async () => {
    try {
      const [tasksRes, membersRes, jobsRes] = await Promise.all([fetch('/api/scheduler/tasks', {
        credentials: 'include'
      }), fetch('/api/team/members', {
        credentials: 'include'
      }), fetch('/api/jobs?status=active&pageSize=200', {
        credentials: 'include'
      })]);
      if (!tasksRes.ok) throw new Error('Failed to load tasks');
      const tasksData = (await tasksRes.json()) as {
        tasks: SchedulerTask[];
      };
      setTasks(tasksData.tasks ?? []);
      if (membersRes.ok) {
        const membersData = (await membersRes.json()) as {
          members: Member[];
        };
        setMembers(membersData.members ?? []);
      }
      if (jobsRes.ok) {
        const jobsData = (await jobsRes.json()) as {
          jobs?: JobOption[];
          data?: JobOption[];
        };
        const raw = jobsData.jobs ?? jobsData.data ?? [];
        setJobsList(raw.map(j => ({
          id: j.id,
          name: j.name,
          jobNumber: j.jobNumber ?? null
        })));
      }
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function handleSaved(updated: SchedulerTask) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    setModalTask(undefined);
  }
  function handleCreated(task: SchedulerTask) {
    setTasks(prev => [task, ...prev]);
    setModalTask(undefined);
  }

  // Apply job filter if provided (Job Detail tasks tab)
  const allTasks = filterJobId ? tasks.filter(t => t.jobId === filterJobId) : tasks;
  const activeTasks = allTasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
  const completedTasks = allTasks.filter(t => t.status === 'Completed');
  const displayTasks = statusFilter === 'completed' ? completedTasks : activeTasks;
  const scheduled = displayTasks.filter(t => anchorDate(t) !== null);
  const unscheduled = displayTasks.filter(t => anchorDate(t) === null);
  const grouped = new Map<string, SchedulerTask[]>();
  for (const t of scheduled) {
    const key = anchorDate(t)!;
    const arr = grouped.get(key) ?? [];
    arr.push(t);
    grouped.set(key, arr);
  }
  const sortedDates = Array.from(grouped.keys()).sort();

  // ── Loading / error ──────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-violet-600" size={24} />
      </div>;
  }
  if (error) {
    return <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4 m-4">
        <AlertCircle size={16} /> {error}
      </div>;
  }
  return <>
      <div className="flex flex-col min-h-0">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0 flex-wrap">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {([{
            key: 'active',
            label: 'Active'
          }, {
            key: 'completed',
            label: 'Completed'
          }, {
            key: 'all',
            label: 'All'
          }] as const).map(({
            key,
            label
          }) => <button key={key} onClick={() => setStatusFilter(key)} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${statusFilter === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>)}
          </div>

          <span className="text-xs text-slate-400">
            {activeTasks.length} active · {unscheduled.length} unscheduled
          </span>

          {!filterJobId && <button type="button" onClick={() => setModalTask(null)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-700 transition-colors shadow-sm">
              <Plus size={12} /> Add Task
            </button>}
        </div>

        {/* ── Empty state ── */}
        {displayTasks.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
              <CheckSquare size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">
              {statusFilter === 'completed' ? 'No completed tasks' : 'No active tasks'}
            </p>
            <p className="text-xs text-slate-400 mb-4">
              {statusFilter === 'completed' ? 'Complete a task to see it here.' : filterJobId ? 'Create tasks for this job to see them here.' : 'Use the Add Task button above to create your first task.'}
            </p>
            {!filterJobId && statusFilter !== 'completed' && <button type="button" onClick={() => setModalTask(null)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-700 transition-colors">
                <Plus size={12} /> Add Task
              </button>}
          </div>}

        {/* ── Scheduled groups ── */}
        {sortedDates.map(dateStr => {
        const group = grouped.get(dateStr)!;
        return <div key={dateStr} className="border-b border-slate-100">
              <DateGroupHeader dateStr={dateStr} count={group.length} />
              <div className="divide-y divide-slate-100">
                {group.map(task => <TaskRow key={task.id} task={task} onEdit={() => setModalTask(task)} />)}
              </div>
            </div>;
      })}

        {/* ── Unscheduled section ── */}
        {unscheduled.length > 0 && <div className="border-b border-slate-100">
            <button type="button" onClick={() => setShowUnscheduled(v => !v)} className="w-full flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 hover:bg-amber-100 transition-colors">
              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
              <span className="text-xs font-bold text-amber-700">Unscheduled</span>
              <span className="text-[10px] text-amber-600 ml-1">
                {unscheduled.length} task{unscheduled.length !== 1 ? 's' : ''}
              </span>
              <span className="ml-auto text-slate-400">
                {showUnscheduled ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>
            {showUnscheduled && <div className="divide-y divide-slate-100">
                {unscheduled.map(task => <TaskRow key={task.id} task={task} onEdit={() => setModalTask(task)} />)}
              </div>}
            {!showUnscheduled && <button type="button" onClick={() => setShowUnscheduled(true)} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-amber-600 hover:text-amber-700 transition-colors">
                <Plus size={11} /> Show {unscheduled.length} unscheduled task{unscheduled.length !== 1 ? 's' : ''}
              </button>}
          </div>}
      </div>

      {/* ── Centered task modal (Add + Edit) ── */}
      {isModalOpen && <TaskModal task={modalTask ?? null} members={members} jobs={jobsList} onClose={() => setModalTask(undefined)} onSaved={handleSaved} onCreated={handleCreated} />}
    </>;
}
