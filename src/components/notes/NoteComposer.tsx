/**
 * NoteComposer — Step 1 refactor
 * ─────────────────────────────────────────────────────────────────────────────
 * Simple single-field diary entry composer.
 * Always posts noteType: 'note'. No type selector, no due date, no mentions UI.
 * The API and DB are unchanged — this just drives the plain 'note' path.
 */
import { useState, useRef, useEffect } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { NoteType } from '@/lib/notes-types';

interface Props {
  onSubmit: (data: { noteType: NoteType; body: string; dueDate: string | null }) => Promise<void>;
  disabled?: boolean;
}

export default function NoteComposer({ onSubmit, disabled }: Props) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [body]);

  const canSubmit = body.trim().length > 0 && !submitting && !disabled;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ noteType: 'note', body: body.trim(), dueDate: null });
      setBody('');
      // Reset height after clear
      if (textareaRef.current) textareaRef.current.style.height = '72px';
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter or Cmd+Enter submits
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a note to the job diary…"
        disabled={disabled || submitting}
        rows={3}
        className="w-full resize-none px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors leading-relaxed placeholder:text-slate-400 disabled:opacity-50"
        style={{ minHeight: 72 }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 select-none">
          {typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'}+Enter to post
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Post Note
        </button>
      </div>
    </form>
  );
}
