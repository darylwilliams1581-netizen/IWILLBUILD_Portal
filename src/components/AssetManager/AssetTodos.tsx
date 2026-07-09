/**
 * AssetTodos — per-asset todo list (maintenance tasks, scheduled checks, etc.)
 * Standalone, no relation to jobs.
 */
import { useState, useEffect } from 'react';
import { CheckSquare, Plus, Trash2, Loader2, Calendar, Check, X } from 'lucide-react';

interface AssetTodo {
  id: number;
  title: string;
  due_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

function fmt(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === 'Done') return false;
  return new Date(dueDate) < new Date();
}

export default function AssetTodos({ assetId }: { assetId: number }) {
  const [todos, setTodos] = useState<AssetTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    load();
  }, [assetId]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}/todos`, { credentials: 'include' });
      const d = await r.json() as { todos?: AssetTodo[] };
      setTodos(d.todos ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}/todos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), dueDate: newDue || undefined, notes: newNotes.trim() || undefined }),
      });
      if (r.ok) {
        const d = await r.json() as { todo: AssetTodo };
        setTodos(prev => [d.todo, ...prev]);
        setNewTitle(''); setNewDue(''); setNewNotes(''); setAdding(false);
      }
    } finally { setSaving(false); }
  }

  async function toggleStatus(todo: AssetTodo) {
    const next = todo.status === 'Done' ? 'Open' : 'Done';
    const r = await fetch(`/api/asset-manager/assets/${assetId}/todos/${todo.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (r.ok) {
      const d = await r.json() as { todo: AssetTodo };
      setTodos(prev => prev.map(t => t.id === todo.id ? d.todo : t));
    }
  }

  async function saveEdit(todo: AssetTodo) {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}/todos/${todo.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), dueDate: editDue || null, notes: editNotes.trim() || null }),
      });
      if (r.ok) {
        const d = await r.json() as { todo: AssetTodo };
        setTodos(prev => prev.map(t => t.id === todo.id ? d.todo : t));
        setEditingId(null);
      }
    } finally { setSaving(false); }
  }

  async function deleteTodo(id: number) {
    if (!confirm('Delete this task?')) return;
    const r = await fetch(`/api/asset-manager/assets/${assetId}/todos/${id}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (r.ok) setTodos(prev => prev.filter(t => t.id !== id));
  }

  const open = todos.filter(t => t.status !== 'Done');
  const done = todos.filter(t => t.status === 'Done');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-700">Tasks</h3>
          {open.length > 0 && (
            <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] font-bold rounded-full border border-orange-200">
              {open.length} open
            </span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Plus size={12} />
            Add Task
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white border border-orange-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleAdd(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Task title…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Due date</label>
              <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Notes</label>
              <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
                placeholder="Optional note…"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => { setAdding(false); setNewTitle(''); setNewDue(''); setNewNotes(''); }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            <button onClick={() => void handleAdd()} disabled={saving || !newTitle.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Add Task
            </button>
          </div>
        </div>
      )}

      {/* Open tasks */}
      {open.length === 0 && !adding && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-slate-300 mb-3"><CheckSquare size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No open tasks</p>
          <p className="text-xs text-slate-400 mt-1">Add maintenance tasks, scheduled checks, or reminders</p>
        </div>
      )}

      {open.length > 0 && (
        <div className="flex flex-col gap-2">
          {open.map(todo => (
            <TodoRow
              key={todo.id}
              todo={todo}
              editing={editingId === todo.id}
              editTitle={editTitle}
              editDue={editDue}
              editNotes={editNotes}
              saving={saving}
              onToggle={() => void toggleStatus(todo)}
              onEdit={() => { setEditingId(todo.id); setEditTitle(todo.title); setEditDue(todo.due_date?.slice(0,10) ?? ''); setEditNotes(todo.notes ?? ''); }}
              onSaveEdit={() => void saveEdit(todo)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => void deleteTodo(todo.id)}
              setEditTitle={setEditTitle}
              setEditDue={setEditDue}
              setEditNotes={setEditNotes}
            />
          ))}
        </div>
      )}

      {/* Done tasks */}
      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors list-none flex items-center gap-1.5 py-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            {done.length} completed task{done.length !== 1 ? 's' : ''}
          </summary>
          <div className="flex flex-col gap-2 mt-2">
            {done.map(todo => (
              <TodoRow
                key={todo.id}
                todo={todo}
                editing={false}
                editTitle="" editDue="" editNotes="" saving={false}
                onToggle={() => void toggleStatus(todo)}
                onEdit={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onDelete={() => void deleteTodo(todo.id)}
                setEditTitle={() => {}}
                setEditDue={() => {}}
                setEditNotes={() => {}}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TodoRow({
  todo, editing, editTitle, editDue, editNotes, saving,
  onToggle, onEdit, onSaveEdit, onCancelEdit, onDelete,
  setEditTitle, setEditDue, setEditNotes,
}: {
  todo: AssetTodo;
  editing: boolean;
  editTitle: string; editDue: string; editNotes: string; saving: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  setEditTitle: (v: string) => void;
  setEditDue: (v: string) => void;
  setEditNotes: (v: string) => void;
}) {
  const done = todo.status === 'Done';
  const overdue = isOverdue(todo.due_date, todo.status);

  if (editing) {
    return (
      <div className="bg-white border border-orange-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
          <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onCancelEdit} className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
          <button onClick={onSaveEdit} disabled={saving || !editTitle.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border rounded-xl px-4 py-3 flex items-start gap-3 group hover:shadow-sm transition-all ${done ? 'border-slate-100 opacity-60' : overdue ? 'border-red-200 hover:border-red-300' : 'border-slate-200 hover:border-orange-200'}`}>
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-orange-400'}`}
      >
        {done && <Check size={11} className="text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{todo.title}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {todo.due_date && (
            <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
              <Calendar size={10} />
              {overdue ? 'Overdue — ' : ''}{fmt(todo.due_date)}
            </span>
          )}
          {todo.notes && <span className="text-xs text-slate-400 italic truncate max-w-[200px]">{todo.notes}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors" title="Edit">
          <X size={12} className="rotate-45" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
