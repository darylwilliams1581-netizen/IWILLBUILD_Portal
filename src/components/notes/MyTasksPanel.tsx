/**
 * MyTasksPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard widget showing the current user's tagged tasks across all jobs
 * and fleet assets. Supports open/completed toggle, search, and entity links.
 */
import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Loader2, AlertCircle, Search, X, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import TagTaskCard from './TagTaskCard';
import { type TagTask, getTaskUrgency, URGENCY_META } from '@/lib/notes-types';
import { useSession } from '@/lib/auth/auth-client';

interface Props {
  userRole?: string;
}

type StatusFilter = 'open' | 'completed';

export default function MyTasksPanel({ userRole = '' }: Props) {
  const { data: sessionData } = useSession();
  const currentUserId = sessionData?.user?.id ?? '';

  const [tasks, setTasks] = useState<TagTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        mine: 'true',
        status: statusFilter,
        page: String(page),
        limit: '20',
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/tag-tasks?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tasks');
      const data = await res.json() as { tasks: TagTask[]; total: number; pages: number };
      setTasks(data.tasks ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.pages ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => { void load(); }, [load]);

  // Reset page when filter/search changes
  useEffect(() => { setPage(1); }, [statusFilter, search]);

  function handleTaskUpdate(updated: TagTask) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    // If we're in open view and task was completed, remove it after a moment
    if (statusFilter === 'open' && updated.status === 'completed') {
      setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== updated.id)), 800);
    }
  }

  const overdueCount = tasks.filter((t) => getTaskUrgency(t.dueDate) === 'overdue' && t.status === 'open').length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <CheckSquare size={16} className="text-primary" />
        <h3 className="text-sm font-bold text-slate-700">My Tasks</h3>
        {total > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
            {total}
          </span>
        )}
        {overdueCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-bold">
            {overdueCount} overdue
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto text-slate-300 hover:text-slate-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-50 flex-wrap">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['open', 'completed'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-50'
              } ${s === 'completed' ? 'border-l border-slate-200' : ''}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[120px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckSquare size={24} className="text-slate-200" />
            <p className="text-sm font-semibold text-slate-400">
              {statusFilter === 'open' ? 'No open tasks' : 'No completed tasks'}
            </p>
            <p className="text-xs text-slate-300">
              Tasks appear here when someone @mentions you in a to-do or action note.
            </p>
          </div>
        )}

        {!loading && tasks.length > 0 && (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex flex-col gap-1">
                <TagTaskCard
                  task={task}
                  currentUserId={currentUserId}
                  currentUserRole={userRole}
                  onUpdate={handleTaskUpdate}
                  showEntityLink={false}
                />
                {/* Entity link below card */}
                {task.entityLabel && (
                  <Link
                    to={task.entityType === 'job' ? `/jobs/${task.entityId}?tab=notes` : `/fleet/${task.entityId}`}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-primary transition-colors pl-9"
                  >
                    <ExternalLink size={9} />
                    {task.entityType === 'job' ? 'Job' : 'Fleet'}: {task.entityLabel}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              Prev
            </button>
            <span className="text-xs text-slate-400">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
