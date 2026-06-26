import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  GripVertical,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  Clock,
  ToggleLeft,
  CheckSquare,
  Circle,
  List,
  Camera,
  PenLine,
  Heading,
  Info,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormTemplate {
  id: number;
  name: string;
  formType: string;
  category: string | null;
  description: string | null;
}

export interface FormField {
  id: number;
  templateId: number;
  companyId: number;
  label: string;
  fieldType: string;
  required: boolean;
  optionsJson: string | null;
  settingsJson: string | null;
  fieldOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Field type definitions ────────────────────────────────────────────────────

interface FieldTypeDef {
  type: string;
  label: string;
  icon: React.ElementType;
  group: string;
  hasOptions?: boolean;
  isLayout?: boolean;
}

const FIELD_TYPES: FieldTypeDef[] = [
  { type: 'short_text',    label: 'Short Text',     icon: Type,        group: 'Text' },
  { type: 'long_text',     label: 'Long Text',      icon: AlignLeft,   group: 'Text' },
  { type: 'number',        label: 'Number',         icon: Hash,        group: 'Text' },
  { type: 'date',          label: 'Date',           icon: Calendar,    group: 'Date & Time' },
  { type: 'datetime',      label: 'Date & Time',    icon: Clock,       group: 'Date & Time' },
  { type: 'yes_no',        label: 'Yes / No',       icon: ToggleLeft,  group: 'Choice' },
  { type: 'checkbox',      label: 'Checkbox',       icon: CheckSquare, group: 'Choice' },
  { type: 'single_choice', label: 'Single Choice',  icon: Circle,      group: 'Choice', hasOptions: true },
  { type: 'multi_select',  label: 'Multi Select',   icon: List,        group: 'Choice', hasOptions: true },
  { type: 'photo',         label: 'Photo / Media',  icon: Camera,      group: 'Media' },
  { type: 'signature',     label: 'Signature',      icon: PenLine,     group: 'Media' },
  { type: 'section',       label: 'Section Heading',icon: Heading,     group: 'Layout', isLayout: true },
  { type: 'instruction',   label: 'Instruction',    icon: Info,        group: 'Layout', isLayout: true },
];

const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((f) => [f.type, f]));

const GROUPS = ['Text', 'Date & Time', 'Choice', 'Media', 'Layout'];

function getTypeDef(type: string): FieldTypeDef {
  return FIELD_TYPE_MAP[type] ?? { type, label: type, icon: Type, group: 'Text' };
}

function parseOptions(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

// ── Field card ────────────────────────────────────────────────────────────────

interface FieldCardProps {
  field: FormField;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<FormField>) => Promise<void>;
}

function FieldCard({ field, index, total, onMoveUp, onMoveDown, onDelete, onUpdate }: FieldCardProps) {
  const def = getTypeDef(field.fieldType);
  const Icon = def.icon;
  const [label, setLabel] = useState(field.label);
  const [labelSaving, setLabelSaving] = useState(false);
  const [fieldType, setFieldType] = useState(field.fieldType);
  const [required, setRequired] = useState(field.required);
  const [options, setOptions] = useState<string[]>(() => parseOptions(field.optionsJson));
  const [newOption, setNewOption] = useState('');
  const [optionSaving, setOptionSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Sync if parent updates (e.g. after reorder)
  useEffect(() => { setLabel(field.label); }, [field.label]);
  useEffect(() => { setFieldType(field.fieldType); }, [field.fieldType]);
  useEffect(() => { setRequired(field.required); }, [field.required]);
  useEffect(() => { setOptions(parseOptions(field.optionsJson)); }, [field.optionsJson]);

  async function saveLabel() {
    if (label === field.label) return;
    setLabelSaving(true);
    await onUpdate({ label });
    setLabelSaving(false);
  }

  async function changeType(newType: string) {
    setFieldType(newType);
    await onUpdate({ fieldType: newType });
  }

  async function toggleRequired() {
    const next = !required;
    setRequired(next);
    await onUpdate({ required: next });
  }

  async function saveOptions(newOpts: string[]) {
    setOptionSaving(true);
    await onUpdate({ optionsJson: JSON.stringify(newOpts) });
    setOptionSaving(false);
  }

  async function addOption() {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    const next = [...options, trimmed];
    setOptions(next);
    setNewOption('');
    await saveOptions(next);
  }

  async function removeOption(i: number) {
    const next = options.filter((_, idx) => idx !== i);
    setOptions(next);
    await saveOptions(next);
  }

  async function editOption(i: number, val: string) {
    const next = options.map((o, idx) => (idx === i ? val : o));
    setOptions(next);
  }

  async function blurOption(i: number) {
    await saveOptions(options);
    void i;
  }

  const currentDef = getTypeDef(fieldType);
  const showOptions = currentDef.hasOptions;
  const isLayout = currentDef.isLayout;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="p-2 rounded-xl bg-slate-100 shrink-0">
          <Icon size={15} className="text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {label || <span className="text-slate-400 italic">Untitled field</span>}
          </p>
          <p className="text-[11px] text-slate-400">{currentDef.label}{!isLayout && required ? ' · Required' : ''}</p>
        </div>
        {/* Up / Down / Delete */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500 transition-colors"
            title="Move up"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500 transition-colors"
            title="Move down"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
            title="Delete field"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-4 border-t border-slate-100 pt-3">

              {/* Label */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {isLayout ? (fieldType === 'section' ? 'Heading text' : 'Instruction text') : 'Field label'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={saveLabel}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                    placeholder={isLayout ? (fieldType === 'section' ? 'e.g. Site Details' : 'e.g. Please complete all fields') : 'e.g. Client name'}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                  {labelSaving && <Loader2 size={14} className="animate-spin text-slate-400 self-center" />}
                </div>
              </div>

              {/* Field type selector */}
              {!isLayout && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Field type</label>
                  <select
                    value={fieldType}
                    onChange={(e) => changeType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  >
                    {GROUPS.map((group) => (
                      <optgroup key={group} label={group}>
                        {FIELD_TYPES.filter((f) => f.group === group && !f.isLayout).map((f) => (
                          <option key={f.type} value={f.type}>{f.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}

              {/* Required toggle */}
              {!isLayout && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Required</span>
                  <button
                    onClick={toggleRequired}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${required ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${required ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              )}

              {/* Options editor */}
              {showOptions && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Options {optionSaving && <Loader2 size={11} className="inline animate-spin ml-1 text-slate-400" />}
                  </label>
                  <div className="flex flex-col gap-1.5 mb-2">
                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <GripVertical size={13} className="text-slate-300 shrink-0" />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => editOption(i, e.target.value)}
                          onBlur={() => blurOption(i)}
                          className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                        <button
                          onClick={() => removeOption(i)}
                          className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void addOption(); }}
                      placeholder="Add option…"
                      className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                    <button
                      onClick={addOption}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Photo / Signature info */}
              {(fieldType === 'photo' || fieldType === 'signature') && (
                <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                  {fieldType === 'photo'
                    ? 'Photo capture and upload will be available when filling out this form.'
                    : 'Signature capture will be available when filling out this form.'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Add field panel ───────────────────────────────────────────────────────────

interface AddFieldPanelProps {
  onAdd: (type: string) => Promise<void>;
  adding: boolean;
}

function AddFieldPanel({ onAdd, adding }: AddFieldPanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Add field</p>
      <div className="flex flex-col gap-3">
        {GROUPS.map((group) => {
          const groupFields = FIELD_TYPES.filter((f) => f.group === group);
          return (
            <div key={group}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{group}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {groupFields.map((f) => {
                  const FIcon = f.icon;
                  return (
                    <button
                      key={f.type}
                      onClick={() => onAdd(f.type)}
                      disabled={adding}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:border-primary hover:bg-orange-50 disabled:opacity-50 text-left transition-colors group"
                    >
                      <FIcon size={13} className="text-slate-400 group-hover:text-primary shrink-0 transition-colors" />
                      <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 truncate">{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Field preview (read-only representation) ─────────────────────────────────

function FieldPreview({ field }: { field: FormField }) {
  const options = parseOptions(field.optionsJson);

  if (field.fieldType === 'section') {
    return (
      <div className="border-b-2 border-slate-300 pb-1 mb-1">
        <h3 className="text-base font-bold text-slate-800">{field.label || 'Section Heading'}</h3>
      </div>
    );
  }

  if (field.fieldType === 'instruction') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
        <p className="text-sm text-blue-800">{field.label || 'Instruction text'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-700">
        {field.label || <span className="italic text-slate-400">Untitled</span>}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {(field.fieldType === 'short_text' || field.fieldType === 'number') && (
        <div className="h-9 rounded-xl border border-slate-200 bg-slate-50" />
      )}
      {field.fieldType === 'long_text' && (
        <div className="h-20 rounded-xl border border-slate-200 bg-slate-50" />
      )}
      {field.fieldType === 'date' && (
        <div className="h-9 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-3">
          <Calendar size={13} className="text-slate-300" />
        </div>
      )}
      {field.fieldType === 'datetime' && (
        <div className="h-9 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-3">
          <Clock size={13} className="text-slate-300" />
        </div>
      )}
      {field.fieldType === 'yes_no' && (
        <div className="flex gap-2">
          <div className="px-4 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-400">Yes</div>
          <div className="px-4 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-400">No</div>
        </div>
      )}
      {field.fieldType === 'checkbox' && (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border border-slate-300 bg-slate-50" />
          <span className="text-xs text-slate-400">Check to confirm</span>
        </div>
      )}
      {(field.fieldType === 'single_choice' || field.fieldType === 'multi_select') && (
        <div className="flex flex-col gap-1">
          {options.length > 0 ? options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`shrink-0 ${field.fieldType === 'single_choice' ? 'h-3.5 w-3.5 rounded-full' : 'h-3.5 w-3.5 rounded'} border border-slate-300 bg-slate-50`} />
              <span className="text-xs text-slate-500">{o}</span>
            </div>
          )) : <p className="text-xs text-slate-400 italic">No options yet</p>}
        </div>
      )}
      {field.fieldType === 'photo' && (
        <div className="h-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
          <Camera size={18} className="text-slate-300" />
        </div>
      )}
      {field.fieldType === 'signature' && (
        <div className="h-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
          <PenLine size={18} className="text-slate-300" />
        </div>
      )}
    </div>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

interface FormFieldBuilderProps {
  templateId: number;
  onBack: () => void;
}

export default function FormFieldBuilder({ templateId, onBack }: FormFieldBuilderProps) {
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'build' | 'preview'>('build');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/forms/${templateId}/fields`, { credentials: 'include' });
      const data = await res.json() as { fields?: FormField[]; template?: FormTemplate; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setFields(data.fields ?? []);
      setTemplate(data.template ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { void load(); }, [load]);

  async function addField(fieldType: string) {
    setAdding(true);
    try {
      const defaultLabel = getTypeDef(fieldType).label;
      const res = await fetch(`/api/forms/${templateId}/fields`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldType, label: defaultLabel }),
      });
      const data = await res.json() as { field?: FormField; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to add field');
      if (data.field) setFields((prev) => [...prev, data.field!]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add field');
    } finally {
      setAdding(false);
    }
  }

  async function updateField(fieldId: number, updates: Partial<FormField>) {
    try {
      const res = await fetch(`/api/forms/${templateId}/fields/${fieldId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json() as { field?: FormField; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to update');
      if (data.field) {
        setFields((prev) => prev.map((f) => (f.id === fieldId ? data.field! : f)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update field');
    }
  }

  async function deleteField(fieldId: number) {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    try {
      await fetch(`/api/forms/${templateId}/fields/${fieldId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch {
      void load(); // re-sync on error
    }
  }

  async function moveField(index: number, direction: 'up' | 'down') {
    const newFields = [...fields];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newFields.length) return;
    [newFields[index], newFields[swapIdx]] = [newFields[swapIdx], newFields[index]];
    // Reassign fieldOrder
    const reordered = newFields.map((f, i) => ({ ...f, fieldOrder: i }));
    setFields(reordered);
    try {
      await fetch(`/api/forms/${templateId}/fields/reorder`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reordered.map((f) => ({ id: f.id, fieldOrder: f.fieldOrder })) }),
      });
    } catch {
      void load();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 min-h-screen bg-slate-50">
      {/* Builder header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-medium">Form Builder</p>
          <h2 className="font-heading font-bold text-base text-slate-900 truncate">{template?.name ?? 'Form'}</h2>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setView('build')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'build' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Build
          </button>
          <button
            onClick={() => setView('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Preview
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertCircle size={13} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* Build view */}
      {view === 'build' && (
        <div className="flex flex-col lg:flex-row gap-4 p-4 flex-1">
          {/* Left: add panel */}
          <div className="lg:w-64 shrink-0">
            <div className="lg:sticky lg:top-20">
              <AddFieldPanel onAdd={addField} adding={adding} />
            </div>
          </div>

          {/* Right: field list */}
          <div className="flex-1 flex flex-col gap-3">
            {fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-2xl bg-slate-100 mb-3">
                  <Plus size={24} className="text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No fields yet</p>
                <p className="text-xs text-slate-400 mt-1">Add fields from the panel on the left</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {fields.map((field, index) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    index={index}
                    total={fields.length}
                    onMoveUp={() => moveField(index, 'up')}
                    onMoveDown={() => moveField(index, 'down')}
                    onDelete={() => deleteField(field.id)}
                    onUpdate={(updates) => updateField(field.id, updates)}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      )}

      {/* Preview view */}
      {view === 'preview' && (
        <div className="p-4 max-w-lg mx-auto w-full">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-5">
            <div>
              <h2 className="font-heading font-bold text-lg text-slate-900">{template?.name}</h2>
              {template?.description && <p className="text-sm text-slate-500 mt-1">{template.description}</p>}
            </div>
            {fields.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-8">No fields added yet</p>
            ) : (
              <div className="flex flex-col gap-4">
                {fields.map((field) => (
                  <FieldPreview key={field.id} field={field} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
