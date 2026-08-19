/**
 * WorkTasksTab — company-wide task register.
 *
 * Opens immediately with all company tasks. No entrance job selector.
 * + New Task opens job picker → existing task form.
 * Supports jobId pre-filter from URL.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, CheckSquare, Filter, ChevronDown } from 'lucide-react';
import {
  WorkLoading, WorkError, WorkEmpty, WorkSearchBar, WorkPagination,
  StatusBadge, JobChip, BackToJobBanner, fmtDate,
} from './WorkShared';
import JobPickerSheet from '@/components/JobPickerSheet';
import JobTodos from '@/components/job/JobTodos';

interface Task {
  id: number;
  jobId: number | null;
  jobName: string | null;
  jobNumber: string | null;
  title: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  assignedUserId: string | null;
  assignedName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialJobId?: number | null;
  initialJobName?: string | null;
}

export default function WorkTasksTab({ initialJobId, initialJobName }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [jobFilter, setJobFilter] = useState<number | null>(initialJobId ?? null);
  const [jobFilterName, setJobFilterName] = useState<string | null>(initialJobName ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // Creation flow
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedJobName, setSelectedJobName] = useState<string | null>(null);
  const [showTodosFor, setShowTodosFor] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      if (jobFilter) params.set('jobId', String(jobFilter));
      if (statusFilter) params.set('status', statusFilter);
      if (q.trim()) params.set('q', q.trim());

      const res = await fetch(`/api/work/tasks?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [jobFilter, statusFilter, q]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorStack([]);
      setNextCursor(null);
      load(null);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, statusFilter, jobFilter, load]);

  function handleNext() {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, nextCursor]);
    load(nextCursor);
  }
  function handlePrev() {
    const stack = [...cursorStack];
    stack.pop();
    const prev = stack[stack.length - 1] ?? null;
    setCursorStack(stack);
    load(prev);
  }

  function handleJobSelect(job: { id: number; name: string }) {
    setSelectedJobId(job.id);
    setSelectedJobName(job.name);
    setPickerOpen(false);
    setShowTodosFor(job.id);
  }

  function handleTodosClose() {
    setShowTodosFor(null);
    setSelectedJobId(null);
    setSelectedJobName(null);
    // Refresh list
    setCursorStack([]);
    load(null);
  }

  const isOverdue = (t: Task) =>
    t.dueDate && ['Open', 'In Progress'].includes(t.status) &&
    t.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col h-full">
      {/* Job filter banner */}
      {jobFilter && (
        <BackToJobBanner
          jobId={jobFilter}
          jobName={jobFilterName}
          onClear={() => { setJobFilter(null); setJobFilterName(null); }}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <WorkSearchBar value={q} onChange={setQ} placeholder="Search tasks…" />

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none text-xs bg-muted rounded-lg px-3 py-2 pr-7 text-foreground outline-none cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="overdue">Overdue</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0 ml-auto"
        >
          <Plus size={13} /> New Task
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && <WorkLoading label="tasks" />}
        {!loading && error && <WorkError message={error} onRetry={() => load(null)} />}
        {!loading && !error && tasks.length === 0 && (
          <WorkEmpty
            icon={CheckSquare}
            title="No tasks found"
            subtitle={q || statusFilter ? 'Try adjusting your filters.' : 'Create a task to get started.'}
            action={
              <button
                onClick={() => setPickerOpen(true)}
                className="text-xs text-primary underline underline-offset-2 hover:no-underline"
              >
                + New Task
              </button>
            }
          />
        )}

        {!loading && !error && tasks.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Task</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Assigned to</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Due date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Updated</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-[240px]">
                        <p className="font-medium text-foreground truncate">{t.title}</p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <JobChip jobId={t.jobId} jobName={t.jobName} jobNumber={t.jobNumber} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {t.assignedName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.dueDate ? (
                          <span className={isOverdue(t) ? 'text-destructive font-semibold' : 'text-foreground'}>
                            {fmtDate(t.dueDate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {fmtDate(t.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        {t.jobId && (
                          <a
                            href={`/jobs/${t.jobId}?tab=tasks`}
                            className="text-xs text-primary hover:underline underline-offset-2"
                          >
                            Open
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {tasks.map((t) => (
                <div key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground flex-1">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {t.jobName && <span>{t.jobName}</span>}
                    {t.assignedName && <span>→ {t.assignedName}</span>}
                    {t.dueDate && (
                      <span className={isOverdue(t) ? 'text-destructive font-semibold' : ''}>
                        Due {fmtDate(t.dueDate)}
                      </span>
                    )}
                  </div>
                  {t.jobId && (
                    <a
                      href={`/jobs/${t.jobId}?tab=tasks`}
                      className="mt-1 text-xs text-primary hover:underline underline-offset-2 inline-block"
                    >
                      Open in job →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <WorkPagination
        hasMore={hasMore}
        hasPrev={cursorStack.length > 0}
        onNext={handleNext}
        onPrev={handlePrev}
        loading={loading}
      />

      {/* Job picker for creation */}
      <JobPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="New Task"
        subtitle="Select a job to add a task to"
        iconBg="bg-blue-100"
        iconFg="text-blue-600"
        Icon={CheckSquare}
        onSelect={handleJobSelect}
      />

      {/* Inline task editor — opens after job is selected */}
      {showTodosFor !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4">
          <div
            className="bg-background w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: 'min(90dvh, 700px)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="font-bold text-base">Tasks — {selectedJobName}</h2>
                <p className="text-xs text-muted-foreground">Add or manage tasks for this job</p>
              </div>
              <button
                onClick={handleTodosClose}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <JobTodos jobId={showTodosFor} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
