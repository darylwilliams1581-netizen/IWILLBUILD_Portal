/**
 * NoteComposer
 * ─────────────────────────────────────────────────────────────────────────────
 * Compose panel: type selector (note/todo/action), MentionInput, optional
 * due date, submit button. Calls onSubmit with the new note.
 */
import { useState } from 'react';
import { Send, Calendar, Loader2, Info } from 'lucide-react';
import MentionInput, { type MentionMember } from './MentionInput';
import { NOTE_TYPE_META, type NoteType } from '@/lib/notes-types';

interface Props {
  members: MentionMember[];
  onSubmit: (data: { noteType: NoteType; body: string; dueDate: string | null }) => Promise<void>;
  disabled?: boolean;
}

const TYPE_BUTTONS: { type: NoteType; emoji: string }[] = [
  { type: 'note',   emoji: '📝' },
  { type: 'todo',   emoji: '✅' },
  { type: 'action', emoji: '⚡' },
];

export default function NoteComposer({ members, onSubmit, disabled }: Props) {
  const [noteType, setNoteType] = useState<NoteType>('note');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDue, setShowDue] = useState(false);

  const meta = NOTE_TYPE_META[noteType];
  const canSubmit = body.trim().length > 0 && !submitting && !disabled;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ noteType, body: body.trim(), dueDate: dueDate || null });
      setBody('');
      setDueDate('');
      setShowDue(false);
    } finally {
      setSubmitting(false);
    }
  }

  // Detect if body has @mentions (for hint)
  const hasMentions = body.includes('@');
  const isTodoOrAction = noteType === 'todo' || noteType === 'action';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Type selector */}
      <div className="flex gap-1.5">
        {TYPE_BUTTONS.map(({ type, emoji }) => {
          const m = NOTE_TYPE_META[type];
          const active = noteType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setNoteType(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                active
                  ? `${m.bg} ${m.border} ${m.color}`
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <span>{emoji}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Input */}
      <MentionInput
        value={body}
        onChange={setBody}
        members={members}
        placeholder={
          noteType === 'note'
            ? 'Add a note… use @name to mention someone'
            : noteType === 'todo'
              ? 'Describe the to-do… @mention to assign'
              : 'Describe the action item… @mention to assign'
        }
        disabled={disabled || submitting}
        minRows={3}
      />

      {/* Hint: mentions on todo/action create tasks */}
      {hasMentions && isTodoOrAction && (
        <div className="flex items-start gap-2 px-2.5 py-2 bg-blue-50 border border-blue-100 rounded-lg">
          <Info size={11} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-600 leading-relaxed">
            Each @mention will create a tagged task for that person.
          </p>
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center gap-2">
        {/* Due date toggle */}
        {isTodoOrAction && (
          <button
            type="button"
            onClick={() => setShowDue((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              showDue || dueDate
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <Calendar size={12} />
            {dueDate ? new Date(dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'Due date'}
          </button>
        )}

        {showDue && isTodoOrAction && (
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 bg-white"
          />
        )}

        <div className="ml-auto">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              canSubmit
                ? `${meta.bg} ${meta.border} border ${meta.color} hover:opacity-90`
                : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Post {NOTE_TYPE_META[noteType].label}
          </button>
        </div>
      </div>
    </form>
  );
}
