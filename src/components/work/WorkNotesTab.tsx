/**
 * WorkNotesTab — company-wide job notes register.
 *
 * Opens immediately with all company job notes (excerpts only).
 * + Add Note opens job picker → existing notes page for that job.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, StickyNote, ChevronDown } from 'lucide-react';
import {
  WorkLoading, WorkError, WorkEmpty, WorkSearchBar, WorkPagination,
  JobChip, BackToJobBanner, fmtDateTime,
} from './WorkShared';
import JobPickerSheet from '@/components/JobPickerSheet';
import { useNavigate } from 'react-router';

interface NoteRow {
  id: number;
  jobId: number | null;
  jobName: string | null;
  jobNumber: string | null;
  noteType: string | null;
  excerpt: string | null;
  authorUserId: string | null;
  authorName: string | null;
  createdAt: string | null;
}

interface Props {
  initialJobId?: number | null;
  initialJobName?: string | null;
}

export default function WorkNotesTab({ initialJobId, initialJobName }: Props) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteRow[]>([]);
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

      const res = await fetch(`/api/work/notes?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNotes(data.notes ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [jobFilter, q]);

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

  function handleJobSelect(job: { id: number; name: string }) {
    setPickerOpen(false);
    navigate(`/jobs/${job.id}/notes`);
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
        <WorkSearchBar value={q} onChange={setQ} placeholder="Search notes…" />
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0 ml-auto"
        >
          <Plus size={13} /> Add Note
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <WorkLoading label="notes" />}
        {!loading && error && <WorkError message={error} onRetry={() => load(null)} />}
        {!loading && !error && notes.length === 0 && (
          <WorkEmpty
            icon={StickyNote}
            title="No notes found"
            subtitle={q ? 'Try adjusting your search.' : 'Add a note to a job to get started.'}
            action={
              <button
                onClick={() => setPickerOpen(true)}
                className="text-xs text-primary underline underline-offset-2 hover:no-underline"
              >
                + Add Note
              </button>
            }
          />
        )}

        {!loading && !error && notes.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Note</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Author</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Created</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {notes.map((n) => (
                    <tr key={n.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-[300px]">
                        <p className="text-foreground text-sm truncate">{n.excerpt ?? '—'}</p>
                        {n.noteType && n.noteType !== 'note' && (
                          <span className="text-[10px] text-muted-foreground capitalize">{n.noteType}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <JobChip jobId={n.jobId} jobName={n.jobName} jobNumber={n.jobNumber} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{n.authorName ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</td>
                      <td className="px-4 py-3">
                        {n.jobId && (
                          <a
                            href={`/jobs/${n.jobId}/notes`}
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
              {notes.map((n) => (
                <div key={n.id} className="px-4 py-3">
                  <p className="text-sm text-foreground line-clamp-2">{n.excerpt ?? '—'}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {n.jobName && <span>{n.jobName}</span>}
                    {n.authorName && <span>by {n.authorName}</span>}
                    <span>{fmtDateTime(n.createdAt)}</span>
                  </div>
                  {n.jobId && (
                    <a
                      href={`/jobs/${n.jobId}/notes`}
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
        title="Add Note"
        subtitle="Select a job to add a note to"
        iconBg="bg-yellow-100"
        iconFg="text-yellow-600"
        Icon={StickyNote}
        onSelect={handleJobSelect}
      />
    </div>
  );
}
