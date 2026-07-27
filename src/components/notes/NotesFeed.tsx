/**
 * NotesFeed
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the list of notes with inline task cards and optional comment thread.
 * Each note shows:
 *   - Author avatar + name + timestamp
 *   - Type badge
 *   - Body with @mention chips highlighted
 *   - Inline TagTaskCards for any tasks spawned by this note
 *   - Collapsible comment thread
 */
import { useState } from 'react';
import { MessageSquare, ChevronDown, Send, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TagTaskCard from './TagTaskCard';
import { NOTE_TYPE_META, renderMentions, type Note, type NoteComment, type TagTask } from '@/lib/notes-types';

interface Props {
  notes: Note[];
  currentUserId: string;
  currentUserRole: string;
  onTaskUpdate: (noteId: number, updated: TagTask) => void;
  onCommentAdd: (noteId: number, body: string) => Promise<void>;
  onDeleteNote?: (noteId: number) => void;
}

export default function NotesFeed({ notes, currentUserId, currentUserRole, onTaskUpdate, onCommentAdd, onDeleteNote }: Props) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <MessageSquare size={28} className="text-slate-200" />
        <p className="text-sm font-semibold text-slate-400">No notes yet</p>
        <p className="text-xs text-slate-300">Post the first note above.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onTaskUpdate={(updated) => onTaskUpdate(note.id, updated)}
          onCommentAdd={(body) => onCommentAdd(note.id, body)}
          onDelete={onDeleteNote ? () => onDeleteNote(note.id) : undefined}
        />
      ))}
    </div>
  );
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: Note;
  currentUserId: string;
  currentUserRole: string;
  onTaskUpdate: (updated: TagTask) => void;
  onCommentAdd: (body: string) => Promise<void>;
  onDelete?: () => void;
}

function NoteCard({ note, currentUserId, currentUserRole, onTaskUpdate, onCommentAdd, onDelete }: NoteCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localComments, setLocalComments] = useState<NoteComment[]>(note.comments);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = NOTE_TYPE_META[note.noteType] ?? NOTE_TYPE_META.note;
  // Show delete button to the note author or admins/managers
  const canDelete = onDelete && (
    note.authorUserId === currentUserId ||
    currentUserRole === 'admin' ||
    currentUserRole === 'manager'
  );

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCommentAdd(commentBody.trim());
      setLocalComments((prev) => [
        ...prev,
        {
          id: Date.now(),
          noteId: note.id,
          authorUserId: currentUserId,
          authorName: 'You',
          body: commentBody.trim(),
          createdAt: new Date().toISOString(),
        },
      ]);
      setCommentBody('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`rounded-xl border ${meta.border} ${meta.bg} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        {/* Avatar */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center uppercase">
          {note.authorName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">{note.authorName}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.bg} ${meta.border} ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-[10px] text-slate-500 ml-auto">
              {new Date(note.createdAt).toLocaleString('en-AU', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>
        {/* Delete button — visible to author or admin */}
        {canDelete && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete note"
          >
            <Trash2 size={13} />
          </button>
        )}
        {canDelete && confirmDelete && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => { onDelete?.(); }}
              className="px-2 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-semibold"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-3 pb-2">
        <p
          className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap [&_.mention-chip]:inline-flex [&_.mention-chip]:items-center [&_.mention-chip]:px-1.5 [&_.mention-chip]:py-0.5 [&_.mention-chip]:rounded-full [&_.mention-chip]:bg-primary/10 [&_.mention-chip]:text-primary [&_.mention-chip]:text-xs [&_.mention-chip]:font-semibold"
          dangerouslySetInnerHTML={{ __html: renderMentions(note.body) }}
        />
      </div>

      {/* Inline task cards */}
      {note.tasks.length > 0 && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Tagged tasks ({note.tasks.length})
          </p>
          {note.tasks.map((task) => (
            <TagTaskCard
              key={task.id}
              task={task}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onUpdate={onTaskUpdate}
              showEntityLink={false}
            />
          ))}
        </div>
      )}

      {/* Comment toggle */}
      <div className="border-t border-slate-100">
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-slate-600 hover:text-slate-800 hover:bg-slate-50/60 transition-colors"
        >
          <MessageSquare size={11} />
          {localComments.length > 0
            ? `${localComments.length} comment${localComments.length !== 1 ? 's' : ''}`
            : 'Add comment'}
          <ChevronDown size={10} className={`ml-auto transition-transform ${commentsOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {commentsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 flex flex-col gap-2">
                {/* Existing comments */}
                {localComments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center uppercase mt-0.5">
                      {c.authorName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0 bg-white rounded-lg border border-slate-100 px-2.5 py-1.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold text-slate-600">{c.authorName}</span>
                        <span className="text-[9px] text-slate-300">
                          {new Date(c.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700">{c.body}</p>
                    </div>
                  </div>
                ))}

                {/* Comment input */}
                <form onSubmit={submitComment} className="flex items-end gap-2">
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    className="flex-1 resize-none text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 bg-white"
                  />
                  <button
                    type="submit"
                    disabled={!commentBody.trim() || submitting}
                    className="flex-shrink-0 p-2 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-orange-600 transition-colors"
                  >
                    {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
