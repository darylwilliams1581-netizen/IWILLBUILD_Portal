import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserCheck,
  ListChecks,
  Tag,
  FolderOpen,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  GripVertical,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  supervisorUserId?: string;
}

interface CompanyStructureData {
  crews: TeamMember[];
  supervisors: TeamMember[];
  jobStatuses: string[];
  formCategories: string[];
  fileFolders: string[];
}

const DEFAULT_STRUCTURE: CompanyStructureData = {
  crews: [],
  supervisors: [],
  jobStatuses: ['Enquiry', 'Quoted', 'Approved', 'In Progress', 'On Hold', 'Completed', 'Invoiced', 'Cancelled'],
  formCategories: ['Safety', 'HR', 'Quality', 'Compliance', 'Prestart', 'Induction', 'Inspection'],
  fileFolders: ['Contracts', 'Plans', 'Permits', 'Safety', 'Photos', 'Invoices', 'Correspondence'],
};

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';

// ── Simple list editor ────────────────────────────────────────────────────────

function StringListEditor({
  label,
  icon: Icon,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ElementType;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [newItem, setNewItem] = useState('');

  function add() {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setNewItem('');
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} className="text-primary" />
        <h3 className="font-heading font-semibold text-sm text-slate-800">{label}</h3>
        <span className="ml-auto text-xs text-slate-400 font-medium">{items.length}</span>
      </div>

      {/* Existing items */}
      <div className="flex flex-col gap-1.5 mb-3">
        {items.length === 0 && (
          <p className="text-xs text-slate-400 italic py-2">No items yet. Add one below.</p>
        )}
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 group">
            <GripVertical size={13} className="text-slate-300 shrink-0" />
            <span className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              {item}
            </span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder={placeholder}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          onClick={add}
          disabled={!newItem.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

// ── Named entity editor (crews / supervisors) ─────────────────────────────────

function NamedListEditor({
  label,
  icon: Icon,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ElementType;
  items: TeamMember[];
  onChange: (items: TeamMember[]) => void;
  placeholder: string;
}) {
  const [newName, setNewName] = useState('');

  function add() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onChange([...items, { id: crypto.randomUUID(), name: trimmed }]);
    setNewName('');
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }

  function rename(id: string, name: string) {
    onChange(items.map((i) => i.id === id ? { ...i, name } : i));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} className="text-primary" />
        <h3 className="font-heading font-semibold text-sm text-slate-800">{label}</h3>
        <span className="ml-auto text-xs text-slate-400 font-medium">{items.length}</span>
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {items.length === 0 && (
          <p className="text-xs text-slate-400 italic py-2">No {label.toLowerCase()} yet.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <GripVertical size={13} className="text-slate-300 shrink-0" />
            <input
              className={`${inputClass} flex-1`}
              value={item.name}
              onChange={(e) => rename(item.id, e.target.value)}
            />
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder={placeholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          onClick={add}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function CompanyStructureTab({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<CompanyStructureData>(DEFAULT_STRUCTURE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/company-settings', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json() as { structure?: Partial<CompanyStructureData> };
        if (json.structure && Object.keys(json.structure).length > 0) {
          setData({ ...DEFAULT_STRUCTURE, ...json.structure });
        }
      }
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    if (!isAdmin) return;
    setSaving(true);
    setErrorMsg('');
    setSaveState('idle');
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'structure', data }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Save failed');
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-base text-slate-800">Company Structure</h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure crews, supervisors, job statuses, form categories and file folders used across the portal.
          </p>
        </div>
        {!isAdmin && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 font-semibold shrink-0">
            View only — Owner/Admin can edit
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NamedListEditor
          label="Crews / Teams"
          icon={Users}
          items={data.crews}
          onChange={(v) => setData((d) => ({ ...d, crews: v }))}
          placeholder="e.g. Framing Crew, Concreting Team"
        />
        <NamedListEditor
          label="Supervisors"
          icon={UserCheck}
          items={data.supervisors}
          onChange={(v) => setData((d) => ({ ...d, supervisors: v }))}
          placeholder="e.g. Dave Smith"
        />
        <StringListEditor
          label="Job Statuses"
          icon={ListChecks}
          items={data.jobStatuses}
          onChange={(v) => setData((d) => ({ ...d, jobStatuses: v }))}
          placeholder="e.g. Pending Approval"
        />
        <StringListEditor
          label="Form Categories"
          icon={Tag}
          items={data.formCategories}
          onChange={(v) => setData((d) => ({ ...d, formCategories: v }))}
          placeholder="e.g. Environmental"
        />
        <StringListEditor
          label="File / Photo Folders"
          icon={FolderOpen}
          items={data.fileFolders}
          onChange={(v) => setData((d) => ({ ...d, fileFolders: v }))}
          placeholder="e.g. As-Builts"
        />
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div>
            {errorMsg && (
              <span className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle size={13} />{errorMsg}
              </span>
            )}
            {saveState === 'saved' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <CheckCircle2 size={13} />Saved
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Structure
          </button>
        </div>
      )}
    </div>
  );
}
