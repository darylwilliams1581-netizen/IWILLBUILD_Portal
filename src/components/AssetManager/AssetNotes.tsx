/**
 * AssetNotes — per-asset note feed (maintenance history, observations, warranty info, etc.)
 * Each note is a timestamped entry. Independent of jobs.
 */
import { useState, useEffect } from 'react';
import { StickyNote, Plus, Trash2, Loader2, Send } from 'lucide-react';

interface AssetNote {
  id: number;
  body: string;
  created_by_name: string | null;
  created_at: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AssetNotes({ assetId }: { assetId: number }) {
  const [notes, setNotes] = useState<AssetNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    load();
    // Get current user name for attribution
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json() as Promise<{ profile?: { name?: string }; user?: { name?: string } }>)
      .then(d => { setUserName(d.profile?.name ?? d.user?.name ?? ''); })
      .catch(() => {});
  }, [assetId]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}/notes`, { credentials: 'include' });
      const d = await r.json() as { notes?: AssetNote[] };
      setNotes(d.notes ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), authorName: userName || undefined }),
      });
      if (r.ok) {
        const d = await r.json() as { note: AssetNote };
        setNotes(prev => [d.note, ...prev]);
        setBody('');
      }
    } finally { setSaving(false); }
  }

  async function deleteNote(id: number) {
    if (!confirm('Delete this note?')) return;
    const r = await fetch(`/api/asset-manager/assets/${assetId}/notes/${id}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (r.ok) setNotes(prev => prev.filter(n => n.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-3xl">
      <h3 className="text-sm font-bold text-slate-700">Notes</h3>

      {/* Compose */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleAdd(); }}
          placeholder="Add a note — maintenance history, warranty info, observations…"
          rows={3}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Cmd+Enter to save</span>
          <button
            onClick={() => void handleAdd()}
            disabled={saving || !body.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            Add Note
          </button>
        </div>
      </div>

      {/* Notes feed */}
      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-slate-300 mb-3"><StickyNote size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No notes yet</p>
          <p className="text-xs text-slate-400 mt-1">Record maintenance history, warranty details, observations</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map(note => (
            <div key={note.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 group hover:border-orange-200 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-700 whitespace-pre-wrap flex-1">{note.body}</p>
                <button
                  onClick={() => void deleteNote(note.id)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  title="Delete note"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {note.created_by_name && (
                  <span className="text-[10px] font-semibold text-slate-400">{note.created_by_name}</span>
                )}
                <span className="text-[10px] text-slate-400">{fmt(note.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
