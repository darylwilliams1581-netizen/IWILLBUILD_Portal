/**
 * WorkProgressTab — company-wide progress register.
 *
 * Shows one summary row per job that has progress lines.
 * + Open Progress opens job picker → existing job progress page.
 * Deferred: Program of Works builder (separate approved build).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, TrendingUp } from 'lucide-react';
import {
  WorkLoading, WorkError, WorkEmpty, WorkSearchBar, WorkPagination,
  StatusBadge, BackToJobBanner, fmtDate,
} from './WorkShared';
import JobPickerSheet from '@/components/JobPickerSheet';
import { useNavigate } from 'react-router';

interface ProgressRow {
  jobId: number;
  jobName: string;
  jobNumber: string | null;
  jobStatus: string;
  scheduledStartDate: string | null;
  expectedCompletionDate: string | null;
  lineCount: number;
  avgPercent: number;
  updatedAt: string | null;
}

interface Props {
  initialJobId?: number | null;
  initialJobName?: string | null;
}

export default function WorkProgressTab({ initialJobId, initialJobName }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [jobFilter, setJobFilter] = useState<number | null>(initialJobId ?? null);
  const [jobFilterName, setJobFilterName] = useState<string | null>(initialJobName ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      if (jobFilter) params.set('jobId', String(jobFilter));
      if (q.trim()) params.set('q', q.trim());

      const res = await fetch(`/api/work/progress?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      if (data.mode === 'single') {
        // Single-job mode: navigate directly
        navigate(`/jobs/${jobFilter}/progress`);
        return;
      }

      setRows(data.jobs ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [jobFilter, q, navigate]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorStack([]);
      setNextCursor(null);
      load(null);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, jobFilter, load]);

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

  function handleJobSelect(job: { id: number }) {
    setPickerOpen(false);
    navigate(`/jobs/${job.id}/progress`);
  }

  return (
    <div className="flex flex-col h-full">
      {jobFilter && (
        <BackToJobBanner
          jobId={jobFilter}
          jobName={jobFilterName}
          onClear={() => { setJobFilter(null); setJobFilterName(null); }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <WorkSearchBar value={q} onChange={setQ} placeholder="Search jobs…" />
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0 ml-auto"
        >
          <Plus size={13} /> Open Progress
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <WorkLoading label="progress" />}
        {!loading && error && <WorkError message={error} onRetry={() => load(null)} />}
        {!loading && !error && rows.length === 0 && (
          <WorkEmpty
            icon={TrendingUp}
            title="No progress records"
            subtitle={q ? 'Try adjusting your search.' : 'Sync estimates to a job to create progress lines.'}
            action={
              <button
                onClick={() => setPickerOpen(true)}
                className="text-xs text-primary underline underline-offset-2 hover:no-underline"
              >
                + Open Progress
              </button>
            }
          />
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Progress</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Lines</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Start</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Expected completion</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Updated</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.jobId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium text-foreground truncate">{r.jobName}</p>
                        {r.jobNumber && (
                          <p className="text-[10px] font-mono text-muted-foreground">{r.jobNumber}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.jobStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(100, r.avgPercent)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-foreground">{r.avgPercent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.lineCount}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.scheduledStartDate)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.expectedCompletionDate)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/jobs/${r.jobId}/progress`}
                          className="text-xs text-primary hover:underline underline-offset-2"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {rows.map((r) => (
                <div key={r.jobId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground flex-1 truncate">{r.jobName}</p>
                    <StatusBadge status={r.jobStatus} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, r.avgPercent)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-foreground shrink-0">{r.avgPercent}%</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {r.jobNumber && <span className="font-mono">{r.jobNumber}</span>}
                    <span>{r.lineCount} lines</span>
                    {r.expectedCompletionDate && <span>Due {fmtDate(r.expectedCompletionDate)}</span>}
                  </div>
                  <a
                    href={`/jobs/${r.jobId}/progress`}
                    className="mt-1 text-xs text-primary hover:underline underline-offset-2 inline-block"
                  >
                    Open progress →
                  </a>
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

      <JobPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Open Progress"
        subtitle="Select a job to view or update its progress"
        iconBg="bg-cyan-100"
        iconFg="text-cyan-600"
        Icon={TrendingUp}
        onSelect={handleJobSelect}
      />
    </div>
  );
}
