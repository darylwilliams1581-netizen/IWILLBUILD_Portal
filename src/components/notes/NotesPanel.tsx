/**
 * NotesPanel — Step 1 refactor
 * ─────────────────────────────────────────────────────────────────────────────
 * Job diary / communication log panel.
 *
 * What changed in Step 1:
 *   - Removed Notes / Tagged Actions tab toggle
 *   - Removed task filter strip
 *   - Removed all task-related state and derived data
 *   - NoteComposer now always posts noteType: 'note'
 *   - Feed replaced with NotesDiaryLog (compact stamped entries + dividers)
 *   - "Note added" flash confirmation after post
 *
 * What is preserved:
 *   - All API calls (GET /api/notes, POST /api/notes, DELETE /api/notes/:id)
 *   - Existing note records (including any todo/action types — displayed as plain text)
 *   - Search bar
 *   - Delete (author / admin / manager only)
 *   - members load (kept for future To-do / Action steps)
 *
 * Deferred to later steps:
 *   - To-do / Action note types
 *   - Tagged task cards
 *   - Comment threads
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Search, X, Plus, CheckCircle2 } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import NoteComposer from './NoteComposer';
import NotesDiaryLog from './NotesDiaryLog';
import { type Note, type NoteType } from '@/lib/notes-types';
import type { MentionMember } from './MentionInput';

interface Props {
  entityType: 'job' | 'fleet';
  entityId: number;
  entityLabel?: string;
  userRole?: string;
}

export default function NotesPanel({ entityType, entityId, entityLabel, userRole = '' }: Props) {
  const { user } = useSession();
  const currentUserId = user?.id ?? '';

  const [notes, setNotes] = useState<Note[]>([]);
  // members kept for future To-do/Action steps — loaded silently
  const [, setMembers] = useState<MentionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [justPosted, setJustPosted] = useState(false);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

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

  // ── Actions ────────────────────────────────────────────────────────────────

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
    setComposerOpen(false);
    // Flash "Note added" for 2 s
    setJustPosted(true);
    setTimeout(() => setJustPosted(false), 2000);
  }

  async function handleDeleteNote(noteId: number) {
    // Optimistic remove
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      // Restore on failure
      void loadNotes();
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredNotes = search
    ? notes.filter((n) =>
        n.body.toLowerCase().includes(search.toLowerCase()) ||
        n.authorName.toLowerCase().includes(search.toLowerCase()),
      )
    : notes;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* ── Toolbar: search + + button ── */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              aria-label="Clear search"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* + / × toggle */}
        <button
          type="button"
          onClick={() => setComposerOpen((v) => !v)}
          title={composerOpen ? 'Close' : 'Add note'}
          aria-label={composerOpen ? 'Close note composer' : 'Add note'}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all ${
            composerOpen
              ? 'bg-slate-200 text-slate-600 rotate-45'
              : 'bg-primary text-white hover:bg-orange-600'
          }`}
          style={{ transition: 'transform 0.18s ease, background 0.15s' }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* ── Composer ── */}
      {composerOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <NoteComposer
            onSubmit={handleSubmit}
            disabled={loading}
          />
        </div>
      )}

      {/* ── "Note added" flash ── */}
      {justPosted && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <CheckCircle2 size={13} />
          Note added
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
          <Loader2 size={15} className="animate-spin" />
          <span className="text-xs">Loading notes…</span>
        </div>
      )}

      {/* ── Diary log ── */}
      {!loading && (
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-1 overflow-hidden">
          <NotesDiaryLog
            notes={filteredNotes}
            currentUserId={currentUserId}
            currentUserRole={userRole}
            onDeleteNote={handleDeleteNote}
          />
        </div>
      )}
    </div>
  );
}
