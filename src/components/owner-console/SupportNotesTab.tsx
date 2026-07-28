/**
 * SupportNotesTab — Developer Console tab for private support notes.
 * Notes are per-user or per-company, never visible to customers.
 */
import { useState, useEffect, useCallback } from 'react';
import { StickyNote, Plus, Trash2, RefreshCw, Search, User, Building2, Loader2 } from 'lucide-react';

interface SupportNote {
  id: number;
  user_id: string | null;
  company_id: number | null;
  note: string;
  created_by_email: string;
  created_at: string;
}

interface UserOption { userId: string; email: string; name: string | null; companyId: number | null; companyName: string | null; }
interface CompanyOption { id: number; name: string; }

const QUICK_NOTES = [
  'Work email blocks verification emails',
  'Setup support completed via phone',
  'Imported starter pack manually',
  'Called on ' + new Date().toLocaleDateString('en-AU'),
  'Billing issue resolved',
  'Account compromised — password reset forced',
  'User requested account deletion',
];

export default function SupportNotesTab() {
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Form state
  const [targetType, setTargetType] = useState<'user' | 'company'>('user');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load users and companies for the dropdowns
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [uRes, cRes] = await Promise.all([
          fetch('/api/owner-console/users', { credentials: 'include' }),
          fetch('/api/owner-console/companies', { credentials: 'include' }),
        ]);
        if (uRes.ok) {
          const d = await uRes.json();
          setUsers((d.users ?? []).map((u: { userId: string; email: string; name: string | null; companyId: number | null; companyName: string | null }) => ({
            userId: u.userId,
            email: u.email,
            name: u.name,
            companyId: u.companyId,
            companyName: u.companyName,
          })));
        }
        if (cRes.ok) {
          const d = await cRes.json();
          setCompanies((d.companies ?? []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch { /* non-critical */ }
    };
    void loadOptions();
  }, []);

  const loadNotes = useCallback(async () => {
    const id = targetType === 'user' ? selectedUserId : selectedCompanyId;
    if (!id) { setNotes([]); return; }
    setLoading(true);
    try {
      const params = targetType === 'user' ? `userId=${id}` : `companyId=${id}`;
      const res = await fetch(`/api/developer/support-notes?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [targetType, selectedUserId, selectedCompanyId]);

  useEffect(() => { void loadNotes(); }, [selectedUserId, selectedCompanyId, targetType]);

  async function saveNote() {
    if (!noteText.trim()) { setError('Note text is required.'); return; }
    const id = targetType === 'user' ? selectedUserId : selectedCompanyId;
    if (!id) { setError('Select a user or company first.'); return; }
    setSaving(true);
    setError('');
    try {
      const body = targetType === 'user'
        ? { userId: id, note: noteText.trim() }
        : { companyId: Number(id), note: noteText.trim() };
      const res = await fetch('/api/developer/support-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setNoteText('');
        setSuccess('Note saved.');
        setTimeout(() => setSuccess(''), 3000);
        void loadNotes();
      } else {
        const d = await res.json();
        setError(d.error ?? 'Failed to save note.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: number) {
    setDeleting(id);
    try {
      await fetch(`/api/developer/support-notes/${id}`, { method: 'DELETE', credentials: 'include' });
      setNotes(prev => prev.filter(n => n.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  const filteredUsers = users.filter(u =>
    !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.name ?? '').toLowerCase().includes(userSearch.toLowerCase())
  ).slice(0, 50);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <StickyNote size={18} className="text-slate-500" />
          Support Notes
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">Private developer notes on users and companies. Never visible to customers.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Add note */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">Add a note</h3>

          {/* Target type */}
          <div className="flex gap-2">
            <button
              onClick={() => { setTargetType('user'); setSelectedCompanyId(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${targetType === 'user' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <User size={13} /> User
            </button>
            <button
              onClick={() => { setTargetType('company'); setSelectedUserId(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${targetType === 'company' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Building2 size={13} /> Company
            </button>
          </div>

          {/* Target selector */}
          {targetType === 'user' ? (
            <div className="space-y-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search users…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
                />
              </div>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                size={4}
              >
                <option value="">— select user —</option>
                {filteredUsers.map(u => (
                  <option key={u.userId} value={u.userId}>
                    {u.email}{u.name ? ` (${u.name})` : ''}{u.companyName ? ` · ${u.companyName}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <select
              value={selectedCompanyId}
              onChange={e => setSelectedCompanyId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              size={4}
            >
              <option value="">— select company —</option>
              {companies.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Quick notes */}
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Quick notes:</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_NOTES.map(q => (
                <button
                  key={q}
                  onClick={() => setNoteText(q)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Note text */}
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Type your note here…"
            rows={3}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />

          {error && <p className="text-xs text-red-500">{error}</p>}
          {success && <p className="text-xs text-emerald-600">{success}</p>}

          <button
            onClick={saveNote}
            disabled={saving || !noteText.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Save note
          </button>
        </div>

        {/* Right: Notes list */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 text-sm">
              {notes.length > 0 ? `${notes.length} note${notes.length !== 1 ? 's' : ''}` : 'Notes'}
            </h3>
            <button
              onClick={loadNotes}
              disabled={loading}
              className="text-xs text-slate-600 hover:text-slate-800 transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              {selectedUserId || selectedCompanyId ? 'No notes yet.' : 'Select a user or company to see notes.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {notes.map(note => (
                <div key={note.id} className="px-5 py-4 flex gap-3 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-relaxed">{note.note}</p>
                    <div className="text-xs text-slate-400 mt-1.5">
                      {note.created_by_email} · {new Date(note.created_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  <button
                    onClick={() => void deleteNote(note.id)}
                    disabled={deleting === note.id}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all shrink-0 mt-0.5"
                  >
                    {deleting === note.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
