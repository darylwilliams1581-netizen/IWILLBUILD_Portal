/**
 * DazzaKnowledgePanel
 * Owner/Admin only — manage Dazza AI knowledge entries.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  Save,
  FileText,
} from 'lucide-react';

export interface KnowledgeEntry {
  id: number;
  title: string;
  category: string;
  content: string;
  source_name: string | null;
  active: number | boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  'Company procedure',
  'Safety / WHS',
  'Estimating',
  'Forms',
  'Fleet',
  'Building standards',
  'Custom',
];

const CATEGORY_COLORS: Record<string, string> = {
  'Company procedure': 'bg-blue-50 text-blue-700 border-blue-200',
  'Safety / WHS':      'bg-red-50 text-red-700 border-red-200',
  'Estimating':        'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Forms':             'bg-purple-50 text-purple-700 border-purple-200',
  'Fleet':             'bg-amber-50 text-amber-700 border-amber-200',
  'Building standards':'bg-slate-100 text-slate-700 border-slate-300',
  'Custom':            'bg-orange-50 text-orange-700 border-orange-200',
};

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

interface EntryFormState {
  title: string;
  category: string;
  content: string;
  source_name: string;
  active: boolean;
}

const EMPTY_FORM: EntryFormState = {
  title: '',
  category: 'Company procedure',
  content: '',
  source_name: '',
  active: true,
};

interface Props {
  isAdmin: boolean;
}

export default function DazzaKnowledgePanel({ isAdmin }: Props) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrated, setMigrated] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedId, setSavedId] = useState<number | null>(null);

  // Expanded entries
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Delete confirm
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const runMigration = useCallback(async () => {
    try {
      await fetch('/api/migrate-dazza-knowledge', { method: 'POST', credentials: 'include' });
      setMigrated(true);
    } catch {
      setMigrated(true); // proceed anyway — table may already exist
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dazza/knowledge', { credentials: 'include' });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to load');
      }
      const d = await res.json() as { entries: KnowledgeEntry[] };
      setEntries(d.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load knowledge entries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runMigration().then(() => loadEntries());
  }, [runMigration, loadEntries]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError('');
    setShowForm(true);
  }

  function openEdit(entry: KnowledgeEntry) {
    setForm({
      title: entry.title,
      category: entry.category,
      content: entry.content,
      source_name: entry.source_name ?? '',
      active: entry.active === 1 || entry.active === true,
    });
    setEditingId(entry.id);
    setSaveError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError('');
  }

  async function handleSave() {
    if (!form.title.trim()) { setSaveError('Title is required'); return; }
    if (!form.content.trim()) { setSaveError('Content is required'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        title: form.title.trim(),
        category: form.category,
        content: form.content.trim(),
        source_name: form.source_name.trim() || null,
        active: form.active,
      };
      const url = editingId ? `/api/dazza/knowledge/${editingId}` : '/api/dazza/knowledge';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      const d = await res.json() as { entry: KnowledgeEntry };
      if (editingId) {
        setEntries((prev) => prev.map((e) => e.id === editingId ? d.entry : e));
      } else {
        setEntries((prev) => [...prev, d.entry]);
        setSavedId(d.entry.id);
        setTimeout(() => setSavedId(null), 2500);
      }
      cancelForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(entry: KnowledgeEntry) {
    const newActive = !(entry.active === 1 || entry.active === true);
    try {
      await fetch(`/api/dazza/knowledge/${entry.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: entry.title,
          category: entry.category,
          content: entry.content,
          source_name: entry.source_name,
          active: newActive,
        }),
      });
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, active: newActive ? 1 : 0 } : e));
    } catch { /* silent */ }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/dazza/knowledge/${id}`, { method: 'DELETE', credentials: 'include' });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setDeletingId(null);
    } catch { /* silent */ }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, KnowledgeEntry[]>>((acc, cat) => {
    acc[cat] = entries.filter((e) => e.category === cat);
    return acc;
  }, {});

  if (!migrated || loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading knowledge base…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <BookOpen size={15} className="text-primary" />
            Company Knowledge Base
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Dazza uses these notes to give more relevant, company-specific answers. Labelled "From company knowledge:" in responses.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-primary hover:bg-orange-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0"
          >
            <Plus size={13} />
            Add entry
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && isAdmin && (
        <div className="bg-white border border-primary/30 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm text-slate-800">
              {editingId ? 'Edit knowledge entry' : 'Add knowledge entry'}
            </p>
            <button onClick={cancelForm} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Title *</label>
              <input
                className={inputClass}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Site induction procedure"
                maxLength={255}
              />
            </div>
            <div>
              <label className={labelClass}>Category *</label>
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Content *</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={6}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Enter the knowledge content. Be specific — Dazza will quote this directly when relevant."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className={labelClass}>Source / file name</label>
              <input
                className={inputClass}
                value={form.source_name}
                onChange={(e) => setForm((f) => ({ ...f, source_name: e.target.value }))}
                placeholder="e.g. SWMS-001.pdf, Company handbook"
                maxLength={255}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                className={`transition-colors ${form.active ? 'text-primary' : 'text-slate-300'}`}
              >
                {form.active ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
              <span className="text-xs text-slate-500">{form.active ? 'Dazza will use this' : 'Inactive — Dazza ignores this'}</span>
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={12} />
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-100">
            <button onClick={cancelForm} className="text-sm text-slate-500 hover:text-slate-700 transition-colors px-3 py-2">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editingId ? 'Save changes' : 'Add entry'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !showForm && (
        <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <BookOpen size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">No knowledge entries yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Add company procedures, safety notes, estimating rules, or building standards.</p>
          {isAdmin && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={13} />
              Add first entry
            </button>
          )}
        </div>
      )}

      {/* Entries grouped by category */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-3">
          {CATEGORIES.map((cat) => {
            const catEntries = grouped[cat] ?? [];
            if (catEntries.length === 0) return null;
            return (
              <div key={cat}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{cat}</p>
                <div className="flex flex-col gap-2">
                  {catEntries.map((entry) => {
                    const isActive = entry.active === 1 || entry.active === true;
                    const isExp = expanded.has(entry.id);
                    const justSaved = savedId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className={`bg-white border rounded-xl transition-all ${isActive ? 'border-slate-200' : 'border-slate-100 opacity-60'} ${justSaved ? 'ring-2 ring-emerald-400' : ''}`}
                      >
                        <div className="flex items-start gap-3 px-4 py-3">
                          {/* Category badge */}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${CATEGORY_COLORS[cat] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {cat}
                          </span>

                          {/* Title + meta */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold truncate ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                                {entry.title}
                              </p>
                              {justSaved && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {entry.source_name && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <FileText size={9} />
                                  {entry.source_name}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                by {entry.created_by}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(entry.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>

                            {/* Expanded content */}
                            {isExp && (
                              <div className="mt-3 text-xs text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap leading-relaxed border border-slate-100">
                                {entry.content}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleExpand(entry.id)}
                              className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
                              title={isExp ? 'Collapse' : 'Expand'}
                            >
                              {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleToggleActive(entry)}
                                  className={`p-1.5 transition-colors rounded-lg hover:bg-slate-100 ${isActive ? 'text-primary' : 'text-slate-300'}`}
                                  title={isActive ? 'Deactivate' : 'Activate'}
                                >
                                  {isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                </button>
                                <button
                                  onClick={() => openEdit(entry)}
                                  className="p-1.5 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-100"
                                  title="Edit"
                                >
                                  <Pencil size={13} />
                                </button>
                                {deletingId === entry.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDelete(entry.id)}
                                      className="text-[10px] font-bold text-red-600 hover:text-red-700 px-2 py-1 bg-red-50 rounded-lg border border-red-200 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeletingId(null)}
                                      className="text-[10px] text-slate-500 hover:text-slate-700 px-2 py-1 bg-slate-100 rounded-lg transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeletingId(entry.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                                    title="Delete"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info note */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 leading-relaxed">
        <p className="font-semibold text-slate-600 mb-1">How Dazza uses this knowledge</p>
        <ul className="flex flex-col gap-1 list-none">
          <li className="flex items-start gap-1.5"><CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />Only active entries are included in Dazza's context.</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />Dazza labels answers from this knowledge as "From company knowledge:".</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />Knowledge is company-scoped — never shared with other companies.</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />For NCC, WHS, and building code questions, Dazza always adds a verification reminder regardless of what's in the knowledge base.</li>
        </ul>
      </div>
    </div>
  );
}
