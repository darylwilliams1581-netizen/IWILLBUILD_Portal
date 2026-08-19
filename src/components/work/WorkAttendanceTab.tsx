/**
 * WorkAttendanceTab — company-wide attendance register.
 *
 * Shows currently on-site summary + paginated history.
 * Sign In / Sign Out opens job picker → existing job attendance flow.
 * No QR tokens or private credentials in response.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { LogIn, LogOut, Users, RefreshCw, ChevronDown } from 'lucide-react';
import {
  WorkLoading, WorkError, WorkEmpty, WorkSearchBar, WorkPagination,
  StatusBadge, JobChip, BackToJobBanner, fmtDateTime,
} from './WorkShared';
import JobPickerSheet from '@/components/JobPickerSheet';
import { useNavigate } from 'react-router';

interface OnSiteEntry {
  userId: string;
  jobId: number | null;
  jobName: string | null;
  jobNumber: string | null;
  signedInAt: string | null;
  actorType: string | null;
  source: string | null;
  userName: string | null;
  userEmail: string | null;
}

interface HistoryEntry {
  id: number;
  jobId: number | null;
  jobName: string | null;
  jobNumber: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  action: string;
  source: string | null;
  actorType: string | null;
  notes: string | null;
  createdAt: string | null;
}

interface Props {
  initialJobId?: number | null;
  initialJobName?: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  portal: 'Portal', qr: 'QR scan', manual: 'Manual',
};

export default function WorkAttendanceTab({ initialJobId, initialJobName }: Props) {
  const navigate = useNavigate();
  const [onSite, setOnSite] = useState<OnSiteEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [jobFilter, setJobFilter] = useState<number | null>(initialJobId ?? null);
  const [jobFilterName, setJobFilterName] = useState<string | null>(initialJobName ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAction, setPickerAction] = useState<'signin' | 'signout'>('signin');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      if (jobFilter) params.set('jobId', String(jobFilter));
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/work/attendance?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOnSite(data.currentlyOnSite ?? []);
      setHistory(data.history ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [jobFilter, statusFilter]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorStack([]);
      setNextCursor(null);
      load(null);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [statusFilter, jobFilter, load]);

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
    navigate(`/jobs/${job.id}?tab=attendance`);
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none text-xs bg-muted rounded-lg px-3 py-2 pr-7 text-foreground outline-none cursor-pointer"
          >
            <option value="">All actions</option>
            <option value="signed_in">Sign-ins only</option>
            <option value="signed_out">Sign-outs only</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        <button
          onClick={() => load(null)}
          className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
          title="Refresh"
          aria-label="Refresh attendance"
        >
          <RefreshCw size={13} />
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => { setPickerAction('signin'); setPickerOpen(true); }}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
          >
            <LogIn size={13} /> Sign In
          </button>
          <button
            onClick={() => { setPickerAction('signout'); setPickerOpen(true); }}
            className="flex items-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-border"
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <WorkLoading label="attendance" />}
        {!loading && error && <WorkError message={error} onRetry={() => load(null)} />}

        {!loading && !error && (
          <>
            {/* Currently on site */}
            {onSite.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                  Currently on site — {onSite.length} worker{onSite.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {onSite.map((e, i) => (
                    <div
                      key={`${e.userId}-${e.jobId}-${i}`}
                      className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5"
                    >
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-green-800 truncate">
                          {e.userName ?? e.userEmail ?? e.userId}
                        </p>
                        {e.jobName && (
                          <p className="text-[10px] text-green-600 truncate">{e.jobName}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {history.length === 0 ? (
              <WorkEmpty
                icon={Users}
                title="No attendance records"
                subtitle="Sign in to a job to start tracking attendance."
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Worker</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Job</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Action</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Source</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Time</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground text-sm">
                              {h.userName ?? h.userEmail ?? h.userId}
                            </p>
                            {h.actorType && (
                              <p className="text-[10px] text-muted-foreground capitalize">{h.actorType}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <JobChip jobId={h.jobId} jobName={h.jobName} jobNumber={h.jobNumber} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={h.action} />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {SOURCE_LABELS[h.source ?? ''] ?? h.source ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {fmtDateTime(h.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            {h.jobId && (
                              <a
                                href={`/jobs/${h.jobId}?tab=attendance`}
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
                  {history.map((h) => (
                    <div key={h.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm text-foreground">
                          {h.userName ?? h.userEmail ?? h.userId}
                        </p>
                        <StatusBadge status={h.action} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {h.jobName && <span>{h.jobName}</span>}
                        <span>{fmtDateTime(h.createdAt)}</span>
                        {h.source && <span>{SOURCE_LABELS[h.source] ?? h.source}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
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
        title={pickerAction === 'signin' ? 'Sign In' : 'Sign Out'}
        subtitle={`Select a job to ${pickerAction === 'signin' ? 'sign in to' : 'sign out of'}`}
        iconBg={pickerAction === 'signin' ? 'bg-green-100' : 'bg-gray-100'}
        iconFg={pickerAction === 'signin' ? 'text-green-600' : 'text-gray-600'}
        Icon={pickerAction === 'signin' ? LogIn : LogOut}
        onSelect={handleJobSelect}
      />
    </div>
  );
}
