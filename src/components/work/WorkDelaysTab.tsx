/**
 * WorkDelaysTab — company-wide delay/condition register.
 *
 * Opens immediately with all company delays. No entrance job selector.
 * + Report Delay opens job picker → existing job delays page.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Clock, ChevronDown } from 'lucide-react';
import {
  WorkLoading, WorkError, WorkEmpty, WorkSearchBar, WorkPagination,
  StatusBadge, JobChip, BackToJobBanner, fmtDate,
} from './WorkShared';
import JobPickerSheet from '@/components/JobPickerSheet';
import { useNavigate } from 'react-router';

interface DelayRow {
  id: number;
  jobId: number | null;
  jobName: string | null;
  jobNumber: string | null;
  impactSummary: string | null;
  category: string | null;
  entryType: string;
  days: number | null;
  delayDate: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface Props {
  initialJobId?: number | null;
  initialJobName?: string | null;
}

const CATEGORIES = [
  'Weather', 'Material', 'Site access', 'Client / instruction',
  'Labour / subcontractor', 'Plant / equipment', 'Other',
];

export default function WorkDelaysTab({ initialJobId, initialJobName }: Props) {
  const navigate = useNavigate();
  const [delays, setDelays] = useState<DelayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
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
      if (categoryFilter) params.set('category', categoryFilter);
      if (q.trim()) params.set('q', q.trim());

      const res = await fetch(`/api/work/delays?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDelays(data.delays ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [jobFilter, categoryFilter, q]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorStack([]);
      setNextCursor(null);
      load(null);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, categoryFilter, jobFilter, load]);

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
    navigate(`/jobs/${job.id}/delays`);
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
        <WorkSearchBar value={q} onChange={setQ} placeholder="Search delays…" />

        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="appearance-none text-xs bg-muted rounded-lg px-3 py-2 pr-7 text-foreground outline-none cursor-pointer"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0 ml-auto"
        >
          <Plus size={13} /> Report Delay
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <WorkLoading label="delays" />}
        {!loading && error && <WorkError message={error} onRetry={() => load(null)} />}
        {!loading && !error && delays.length === 0 && (
          <WorkEmpty
            icon={Clock}
            title="No delays recorded"
            subtitle={q || categoryFilter ? 'Try adjusting your filters.' : 'Report a delay to get started.'}
            action={
              <button
                onClick={() => setPickerOpen(true)}
                className="text-xs text-primary underline underline-offset-2 hover:no-underline"
              >
                + Report Delay
              </button>
            }
          />
        )}

        {!loading && !error && delays.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Delay / Condition</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Days</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Category</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Reported by</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {delays.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-[240px]">
                        <p className="font-medium text-foreground truncate">{d.impactSummary ?? '—'}</p>
                        {d.notes && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{d.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <JobChip jobId={d.jobId} jobName={d.jobName} jobNumber={d.jobNumber} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(d.delayDate)}</td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {d.days != null ? (Number(d.days) > 0 ? `${d.days}d` : '—') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{d.category ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={d.entryType ?? 'delay'} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{d.createdByName ?? '—'}</td>
                      <td className="px-4 py-3">
                        {d.jobId && (
                          <a
                            href={`/jobs/${d.jobId}/delays`}
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
              {delays.map((d) => (
                <div key={d.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground flex-1 truncate">{d.impactSummary ?? '—'}</p>
                    <StatusBadge status={d.entryType ?? 'delay'} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {d.jobName && <span>{d.jobName}</span>}
                    {d.category && <span>{d.category}</span>}
                    {d.delayDate && <span>{fmtDate(d.delayDate)}</span>}
                    {d.days != null && Number(d.days) > 0 && <span>{d.days}d</span>}
                  </div>
                  {d.jobId && (
                    <a
                      href={`/jobs/${d.jobId}/delays`}
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

      <JobPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Report Delay"
        subtitle="Select a job to report a delay for"
        iconBg="bg-orange-100"
        iconFg="text-orange-600"
        Icon={Clock}
        onSelect={handleJobSelect}
      />
    </div>
  );
}
