import { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronUp,
  ChevronDown,
  Type,
  Calculator,
} from 'lucide-react';
import { invalidateTerminologyCache } from '@/lib/useTerminology';

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
  estimateCategories: string[];
}

const DEFAULT_STRUCTURE: CompanyStructureData = {
  crews: [],
  supervisors: [],
  jobStatuses: ['Enquiry', 'Quoted', 'Approved', 'In Progress', 'On Hold', 'Completed', 'Invoiced', 'Cancelled'],
  formCategories: ['Safety', 'HR', 'Quality', 'Compliance', 'Prestart', 'Induction', 'Inspection'],
  fileFolders: ['Contracts', 'Plans', 'Permits', 'Safety', 'Photos', 'Invoices', 'Correspondence'],
  estimateCategories: ['Labour', 'Materials', 'Subcontractors', 'Plant & Equipment', 'Preliminaries', 'Allowances'],
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
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  function add() {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setNewItem('');
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: 'up' | 'down') {
    const next = [...items];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  // Drag handlers
  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDragEnter(idx: number) { dragOverIdx.current = idx; }
  function onDragEnd() {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
    }
    dragIdx.current = null;
    dragOverIdx.current = null;
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
          <div
            key={idx}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragEnter={() => onDragEnter(idx)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className="flex items-center gap-1.5 group cursor-grab active:cursor-grabbing"
          >
            <GripVertical size={13} className="text-slate-300 shrink-0" />
            <span className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 select-none">
              {item}
            </span>
            {/* Up / Down arrows */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => move(idx, 'up')}
                disabled={idx === 0}
                className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                title="Move up"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 'down')}
                disabled={idx === items.length - 1}
                className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                title="Move down"
              >
                <ChevronDown size={12} />
              </button>
            </div>
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
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

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

  function move(idx: number, dir: 'up' | 'down') {
    const next = [...items];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDragEnter(idx: number) { dragOverIdx.current = idx; }
  function onDragEnd() {
    const from = dragIdx.current;
    const to = dragOverIdx.current;
    if (from !== null && to !== null && from !== to) {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange(next);
    }
    dragIdx.current = null;
    dragOverIdx.current = null;
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
        {items.map((item, idx) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragEnter={() => onDragEnter(idx)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className="flex items-center gap-1.5 group cursor-grab active:cursor-grabbing"
          >
            <GripVertical size={13} className="text-slate-300 shrink-0" />
            <input
              className={`${inputClass} flex-1`}
              value={item.name}
              onChange={(e) => rename(item.id, e.target.value)}
            />
            {/* Up / Down arrows */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => move(idx, 'up')}
                disabled={idx === 0}
                className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                title="Move up"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 'down')}
                disabled={idx === items.length - 1}
                className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                title="Move down"
              >
                <ChevronDown size={12} />
              </button>
            </div>
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

// ── Preset options ────────────────────────────────────────────────────────────
const PRESET_OPTIONS = [
  { label: 'Jobs',        singular: 'Job',        plural: 'Jobs' },
  { label: 'Projects',    singular: 'Project',    plural: 'Projects' },
  { label: 'Sites',       singular: 'Site',       plural: 'Sites' },
  { label: 'Stations',    singular: 'Station',    plural: 'Stations' },
  { label: 'Stores',      singular: 'Store',      plural: 'Stores' },
  { label: 'Work Orders', singular: 'Work Order', plural: 'Work Orders' },
  { label: 'Custom',      singular: '',           plural: '' },
] as const;

type PresetLabel = typeof PRESET_OPTIONS[number]['label'];

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function CompanyStructureTab({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<CompanyStructureData>(DEFAULT_STRUCTURE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Terminology state ──────────────────────────────────────────────────────
  const [termSingular, setTermSingular] = useState('Job');
  const [termPlural,   setTermPlural]   = useState('Jobs');
  const [termPreset,   setTermPreset]   = useState<PresetLabel>('Jobs');
  const [termSaving,   setTermSaving]   = useState(false);
  const [termSaveState, setTermSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [termErrorMsg, setTermErrorMsg] = useState('');

  function applyPreset(label: PresetLabel) {
    setTermPreset(label);
    const opt = PRESET_OPTIONS.find((o) => o.label === label);
    if (opt && label !== 'Custom') {
      setTermSingular(opt.singular);
      setTermPlural(opt.plural);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, termRes] = await Promise.all([
        fetch('/api/company-settings', { credentials: 'include' }),
        fetch('/api/settings/terminology', { credentials: 'include' }),
      ]);
      if (settingsRes.ok) {
        const json = await settingsRes.json() as { structure?: Partial<CompanyStructureData> };
        if (json.structure && Object.keys(json.structure).length > 0) {
          setData({
            ...DEFAULT_STRUCTURE,
            ...json.structure,
            // Ensure new field always has a value even if not yet in saved JSON
            estimateCategories: json.structure.estimateCategories ?? DEFAULT_STRUCTURE.estimateCategories,
          });
        }
      }
      if (termRes.ok) {
        const t = await termRes.json() as { singular: string; plural: string };
        setTermSingular(t.singular);
        setTermPlural(t.plural);
        // Detect which preset matches
        const match = PRESET_OPTIONS.find((o) => o.label !== 'Custom' && o.singular === t.singular && o.plural === t.plural);
        setTermPreset(match ? match.label : 'Custom');
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

  async function handleTermSave() {
    if (!isAdmin) return;
    if (!termSingular.trim() || !termPlural.trim()) {
      setTermErrorMsg('Both singular and plural labels are required.');
      setTermSaveState('error');
      return;
    }
    setTermSaving(true);
    setTermErrorMsg('');
    setTermSaveState('idle');
    try {
      const res = await fetch('/api/settings/terminology', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ singular: termSingular.trim(), plural: termPlural.trim() }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      invalidateTerminologyCache();
      setTermSaveState('saved');
      setTimeout(() => setTermSaveState('idle'), 2500);
    } catch (e) {
      setTermErrorMsg(e instanceof Error ? e.message : 'Save failed');
      setTermSaveState('error');
    } finally {
      setTermSaving(false);
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
            Configure crews, supervisors, job statuses, form categories, file folders and estimate categories used across the portal.
          </p>
        </div>
        {!isAdmin && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 font-semibold shrink-0">
            View only — Owner/Admin can edit
          </span>
        )}
      </div>

      {/* ── Main Work Label ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Type size={15} className="text-primary" />
          <h3 className="font-heading font-semibold text-sm text-slate-800">Main Work Label</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Choose what your company calls its main work records. This updates the sidebar, dashboard and register headings.
        </p>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              disabled={!isAdmin}
              onClick={() => applyPreset(opt.label)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                termPreset === opt.label
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom inputs — shown for Custom preset or when preset doesn&apos;t match */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Singular label</label>
            <input
              className={inputClass}
              value={termSingular}
              onChange={(e) => { setTermSingular(e.target.value); setTermPreset('Custom'); }}
              placeholder="e.g. Job"
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Plural label</label>
            <input
              className={inputClass}
              value={termPlural}
              onChange={(e) => { setTermPlural(e.target.value); setTermPreset('Custom'); }}
              placeholder="e.g. Jobs"
              disabled={!isAdmin}
            />
          </div>
        </div>

        <div className="text-xs text-slate-400 mb-4">
          Preview: <span className="font-semibold text-slate-600">{termPlural || '…'}</span> register &nbsp;·&nbsp;
          Add <span className="font-semibold text-slate-600">{termSingular || '…'}</span> &nbsp;·&nbsp;
          Active <span className="font-semibold text-slate-600">{termPlural || '…'}</span>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleTermSave}
              disabled={termSaving || !termSingular.trim() || !termPlural.trim()}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {termSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Label
            </button>
            {termSaveState === 'saved' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                <CheckCircle2 size={13} />Saved — reload to see changes
              </span>
            )}
            {termSaveState === 'error' && termErrorMsg && (
              <span className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle size={13} />{termErrorMsg}
              </span>
            )}
          </div>
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
        <StringListEditor
          label="Estimate Categories"
          icon={Calculator}
          items={data.estimateCategories}
          onChange={(v) => setData((d) => ({ ...d, estimateCategories: v }))}
          placeholder="e.g. Scaffolding"
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
