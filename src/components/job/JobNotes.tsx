import { useState, useEffect, useRef } from 'react';
import { Save, Clock } from 'lucide-react';

interface Props {
  jobId: number;
  initialNotes: string | null;
}

export default function JobNotes({ jobId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const dirty = notes !== savedNotes;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
  }, [notes]);

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSavedNotes(notes);
      setSavedAt(new Date());
    } catch {
      setError('Failed to save notes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Job Notes</h2>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock size={11} />
              Saved {savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <textarea
        ref={textareaRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes for this job — scope, site conditions, client instructions, anything relevant…"
        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none leading-relaxed"
        style={{ minHeight: 200 }}
      />

      {dirty && (
        <p className="text-xs text-amber-600">Unsaved changes — click Save Notes to persist.</p>
      )}
    </div>
  );
}
