/**
 * TagTaskCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a single tag task with:
 *   - Type badge (todo/action)
 *   - Assignee avatar + name
 *   - Due date + urgency colour
 *   - Complete / Reopen button
 *   - Audit trail (created by, completed by)
 *   - Link to source entity (job/fleet)
 */
import { useState } from 'react';
import { CheckCircle2, Circle, RotateCcw, Calendar, ExternalLink, Loader2, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  type TagTask,
  NOTE_TYPE_META,
  getTaskUrgency,
  URGENCY_META,
} from '@/lib/notes-types';

interface Props {
  task: TagTask;
  currentUserId: string;
  currentUserRole: string;
  onUpdate: (updated: TagTask) => void;
  showEntityLink?: boolean;
}

const ADMIN_ROLES = new Set(['admin', 'owner', 'supervisor']);

export default function TagTaskCard({ task, currentUserId, currentUserRole, onUpdate, showEntityLink }: Props) {
  const [loading, setLoading] = useState(false);

  const isAssignee = task.assigneeUserId === currentUserId;
  const isAdmin = ADMIN_ROLES.has(currentUserRole);
  const canAct = isAssignee || isAdmin;

  const urgency = getTaskUrgency(task.dueDate);
  const urgencyMeta = URGENCY_META[urgency];
  const typeMeta = NOTE_TYPE_META[task.noteType] ?? NOTE_TYPE_META.todo;
  const isCompleted = task.status === 'completed';

  async function toggle() {
    if (!canAct || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tag-tasks/${task.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isCompleted ? 'reopen' : 'complete' }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json() as { task: TagTask };
      onUpdate(data.task);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  const entityHref = task.entityType === 'job'
    ? `/jobs/${task.entityId}?tab=notes`
    : `/fleet/${task.entityId}`;

  return (
    <div className={`rounded-xl border transition-all ${
      isCompleted
        ? 'bg-slate-50 border-slate-100 opacity-70'
        : `${typeMeta.bg} ${typeMeta.border}`
    }`}>
      <div className="flex items-start gap-3 p-3">
        {/* Complete toggle */}
        <button
          type="button"
          onClick={toggle}
          disabled={!canAct || loading}
          title={isCompleted ? 'Reopen task' : 'Mark complete'}
          className={`flex-shrink-0 mt-0.5 transition-colors ${
            canAct ? 'cursor-pointer' : 'cursor-default opacity-40'
          }`}
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin text-slate-400" />
          ) : isCompleted ? (
            <CheckCircle2 size={18} className="text-emerald-500" />
          ) : (
            <Circle size={18} className={typeMeta.color} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {/* Type badge */}
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${typeMeta.bg} ${typeMeta.border} ${typeMeta.color}`}>
              {typeMeta.label}
            </span>

            {/* Urgency badge */}
            {urgency !== 'normal' && !isCompleted && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${urgencyMeta.badge}`}>
                {urgencyMeta.label}
              </span>
            )}

            {/* Entity link */}
            {showEntityLink && task.entityLabel && (
              <Link
                to={entityHref}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-primary transition-colors"
              >
                <ExternalLink size={10} />
                {task.entityLabel}
              </Link>
            )}
          </div>

          {/* Body */}
          <p className={`text-sm leading-snug mb-2 ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {task.noteBody}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-400">
            {/* Assignee */}
            <span className="flex items-center gap-1">
              <User size={10} />
              <span className="font-semibold text-slate-600">{task.assigneeName}</span>
            </span>

            {/* Due date */}
            {task.dueDate && (
              <span className={`flex items-center gap-1 ${urgency !== 'normal' && !isCompleted ? urgencyMeta.badge.split(' ')[1] : ''}`}>
                <Calendar size={10} />
                {new Date(task.dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}

            {/* Created by */}
            <span>by {task.createdByName}</span>

            {/* Completed by */}
            {isCompleted && task.completedByName && (
              <span className="text-emerald-600 font-semibold">
                ✓ {task.completedByName} {task.completedAt ? `· ${new Date(task.completedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Reopen button for completed tasks (admin only) */}
        {isCompleted && isAdmin && (
          <button
            type="button"
            onClick={toggle}
            disabled={loading}
            title="Reopen task"
            className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
