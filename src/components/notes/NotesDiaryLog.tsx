/**
 * NotesDiaryLog — Step 1 refactor
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders notes as a compact stamped diary / audit log.
 *
 * Each entry:
 *   Note text. [27 Jul 2026, 10:42 am · Daryl Williams]
 *   ─────────────────────────────────────────────────── (solid light-grey divider)
 *
 * - No cards, no badges, no comment threads, no task cards.
 * - Delete is tucked behind a small trash icon, visible to author/admin only.
 * - Confirm-delete is inline (no modal).
 * - Existing notes with noteType 'todo' or 'action' are displayed the same way —
 *   their body text is preserved; the type label is not shown.
 */
import { useState } from 'react';
import { Trash2, MessageSquare } from 'lucide-react';
import type { Note } from '@/lib/notes-types';

interface Props {
  notes: Note[];
  currentUserId: string;
  currentUserRole: string;
  onDeleteNote?: (noteId: number) => void;
}

function formatStamp(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function NotesDiaryLog({ notes, currentUserId, currentUserRole, onDeleteNote }: Props) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <MessageSquare size={26} className="text-slate-200" />
        <p className="text-sm font-semibold text-slate-400">No notes yet</p>
        <p className="text-xs text-slate-300">Post the first entry above to start the job diary.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {notes.map((note, idx) => (
        <DiaryEntry
          key={note.id}
          note={note}
          isLast={idx === notes.length - 1}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onDelete={onDeleteNote ? () => onDeleteNote(note.id) : undefined}
        />
      ))}
    </div>
  );
}

// ── DiaryEntry ────────────────────────────────────────────────────────────────

interface EntryProps {
  note: Note;
  isLast: boolean;
  currentUserId: string;
  currentUserRole: string;
  onDelete?: () => void;
}

function DiaryEntry({ note, isLast, currentUserId, currentUserRole, onDelete }: EntryProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canDelete =
    !!onDelete &&
    (note.authorUserId === currentUserId ||
      currentUserRole === 'admin' ||
      currentUserRole === 'manager');

  const stamp = `${formatStamp(note.createdAt)} · ${note.authorName}`;

  return (
    <div className="group relative">
      {/* Entry row */}
      <div className="flex items-start gap-2 py-2 pr-1">
        {/* Text block */}
        <p className="flex-1 min-w-0 text-sm text-slate-700 leading-snug break-words">
          {note.body}
          {' '}
          <span className="text-[11px] text-slate-400 font-normal whitespace-nowrap">
            [{stamp}]
          </span>
        </p>

        {/* Delete control — only visible on hover (desktop) or always on mobile */}
        {canDelete && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            title="Delete note"
            className="flex-shrink-0 mt-0.5 p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Delete note"
          >
            <Trash2 size={12} />
          </button>
        )}

        {/* Confirm delete */}
        {canDelete && confirmDelete && (
          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
            <button
              type="button"
              onClick={() => { onDelete?.(); setConfirmDelete(false); }}
              className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold leading-tight"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold leading-tight"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Divider — shown between entries, not after the last one */}
      {!isLast && (
        <div
          className="border-t border-slate-100"
          style={{ borderTopStyle: 'solid' }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
