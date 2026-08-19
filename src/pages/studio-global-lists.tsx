/**
 * /studio/global-lists — Manage reusable dropdown lists for forms
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, List, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Pencil, Check, X, Loader2 } from 'lucide-react';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';
interface GlobalList {
  id: number;
  name: string;
  items: string[];
  createdAt: string;
  updatedAt: string;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function fetchLists(): Promise<GlobalList[]> {
  const r = await fetch('/api/form-global-lists', {
    credentials: 'include'
  });
  if (!r.ok) throw new Error('Failed to load');
  const d = (await r.json()) as {
    lists: GlobalList[];
  };
  return d.lists ?? [];
}
async function createList(name: string): Promise<number> {
  const r = await fetch('/api/form-global-lists', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      items: []
    })
  });
  if (!r.ok) throw new Error('Failed to create');
  const d = (await r.json()) as {
    id: number;
  };
  return d.id;
}
async function updateList(id: number, patch: {
  name?: string;
  items?: string[];
}): Promise<void> {
  const r = await fetch(`/api/form-global-lists/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error('Failed to update');
}
async function deleteList(id: number): Promise<void> {
  const r = await fetch(`/api/form-global-lists/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (!r.ok) throw new Error('Failed to delete');
}

// ── List card ─────────────────────────────────────────────────────────────────

function ListCard({
  list,
  onUpdated,
  onDeleted
}: {
  list: GlobalList;
  onUpdated: (updated: GlobalList) => void;
  onDeleted: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(list.name);
  const [items, setItems] = useState<string[]>(list.items);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setItems(list.items);
    setNameVal(list.name);
  }, [list]);
  async function saveName() {
    if (!nameVal.trim() || nameVal.trim() === list.name) {
      setEditingName(false);
      setNameVal(list.name);
      return;
    }
    setSaving(true);
    try {
      await updateList(list.id, {
        name: nameVal.trim()
      });
      onUpdated({
        ...list,
        name: nameVal.trim()
      });
    } finally {
      setSaving(false);
      setEditingName(false);
    }
  }
  async function saveItems(next: string[]) {
    setItems(next);
    setSaving(true);
    try {
      await updateList(list.id, {
        items: next
      });
      onUpdated({
        ...list,
        items: next
      });
    } finally {
      setSaving(false);
    }
  }
  async function addItem() {
    const v = newItem.trim();
    if (!v) return;
    setNewItem('');
    await saveItems([...items, v]);
  }
  async function removeItem(i: number) {
    await saveItems(items.filter((_, idx) => idx !== i));
  }
  async function editItem(i: number, val: string) {
    const next = items.map((it, idx) => idx === i ? val : it);
    setItems(next);
  }
  async function blurItem(i: number) {
    await saveItems(items);
  }
  async function handleDelete() {
    if (!confirm(`Delete "${list.name}"? Any forms using this list will fall back to their own options.`)) return;
    setDeleting(true);
    try {
      await deleteList(list.id);
      onDeleted(list.id);
    } finally {
      setDeleting(false);
    }
  }
  return <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpanded(v => !v)}>
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <List size={15} className="text-primary" />
        </div>

        {editingName ? <input ref={nameRef} value={nameVal} onChange={e => setNameVal(e.target.value)} onBlur={saveName} onKeyDown={e => {
        if (e.key === 'Enter') void saveName();
        if (e.key === 'Escape') {
          setEditingName(false);
          setNameVal(list.name);
        }
      }} onClick={e => e.stopPropagation()} className="flex-1 min-w-0 text-sm font-semibold text-slate-800 bg-white border border-primary/40 rounded-lg px-2 py-1 focus:outline-none focus:border-primary" autoFocus /> : <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 truncate">{list.name}</span>}

        <span className="text-xs text-slate-400 shrink-0">{items.length} item{items.length !== 1 ? 's' : ''}</span>

        {saving && <Loader2 size={13} className="animate-spin text-slate-300 shrink-0" />}

        <button onClick={e => {
        e.stopPropagation();
        setEditingName(true);
        setTimeout(() => nameRef.current?.focus(), 50);
      }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0" title="Rename">
          <Pencil size={13} />
        </button>

        <button onClick={e => {
        e.stopPropagation();
        void handleDelete();
      }} disabled={deleting} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0 disabled:opacity-40" title="Delete list">
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>

        {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
      </div>

      {/* Expanded items editor */}
      {expanded && <div className="border-t border-slate-100 px-4 py-3 flex flex-col gap-2">
          {items.length === 0 && <p className="text-xs text-slate-400 italic">No items yet — add some below.</p>}
          {items.map((item, i) => <div key={i} className="flex items-center gap-2">
              <GripVertical size={12} className="text-slate-300 shrink-0" />
              <input type="text" value={item} onChange={e => editItem(i, e.target.value)} onBlur={() => blurItem(i)} className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-primary/60 focus:bg-white text-slate-700" />
              <button onClick={() => removeItem(i)} className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors shrink-0">
                <X size={12} />
              </button>
            </div>)}

          {/* Add item row */}
          <div className="flex gap-2 mt-1">
            <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter') void addItem();
        }} placeholder="Add item…" className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-primary/60 text-slate-700 placeholder:text-slate-400" />
            <button onClick={addItem} className="px-3 py-1.5 text-xs font-bold text-white bg-primary hover:bg-violet-700 rounded-lg transition-colors">
              Add
            </button>
          </div>
        </div>}
    </div>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudioGlobalListsPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<GlobalList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => {
    fetchLists().then(setLists).catch(console.error).finally(() => setLoading(false));
  }, []);
  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await createList(newName.trim());
      const fresh = await fetchLists();
      setLists(fresh);
      setNewName('');
      setShowCreate(false);
      // Auto-expand the new list
      const el = document.getElementById(`list-${id}`);
      el?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    } finally {
      setCreating(false);
    }
  }
  return <div className="flex flex-col flex-1 min-h-0 lg-portal">
      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Global Lists — IWILLBUILD</title>
        <meta name="description" content="Manage reusable dropdown lists for form fields." />
        <link rel="canonical" href="https://iwillbuild.com/studio/global-lists" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <header className="sticky top-0 z-30 h-12 bg-white border-b border-border flex items-center px-4 shrink-0 gap-2 safe-top">
        <button onClick={() => navigate('/studio/forms')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="Back to Forms">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Forms</span>
        </button>
        <span className="text-gray-300">|</span>
        <List size={17} className="text-primary shrink-0" />
        <h1 className="font-heading font-bold text-base truncate flex-1">Global Lists</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-violet-700 transition-colors shrink-0">
          <Plus size={13} />
          New list
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-3">

          {/* Explainer */}
          <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
            <p className="text-xs text-violet-700 font-medium leading-relaxed">
              Create a list here once, then connect it to any <strong>Single Choice</strong> or <strong>Multi Select</strong> field across all your forms. Update the list and every form using it updates automatically.
            </p>
          </div>

          {/* Create form */}
          {showCreate && <div className="bg-white rounded-2xl border border-primary/30 shadow-sm px-4 py-3 flex flex-col gap-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">New global list</p>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter') void handleCreate();
            if (e.key === 'Escape') {
              setShowCreate(false);
              setNewName('');
            }
          }} placeholder="e.g. Trade Types, PPE Items, Risk Categories…" autoFocus className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-primary/60 focus:bg-white text-slate-800 placeholder:text-slate-400" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => {
              setShowCreate(false);
              setNewName('');
            }} className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={!newName.trim() || creating} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-primary hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50">
                  {creating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Create
                </button>
              </div>
            </div>}

          {/* Loading */}
          {loading && <div className="flex items-center justify-center py-12">
              <Loader2 size={22} className="animate-spin text-slate-300" />
            </div>}

          {/* Empty state */}
          {!loading && lists.length === 0 && !showCreate && <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <List size={24} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No global lists yet</p>
              <p className="text-xs text-slate-400 max-w-xs">Create your first list to share options across multiple forms.</p>
              <button onClick={() => setShowCreate(true)} className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-violet-700 transition-colors">
                <Plus size={14} />
                Create a list
              </button>
            </div>}

          {/* List cards */}
          {lists.map(list => <div key={list.id} id={`list-${list.id}`}>
              <ListCard list={list} onUpdated={updated => setLists(prev => prev.map(l => l.id === updated.id ? updated : l))} onDeleted={id => setLists(prev => prev.filter(l => l.id !== id))} />
            </div>)}
        </div>
      </div>
    </div>;
}
