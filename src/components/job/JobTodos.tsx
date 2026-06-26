import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Check, AlertCircle, Calendar, ChevronDown, ChevronUp, Pencil } from 'lucide-react';

interface Todo {
  id: number;
  jobId: number;
  title: string;
  dueDate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface Props {
  jobId: number;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return dueDate < todayStr();
}

function isDueToday(dueDate: string | null) {
  if (!dueDate) return false;
  return dueDate === todayStr();
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function JobTodos({ jobId }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTodos(data.todos ?? []);
    } catch {
      setError('Failed to load to-dos.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function addTodo() {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), dueDate: newDue || null, notes: newNotes || null }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTodos((prev) => [...prev, data.todo]);
      setNewTitle(''); setNewDue(''); setNewNotes(''); setAdding(false);
    } catch {
      setError('Failed to add to-do.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(todo: Todo) {
    const newStatus = todo.status === 'Completed' ? 'Open' : 'Completed';
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? data.todo : t)));
    } catch {
      setError('Failed to update to-do.');
    }
  }

  async function saveEdit(id: number) {
    if (!editTitle.trim()) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), dueDate: editDue || null, notes: editNotes || null }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? data.todo : t)));
      setEditingId(null);
    } catch {
      setError('Failed to save edit.');
    }
  }

  async function deleteTodo(id: number) {
    if (!confirm('Delete this to-do?')) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError('Failed to delete to-do.');
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditDue(todo.dueDate ?? '');
    setEditNotes(todo.notes ?? '');
  }

  const open = todos.filter((t) => t.status !== 'Completed');
  const completed = todos.filter((t) => t.status === 'Completed');

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">To-do</h2>
        <button
          onClick={() => { setAdding(true); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-orange-600 transition-colors"
        >
          <Plus size={12} /> Add Item
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </p>
      )}

      {/* Add form */}
      {adding && (
        <div className="border border-border rounded-lg p-4 flex flex-col gap-3 bg-muted/30">
          <input
            autoFocus
            type="text"
            placeholder="To-do title *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTodo(); if (e.key === 'Escape') setAdding(false); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold mb-1 text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              />
            </div>
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={addTodo}
              disabled={saving || !newTitle.trim()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setAdding(false); setNewTitle(''); setNewDue(''); setNewNotes(''); }}
              className="px-4 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Open items */}
      {open.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Check size={18} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">No open to-dos</p>
          <p className="text-xs text-muted-foreground">Click Add Item to create one.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {open.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              editing={editingId === todo.id}
              editTitle={editTitle}
              editDue={editDue}
              editNotes={editNotes}
              onEditTitle={setEditTitle}
              onEditDue={setEditDue}
              onEditNotes={setEditNotes}
              onToggle={() => toggleStatus(todo)}
              onStartEdit={() => startEdit(todo)}
              onSaveEdit={() => saveEdit(todo.id)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => deleteTodo(todo.id)}
            />
          ))}
        </div>
      )}

      {/* Completed toggle */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCompleted ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showCompleted ? 'Hide' : 'Show'} completed ({completed.length})
          </button>
          {showCompleted && (
            <div className="flex flex-col gap-2 mt-2">
              {completed.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  editing={editingId === todo.id}
                  editTitle={editTitle}
                  editDue={editDue}
                  editNotes={editNotes}
                  onEditTitle={setEditTitle}
                  onEditDue={setEditDue}
                  onEditNotes={setEditNotes}
                  onToggle={() => toggleStatus(todo)}
                  onStartEdit={() => startEdit(todo)}
                  onSaveEdit={() => saveEdit(todo.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => deleteTodo(todo.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  todo: Todo;
  editing: boolean;
  editTitle: string;
  editDue: string;
  editNotes: string;
  onEditTitle: (v: string) => void;
  onEditDue: (v: string) => void;
  onEditNotes: (v: string) => void;
  onToggle: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

function TodoRow({
  todo, editing, editTitle, editDue, editNotes,
  onEditTitle, onEditDue, onEditNotes,
  onToggle, onStartEdit, onSaveEdit, onCancelEdit, onDelete,
}: RowProps) {
  const completed = todo.status === 'Completed';
  const overdue = !completed && isOverdue(todo.dueDate);
  const dueToday = !completed && isDueToday(todo.dueDate);

  if (editing) {
    return (
      <div className="border border-primary/40 rounded-lg p-3 flex flex-col gap-2 bg-muted/20">
        <input
          autoFocus
          type="text"
          value={editTitle}
          onChange={(e) => onEditTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <input
          type="date"
          value={editDue}
          onChange={(e) => onEditDue(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
        />
        <textarea
          placeholder="Notes (optional)"
          value={editNotes}
          onChange={(e) => onEditNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
        <div className="flex gap-2">
          <button onClick={onSaveEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-orange-600 transition-colors">Save</button>
          <button onClick={onCancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors group ${
      overdue ? 'bg-red-50 border-red-200' :
      dueToday ? 'bg-amber-50 border-amber-200' :
      completed ? 'bg-muted/30 border-border opacity-60' :
      'bg-white border-border hover:bg-muted/20'
    }`}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
          completed ? 'bg-emerald-500 border-emerald-500' : 'border-border hover:border-primary'
        }`}
      >
        {completed && <Check size={11} className="text-white" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {todo.title}
        </p>
        {todo.dueDate && (
          <div className={`flex items-center gap-1 mt-0.5 text-xs font-medium ${
            overdue ? 'text-red-600' : dueToday ? 'text-amber-700' : 'text-muted-foreground'
          }`}>
            <Calendar size={10} />
            {overdue ? 'Overdue — ' : dueToday ? 'Due today — ' : ''}
            {formatDate(todo.dueDate)}
          </div>
        )}
        {todo.notes && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{todo.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onStartEdit}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
