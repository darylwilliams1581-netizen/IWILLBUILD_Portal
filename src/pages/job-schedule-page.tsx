/**
 * /jobs/:id/schedule — Job milestone timeline.
 * Workers: read-only timeline view.
 * Supervisors/admins: full CRUD — add, edit, delete milestones, drag to reorder.
 * Violet theme to match the Schedule icon tile.
 */
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, CalendarDays, Loader2, Plus, CheckCircle2,
  Clock, Circle, AlertCircle, Pencil, Trash2, X, Save,
  ChevronRight, Flag, Calendar, Home,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job { id: number; name: string; jobNumber?: string | null }

interface Milestone {
  id: number;
  title: string;
  description?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  status: string;
  sort_order: number;
  assigned_to?: string | null;
  color?: string | null;
}

type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; ring: string; dot: string }> = {
  pending:     { label: 'Pending',     icon: Circle,        ring: 'border-gray-300',   dot: 'bg-gray-300' },
  in_progress: { label: 'In Progress', icon: Clock,         ring: 'border-blue-400',   dot: 'bg-blue-400' },
  completed:   { label: 'Completed',   icon: CheckCircle2,  ring: 'border-emerald-500', dot: 'bg-emerald-500' },
  overdue:     { label: 'Overdue',     icon: AlertCircle,   ring: 'border-red-400',    dot: 'bg-red-400' },
};

const COLORS = [
  { value: 'violet', label: 'Violet', cls: 'bg-violet-500' },
  { value: 'blue',   label: 'Blue',   cls: 'bg-blue-500' },
  { value: 'emerald',label: 'Green',  cls: 'bg-emerald-500' },
  { value: 'amber',  label: 'Amber',  cls: 'bg-amber-500' },
  { value: 'red',    label: 'Red',    cls: 'bg-red-500' },
  { value: 'pink',   label: 'Pink',   cls: 'bg-pink-500' },
];

function colorDot(color?: string | null) {
  const c = COLORS.find(x => x.value === color) ?? COLORS[0];
  return c.cls;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(m: Milestone) {
  if (m.status === 'completed') return false;
  if (!m.due_date) return false;
  return new Date(m.due_date) < new Date();
}

function effectiveStatus(m: Milestone): MilestoneStatus {
  if (m.status === 'completed') return 'completed';
  if (isOverdue(m)) return 'overdue';
  return m.status as MilestoneStatus;
}

// ── Milestone form modal ───────────────────────────────────────────────────────

interface MilestoneFormProps {
  initial?: Partial<Milestone>;
  onSave: (data: Partial<Milestone>) => Promise<void>;
  onClose: () => void;
}

function MilestoneForm({ initial, onSave, onClose }: MilestoneFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) ?? '');
  const [dueDate, setDueDate] = useState(initial?.due_date?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<MilestoneStatus>((initial?.status as MilestoneStatus) ?? 'pending');
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? '');
  const [color, setColor] = useState(initial?.color ?? 'violet');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        status,
        assigned_to: assignedTo.trim() || null,
        color,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 -4px 40px rgba(0,0,0,0.15)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-gray-900 font-bold text-base">
              {initial?.id ? 'Edit Milestone' : 'New Milestone'}
            </h2>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Slab pour complete"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional notes…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            </div>

            {/* Dates */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Status</label>
              <div className="flex flex-wrap gap-2">
                {(['pending', 'in_progress', 'completed'] as MilestoneStatus[]).map(s => {
                  const cfg = STATUS_CFG[s];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${status === s ? 'bg-violet-500 border-violet-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      <Icon size={11} /> {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assigned to */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Assigned To</label>
              <input
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Colour</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    className={`w-7 h-7 rounded-full ${c.cls} transition-transform ${color === c.value ? 'ring-2 ring-offset-2 ring-violet-500 scale-110' : 'hover:scale-105'}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!title.trim() || saving}
              className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {initial?.id ? 'Save Changes' : 'Add Milestone'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function JobSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSupervisor, isAdmin } = usePermissions();
  const canEdit = isSupervisor || isAdmin;

  const [job, setJob] = useState<Job | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Milestone | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = () => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/jobs/${id}`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ job?: Job } | Job>)
        .then(data => {
          const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
          setJob(j ?? null);
        }),
      fetch(`/api/jobs/${id}/milestones`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ milestones: Milestone[] }>)
        .then(data => setMilestones(data.milestones ?? [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const addMilestone = async (data: Partial<Milestone>) => {
    const res = await fetch(`/api/jobs/${id}/milestones`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, sort_order: milestones.length }),
    });
    if (res.ok) load();
  };

  const updateMilestone = async (milestoneId: number, data: Partial<Milestone>) => {
    const res = await fetch(`/api/jobs/${id}/milestones/${milestoneId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) load();
  };

  const deleteMilestone = async (milestoneId: number) => {
    if (!confirm('Delete this milestone?')) return;
    setDeletingId(milestoneId);
    try {
      await fetch(`/api/jobs/${id}/milestones/${milestoneId}`, { method: 'DELETE', credentials: 'include' });
      setMilestones(prev => prev.filter(m => m.id !== milestoneId));
    } finally { setDeletingId(null); }
  };

  const quickStatus = async (m: Milestone) => {
    if (!canEdit) return;
    const next: Record<string, string> = { pending: 'in_progress', in_progress: 'completed', completed: 'pending', overdue: 'in_progress' };
    const nextStatus = next[effectiveStatus(m)] ?? 'pending';
    setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, status: nextStatus } : x));
    await fetch(`/api/jobs/${id}/milestones/${m.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
  };

  const title = job ? `${job.name} — Schedule` : 'Job Schedule';
  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const progress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return (
    <div className="flex-1 bg-gray-50 flex flex-col lg:pt-[104px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage the milestone schedule for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/schedule`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* ── Top bar ── */}
      <div
        className="bg-white border-b border-gray-100 flex items-center gap-3 shrink-0 sticky top-0 z-10"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)', paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        <div className="flex items-center gap-3 w-full px-4 py-3">
        <button onClick={() => navigate(`/jobs/${id}`)} className="hidden md:flex w-9 h-9 rounded-xl bg-gray-100 items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </button>
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <button onClick={() => navigate('/home')} className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors touch-manipulation shadow-sm" title="Dashboard"><Home size={18} /></button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate text-center w-full">{job?.name ?? 'Job Schedule'}</h1>
                <div className="hidden md:flex items-center gap-1 text-xs text-gray-400 leading-tight">
                  <button onClick={() => navigate('/jobs')} className="hover:text-violet-600 transition-colors">Jobs</button>
                  <span>/</span>
                  <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-violet-600 transition-colors truncate max-w-[80px]">{job?.name ?? '...'}</button>
                  <span>/</span>
                  <span className="text-gray-500 font-medium">Schedule</span>
                </div>
              </>
            )}
          </div>
        {canEdit && (
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={13} /> Add Milestone
          </button>
        )}
        </div>
      </div>

      {/* ── Mobile bottom bar ── */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100"
        style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={() => navigate(`/jobs/${id}`)} aria-label="Back" className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200 transition-colors touch-manipulation shrink-0">
            <ArrowLeft size={16} />
          </button>
          <button onClick={() => navigate('/home')} aria-label="Dashboard" className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600 active:bg-violet-100 transition-colors touch-manipulation shrink-0">
            <Home size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 font-bold text-sm leading-tight truncate">{job?.name ?? 'Job Schedule'}</p>
          </div>
          {canEdit && (
            <button onClick={() => { setEditTarget(null); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold rounded-lg transition-colors shrink-0">
              <Plus size={13} /> Add
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-violet-400" />
          </div>
        ) : (
          <div className="px-4 py-5 pb-24 max-w-2xl mx-auto w-full space-y-5">

            {/* Progress bar */}
            {milestones.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-700">Overall Progress</span>
                  <span className="text-sm font-bold text-violet-600">{progress}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-violet-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2.5">
                  <span className="text-xs text-gray-400">{completedCount}/{milestones.length} milestones done</span>
                  {milestones.filter(m => isOverdue(m)).length > 0 && (
                    <span className="text-xs text-red-500 font-semibold">
                      {milestones.filter(m => isOverdue(m)).length} overdue
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {milestones.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-14 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                  <CalendarDays size={22} className="text-violet-400" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">No milestones yet</p>
                <p className="text-gray-400 text-xs mt-1">
                  {canEdit ? 'Tap "+ Add Milestone" to build the schedule' : 'No schedule has been set for this job'}
                </p>
              </div>
            )}

            {/* Timeline */}
            {milestones.length > 0 && (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-200 rounded-full" />

                <div className="space-y-3">
                  {milestones.map((m, i) => {
                    const es = effectiveStatus(m);
                    const cfg = STATUS_CFG[es];
                    const StatusIcon = cfg.icon;
                    const dotColor = colorDot(m.color);
                    const isDeleting = deletingId === m.id;

                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex gap-4"
                      >
                        {/* Timeline dot */}
                        <div className="relative z-10 shrink-0 mt-3">
                          <button
                            onClick={() => void quickStatus(m)}
                            disabled={!canEdit}
                            className={`w-10 h-10 rounded-full border-2 ${cfg.ring} bg-white flex items-center justify-center transition-transform ${canEdit ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`}
                            title={canEdit ? 'Click to advance status' : cfg.label}
                          >
                            <StatusIcon size={16} className={
                              es === 'completed' ? 'text-emerald-500' :
                              es === 'in_progress' ? 'text-blue-400' :
                              es === 'overdue' ? 'text-red-400' : 'text-gray-300'
                            } />
                          </button>
                        </div>

                        {/* Card */}
                        <div className="flex-1 bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                          {/* Color accent bar */}
                          <div className={`h-1 ${dotColor}`} />

                          <div className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className={`font-bold text-sm leading-snug ${es === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                  {m.title}
                                </p>
                                {m.description && (
                                  <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{m.description}</p>
                                )}
                              </div>
                              {/* Status badge */}
                              <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                es === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                es === 'in_progress' ? 'bg-blue-50 text-blue-700' :
                                es === 'overdue' ? 'bg-red-50 text-red-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {cfg.label}
                              </span>
                            </div>

                            {/* Meta row */}
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                              {(m.start_date || m.due_date) && (
                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <Calendar size={11} />
                                  {m.start_date && m.due_date
                                    ? `${fmtDate(m.start_date)} → ${fmtDate(m.due_date)}`
                                    : m.due_date
                                    ? `Due ${fmtDate(m.due_date)}`
                                    : `From ${fmtDate(m.start_date)}`
                                  }
                                </div>
                              )}
                              {m.assigned_to && (
                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <Flag size={11} />
                                  {m.assigned_to}
                                </div>
                              )}
                            </div>

                            {/* Actions — supervisors only */}
                            {canEdit && (
                              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50">
                                <button
                                  onClick={() => { setEditTarget(m); setShowForm(true); }}
                                  className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-violet-600 transition-colors"
                                >
                                  <Pencil size={11} /> Edit
                                </button>
                                <span className="text-gray-200">·</span>
                                <button
                                  onClick={() => void deleteMilestone(m.id)}
                                  disabled={isDeleting}
                                  className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                                >
                                  {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                  Delete
                                </button>
                                <div className="flex-1" />
                                <button
                                  onClick={() => void quickStatus(m)}
                                  className="flex items-center gap-1 text-xs font-semibold text-violet-500 hover:text-violet-700 transition-colors"
                                >
                                  <ChevronRight size={11} />
                                  {es === 'completed' ? 'Reopen' : es === 'in_progress' ? 'Mark done' : 'Start'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Milestone form modal ── */}
      {showForm && (
        <MilestoneForm
          initial={editTarget ?? undefined}
          onSave={editTarget
            ? (data) => updateMilestone(editTarget.id, data)
            : (data) => addMilestone(data)
          }
          onClose={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
