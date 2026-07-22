/**
 * NotesPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Full notes + tagged tasks panel for a job or fleet entity.
 * Handles:
 *   - DB migration on mount (idempotent)
 *   - Loading notes + tasks
 *   - Posting notes (with @mention → task creation)
 *   - Task complete/reopen
 *   - Comment add
 *   - "Tagged Actions" section (tasks only, filterable)
 *   - Search + filter bar
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Search, X, Filter, StickyNote, CheckSquare, Plus } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import NoteComposer from './NoteComposer';
import NotesFeed from './NotesFeed';
import TagTaskCard from './TagTaskCard';
import { type Note, type TagTask, type NoteType, getTaskUrgency } from '@/lib/notes-types';
import type { MentionMember } from './MentionInput';

interface Props {
  entityType: 'job' | 'fleet';
  entityId: number;
  entityLabel?: string;
  userRole?: string;
}

type ViewMode = 'notes' | 'tasks';
type TaskFilter = 'all' | 'open' | 'completed' | 'mine';

export default function NotesPanel({ entityType, entityId, entityLabel, userRole = '' }: Props) {
  const { data: sessionData } = useSession();
  const currentUserId = sessionData?.user?.id ?? '';

  const [notes, setNotes] = useState<Note[]>([]);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('notes');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('open');
  const [search, setSearch] = useState('');

  // Run migration + load on mount
  useEffect(() => {
    void runMigration();
    void loadMembers();
  }, []);

  useEffect(() => {
    void loadNotes();
  }, [entityType, entityId]);

  async function runMigration() {
    try {
      await fetch('/api/notes/migrate', { method: 'POST', credentials: 'include' });
    } catch { /* non-fatal */ }
  }

  async function loadMembers() {
    try {
      const res = await fetch('/api/team/members', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { members: MentionMember[] };
        setMembers(data.members ?? []);
      }
    } catch { /* non-fatal */ }
  }

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/notes?entityType=${entityType}&entityId=${entityId}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Failed to load notes');
      const data = await res.json() as { notes: Note[] };
      setNotes(data.notes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  async function handleSubmit({ noteType, body, dueDate }: { noteType: NoteType; body: string; dueDate: string | null }) {
    const res = await fetch('/api/notes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType, entityId, entityLabel, noteType, body, dueDate }),
    });
    if (!res.ok) throw new Error('Failed to post note');
    const data = await res.json() as { note: Note };
    setNotes((prev) => [data.note, ...prev]);
  }

  function handleTaskUpdate(noteId: number, updated: TagTask) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, tasks: n.tasks.map((t) => (t.id === updated.id ? updated : t)) }
          : n,
      ),
    );
  }

  async function handleCommentAdd(noteId: number, body: string) {
    const res = await fetch('/api/notes/comments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId, body }),
    });
    if (!res.ok) throw new Error('Failed to add comment');
    const data = await res.json() as { comment: { id: number; noteId: number; authorUserId: string; authorName: string; body: string; createdAt: string } };
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, comments: [...n.comments, data.comment] } : n,
      ),
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  // All tasks across all notes
  const allTasks: TagTask[] = notes.flatMap((n) => n.tasks);

  const filteredTasks = allTasks.filter((t) => {
    if (taskFilter === 'open' && t.status !== 'open') return false;
    if (taskFilter === 'completed' && t.status !== 'completed') return false;
    if (taskFilter === 'mine' && t.assigneeUserId !== currentUserId) return false;
    if (search && !t.noteBody.toLowerCase().includes(search.toLowerCase()) &&
        !t.assigneeName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    // Open first, then by urgency
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    const ua = getTaskUrgency(a.dueDate);
    const ub = getTaskUrgency(b.dueDate);
    const order = { overdue: 0, today: 1, soon: 2, normal: 3 };
    return (order[ua] ?? 3) - (order[ub] ?? 3);
  });

  const filteredNotes = search
    ? notes.filter((n) =>
        n.body.toLowerCase().includes(search.toLowerCase()) ||
        n.authorName.toLowerCase().includes(search.toLowerCase()),
      )
    : notes;

  const openTaskCount = allTasks.filter((t) => t.status === 'open').length;
  const myTaskCount = allTasks.filter((t) => t.assigneeUserId === currentUserId && t.status === 'open').length;

  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">

      {/* ── Toolbar: tabs + search + + button ── */}
      <div className="flex items-center gap-2">
        {/* Tabs */}
        <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('notes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === 'notes' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <StickyNote size={11} /> Notes
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tasks')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors border-l border-slate-200 ${
              viewMode === 'tasks' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <CheckSquare size={11} /> Tagged Actions
            {openTaskCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none ${
                viewMode === 'tasks' ? 'bg-white/20 text-white' : 'bg-primary text-white'
              }`}>
                {openTaskCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* + button */}
        <button
          type="button"
          onClick={() => setComposerOpen((v) => !v)}
          title={composerOpen ? 'Close composer' : 'Add note'}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all ${
            composerOpen
              ? 'bg-slate-200 text-slate-600 rotate-45'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
          style={{ transition: 'transform 0.18s ease, background 0.15s' }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Task filter strip (tasks view only) */}
      {viewMode === 'tasks' && (
        <div className="flex items-center gap-1 flex-wrap">
          <Filter size={11} className="text-slate-400" />
          {(['open', 'completed', 'mine', 'all'] as TaskFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTaskFilter(f)}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                taskFilter === f
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {f === 'mine' ? `Mine${myTaskCount > 0 ? ` (${myTaskCount})` : ''}` : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Composer — slides in when + is tapped */}
      {composerOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <NoteComposer
            members={members}
            onSubmit={async (data) => {
              await handleSubmit(data);
              setComposerOpen(false);
            }}
            disabled={loading}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-1">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
          <Loader2 size={15} className="animate-spin" />
          <span className="text-xs">Loading notes…</span>
        </div>
      )}

      {/* Content */}
      {!loading && viewMode === 'notes' && (
        <NotesFeed
          notes={filteredNotes}
          currentUserId={currentUserId}
          currentUserRole={userRole}
          onTaskUpdate={handleTaskUpdate}
          onCommentAdd={handleCommentAdd}
        />
      )}

      {!loading && viewMode === 'tasks' && (
        <div className="flex flex-col gap-2">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckSquare size={28} className="text-slate-200" />
              <p className="text-sm font-semibold text-slate-400">
                {taskFilter === 'open' ? 'No open tasks' : taskFilter === 'mine' ? 'No tasks assigned to you' : 'No tasks'}
              </p>
              <p className="text-xs text-slate-300">
                Post a to-do or action note with @mentions to create tasks.
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TagTaskCard
                key={task.id}
                task={task}
                currentUserId={currentUserId}
                currentUserRole={userRole}
                onUpdate={(updated) => {
                  // Find which note owns this task
                  const ownerNote = notes.find((n) => n.tasks.some((t) => t.id === updated.id));
                  if (ownerNote) handleTaskUpdate(ownerNote.id, updated);
                }}
                showEntityLink={false}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
