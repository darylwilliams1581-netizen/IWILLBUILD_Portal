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
  Link,
  MapPin,
  SplitSquareHorizontal,
  SlidersHorizontal,
  Star,
  ImagePlus,
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
  logicJson: string | null;
  fieldOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Settings helpers ──────────────────────────────────────────────────────────

export function parseSettings(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

export function parseOptions(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

// ── Field type definitions ────────────────────────────────────────────────────

interface FieldTypeDef {
  type: string;
  label: string;
  icon: React.ElementType;
  group: string;
  hasOptions?: boolean;
  isLayout?: boolean;
  noAnswer?: boolean; // page_break etc — no answer stored
}

const FIELD_TYPES: FieldTypeDef[] = [
  // Text
  { type: 'short_text',        label: 'Short Text',           icon: Type,                 group: 'Text' },
  { type: 'long_text',         label: 'Long Text',            icon: AlignLeft,            group: 'Text' },
  { type: 'number',            label: 'Number',               icon: Hash,                 group: 'Text' },
  { type: 'url',               label: 'Link / URL',           icon: Link,                 group: 'Text' },
  // Date & Time
  { type: 'date',              label: 'Date',                 icon: Calendar,             group: 'Date & Time' },
  { type: 'datetime',          label: 'Date & Time',          icon: Clock,                group: 'Date & Time' },
  // Choice
  { type: 'yes_no',            label: 'Yes / No',             icon: ToggleLeft,           group: 'Choice' },
  { type: 'checkbox',          label: 'Checkbox',             icon: CheckSquare,          group: 'Choice' },
  { type: 'single_choice',     label: 'Single Choice',        icon: Circle,               group: 'Choice', hasOptions: true },
  { type: 'multi_select',      label: 'Multi Select',         icon: List,                 group: 'Choice', hasOptions: true },
  { type: 'linear_scale',      label: 'Linear Scale',         icon: SlidersHorizontal,    group: 'Choice' },
  { type: 'rating',            label: 'Rating',               icon: Star,                 group: 'Choice' },
  // Media
  { type: 'photo',             label: 'Photo / Media',        icon: Camera,               group: 'Media' },
  { type: 'signature',         label: 'Signature',            icon: PenLine,              group: 'Media' },
  // Field Ops
  { type: 'location',          label: 'Location / GPS',       icon: MapPin,               group: 'Field Ops' },
  // Layout
  { type: 'section',           label: 'Section Heading',      icon: Heading,              group: 'Layout', isLayout: true },
  { type: 'instruction',       label: 'Instruction',          icon: Info,                 group: 'Layout', isLayout: true },
  { type: 'instruction_image', label: 'Instruction + Image',  icon: ImagePlus,            group: 'Layout', isLayout: true },
  { type: 'page_break',        label: 'Page Break',           icon: SplitSquareHorizontal,group: 'Layout', isLayout: true, noAnswer: true },
];

const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((f) => [f.type, f]));

const GROUPS = ['Text', 'Date & Time', 'Choice', 'Media', 'Field Ops', 'Layout'];

function getTypeDef(type: string): FieldTypeDef {
  return FIELD_TYPE_MAP[type] ?? { type, label: type, icon: Type, group: 'Text' };
}

// ── Settings editors for new field types ─────────────────────────────────────

function LinearScaleSettings({
  settings,
  onChange,
}: {
  settings: Record<string, unknown>;
  onChange: (s: Record<string, unknown>) => void;
}) {
  const min = typeof settings.min === 'number' ? settings.min : 1;
  const max = typeof settings.max === 'number' ? settings.max : 10;
  const step = typeof settings.step === 'number' ? settings.step : 1;
  const leftLabel = typeof settings.leftLabel === 'string' ? settings.leftLabel : '';
  const rightLabel = typeof settings.rightLabel === 'string' ? settings.rightLabel : '';

  function set(key: string, value: unknown) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Min</label>
          <input type="number" value={min} onChange={(e) => set('min', Number(e.target.value))}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Max</label>
          <input type="number" value={max} onChange={(e) => set('max', Number(e.target.value))}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Step</label>
          <input type="number" value={step} min={1} onChange={(e) => set('step', Number(e.target.value))}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Left label</label>
          <input type="text" value={leftLabel} onChange={(e) => set('leftLabel', e.target.value)}
            placeholder="e.g. Not at all"
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Right label</label>
          <input type="text" value={rightLabel} onChange={(e) => set('rightLabel', e.target.value)}
            placeholder="e.g. Extremely"
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
      </div>
      {/* Live preview of scale */}
      <div className="bg-slate-50 rounded-xl px-3 py-2">
        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
          <span>{leftLabel || min}</span><span>{rightLabel || max}</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: Math.min(max - min + 1, 20) }, (_, i) => min + i * step).map((v) => (
            <span key={v} className="text-[11px] px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-slate-500">{v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RatingSettings({
  settings,
  onChange,
}: {
  settings: Record<string, unknown>;
  onChange: (s: Record<string, unknown>) => void;
}) {
  const style = typeof settings.style === 'string' ? settings.style : 'stars';
  const max = typeof settings.max === 'number' ? settings.max : 5;

  function set(key: string, value: unknown) {
    onChange({ ...settings, [key]: value });
  }

  const styleOptions = [
    { value: 'stars', label: '★ Stars' },
    { value: 'numeric', label: '1–N Numeric' },
    { value: 'emoji', label: '😊 Emoji' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Style</label>
          <select value={style} onChange={(e) => set('style', e.target.value)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
            {styleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Max rating</label>
          <input type="number" value={max} min={2} max={10} onChange={(e) => set('max', Number(e.target.value))}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
      </div>
      {/* Preview */}
      <div className="bg-slate-50 rounded-xl px-3 py-2 flex gap-1">
        {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((v) => (
          <span key={v} className="text-lg">
            {style === 'stars' ? '☆' : style === 'emoji' ? ['😞','😐','🙂','😊','😄'][Math.min(v - 1, 4)] : (
              <span className="text-sm px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-500">{v}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function LocationSettings({
  settings,
  onChange,
}: {
  settings: Record<string, unknown>;
  onChange: (s: Record<string, unknown>) => void;
}) {
  const manualAddress = settings.manualAddress !== false;
  const showMapPreview = settings.showMapPreview !== false;

  function set(key: string, value: unknown) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">Allow manual address fallback</span>
        <button onClick={() => set('manualAddress', !manualAddress)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${manualAddress ? 'bg-primary' : 'bg-slate-200'}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${manualAddress ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">Show map preview</span>
        <button onClick={() => set('showMapPreview', !showMapPreview)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showMapPreview ? 'bg-primary' : 'bg-slate-200'}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showMapPreview ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      <p className="text-[11px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
        Captures latitude, longitude, accuracy, and timestamp. If GPS is blocked, user can enter address manually.
      </p>
    </div>
  );
}

function UrlSettings({
  settings,
  onChange,
}: {
  settings: Record<string, unknown>;
  onChange: (s: Record<string, unknown>) => void;
}) {
  const placeholder = typeof settings.placeholder === 'string' ? settings.placeholder : '';

  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Placeholder text</label>
      <input type="text" value={placeholder}
        onChange={(e) => onChange({ ...settings, placeholder: e.target.value })}
        placeholder="e.g. https://example.com"
        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
    </div>
  );
}

// ── Conditional logic types ───────────────────────────────────────────────────

export interface FieldLogic {
  enabled: boolean;
  action: 'show' | 'hide';
  triggerFieldId: number | null;
  operator: 'equals' | 'not_equals' | 'contains' | 'is_checked' | 'is_not_checked';
  value: string;
}

const DEFAULT_LOGIC: FieldLogic = {
  enabled: false,
  action: 'show',
  triggerFieldId: null,
  operator: 'equals',
  value: '',
};

export function parseLogic(json: string | null): FieldLogic {
  if (!json) return { ...DEFAULT_LOGIC };
  try {
    const parsed = JSON.parse(json) as Partial<FieldLogic>;
    return { ...DEFAULT_LOGIC, ...parsed };
  } catch {
    return { ...DEFAULT_LOGIC };
  }
}

// Trigger-capable field types
const TRIGGER_TYPES = new Set(['yes_no', 'single_choice', 'checkbox', 'multi_select']);

// Operators that apply per trigger type
function getOperators(triggerType: string): Array<{ value: FieldLogic['operator']; label: string }> {
  if (triggerType === 'checkbox') {
    return [
      { value: 'is_checked', label: 'is checked' },
      { value: 'is_not_checked', label: 'is not checked' },
    ];
  }
  if (triggerType === 'yes_no') {
    return [
      { value: 'equals', label: 'equals' },
      { value: 'not_equals', label: 'does not equal' },
    ];
  }
  return [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'contains', label: 'contains' },
  ];
}

// ── Logic editor ──────────────────────────────────────────────────────────────

interface LogicEditorProps {
  fieldId: number;
  logic: FieldLogic;
  allFields: FormField[]; // all fields in the template
  onChange: (logic: FieldLogic) => void;
}

function LogicEditor({ fieldId, logic, allFields, onChange }: LogicEditorProps) {
  // Eligible trigger fields: must be a trigger-capable type, not this field itself
  const triggerFields = allFields.filter(
    (f) => f.id !== fieldId && TRIGGER_TYPES.has(f.fieldType),
  );

  const triggerField = triggerFields.find((f) => f.id === logic.triggerFieldId) ?? null;
  const operators = triggerField ? getOperators(triggerField.fieldType) : [];
  const triggerOptions = triggerField ? parseOptions(triggerField.optionsJson) : [];

  // When trigger field changes, reset operator + value
  function setTriggerField(id: number | null) {
    const tf = allFields.find((f) => f.id === id) ?? null;
    const defaultOp = tf ? getOperators(tf.fieldType)[0].value : 'equals';
    onChange({ ...logic, triggerFieldId: id, operator: defaultOp, value: '' });
  }

  function set<K extends keyof FieldLogic>(key: K, val: FieldLogic[K]) {
    onChange({ ...logic, [key]: val });
  }

  const needsValue =
    logic.operator !== 'is_checked' && logic.operator !== 'is_not_checked';

  const isYesNo = triggerField?.fieldType === 'yes_no';
  const isChoice = triggerField?.fieldType === 'single_choice' || triggerField?.fieldType === 'multi_select';

  return (
    <div className="flex flex-col gap-3">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">Conditional logic</span>
        <button
          onClick={() => set('enabled', !logic.enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${logic.enabled ? 'bg-primary' : 'bg-slate-200'}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${logic.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {logic.enabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
            {/* Action */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Action</label>
              <div className="flex gap-2">
                {(['show', 'hide'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => set('action', a)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${logic.action === a ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                  >
                    {a === 'show' ? 'Show this field' : 'Hide this field'}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger field */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">When field</label>
              {triggerFields.length === 0 ? (
                <p className="text-xs text-slate-400 italic bg-white rounded-lg border border-slate-200 px-3 py-2">
                  No eligible trigger fields yet. Add a Yes/No, Single Choice, Checkbox, or Multi Select field above this one.
                </p>
              ) : (
                <select
                  value={logic.triggerFieldId ?? ''}
                  onChange={(e) => setTriggerField(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">— select a field —</option>
                  {triggerFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label || `Field #${f.id}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Operator */}
            {triggerField && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Condition</label>
                <select
                  value={logic.operator}
                  onChange={(e) => set('operator', e.target.value as FieldLogic['operator'])}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {operators.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Value */}
            {triggerField && needsValue && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Value</label>
                {isYesNo ? (
                  <select
                    value={logic.value}
                    onChange={(e) => set('value', e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    <option value="">— select —</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : isChoice && triggerOptions.length > 0 ? (
                  <select
                    value={logic.value}
                    onChange={(e) => set('value', e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    <option value="">— select —</option>
                    {triggerOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={logic.value}
                    onChange={(e) => set('value', e.target.value)}
                    placeholder="Enter value…"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                )}
              </div>
            )}

            {/* Summary */}
            {logic.triggerFieldId && (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                <p className="text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {logic.action === 'show' ? 'Show' : 'Hide'}
                  </span>{' '}
                  this field when{' '}
                  <span className="font-semibold text-slate-700">
                    "{triggerField?.label || `Field #${logic.triggerFieldId}`}"
                  </span>{' '}
                  {logic.operator === 'is_checked' ? 'is checked'
                    : logic.operator === 'is_not_checked' ? 'is not checked'
                    : logic.operator === 'equals' ? `equals "${logic.value}"`
                    : logic.operator === 'not_equals' ? `does not equal "${logic.value}"`
                    : `contains "${logic.value}"`}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Instruction + Image thumbnail uploader ────────────────────────────────────

interface InstructionImageUploaderProps {
  templateId: number;
  fieldId: number;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}

function InstructionImageUploader({ templateId, fieldId, currentUrl, onUploaded }: InstructionImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`/api/forms/${templateId}/fields/${fieldId}/thumbnail`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json() as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload failed');
      onUploaded(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-xs font-semibold text-slate-600">Thumbnail image</label>

      {currentUrl ? (
        <div className="flex items-start gap-3">
          <img
            src={currentUrl}
            alt="Instruction thumbnail"
            className="w-24 h-24 rounded-xl object-cover border border-slate-200 shrink-0"
          />
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs text-slate-500">Image saved. Shown in form runner and completed forms.</p>
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              Replace image
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onInputChange} />
            </label>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploading ? 'border-primary/40 bg-orange-50/50 pointer-events-none' : 'border-slate-200 bg-slate-50 hover:border-primary hover:bg-orange-50'}`}>
          {uploading ? (
            <>
              <Loader2 size={20} className="animate-spin text-primary" />
              <span className="text-xs text-slate-500">Uploading…</span>
            </>
          ) : (
            <>
              <ImagePlus size={20} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">Click to upload thumbnail</span>
              <span className="text-[11px] text-slate-400">JPEG, PNG or WebP · max 10 MB</span>
            </>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onInputChange} disabled={uploading} />
        </label>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>
      )}
    </div>
  );
}

// ── Field card ────────────────────────────────────────────────────────────────

interface FieldCardProps {
  field: FormField;
  index: number;
  total: number;
  allFields: FormField[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<FormField>) => Promise<void>;
}

function FieldCard({ field, index, total, allFields, onMoveUp, onMoveDown, onDelete, onUpdate }: FieldCardProps) {
  const def = getTypeDef(field.fieldType);
  const Icon = def.icon;
  const [label, setLabel] = useState(field.label);
  const [labelSaving, setLabelSaving] = useState(false);
  const [fieldType, setFieldType] = useState(field.fieldType);
  const [required, setRequired] = useState(field.required);
  const [options, setOptions] = useState<string[]>(() => parseOptions(field.optionsJson));
  const [settings, setSettings] = useState<Record<string, unknown>>(() => parseSettings(field.settingsJson));
  const [logic, setLogic] = useState<FieldLogic>(() => parseLogic(field.logicJson));
  const [newOption, setNewOption] = useState('');
  const [optionSaving, setOptionSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setLabel(field.label); }, [field.label]);
  useEffect(() => { setFieldType(field.fieldType); }, [field.fieldType]);
  useEffect(() => { setRequired(field.required); }, [field.required]);
  useEffect(() => { setOptions(parseOptions(field.optionsJson)); }, [field.optionsJson]);
  useEffect(() => { setSettings(parseSettings(field.settingsJson)); }, [field.settingsJson]);
  useEffect(() => { setLogic(parseLogic(field.logicJson)); }, [field.logicJson]);

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

  async function saveSettings(newSettings: Record<string, unknown>) {
    setSettings(newSettings);
    await onUpdate({ settingsJson: JSON.stringify(newSettings) });
  }

  async function saveLogic(newLogic: FieldLogic) {
    setLogic(newLogic);
    await onUpdate({ logicJson: JSON.stringify(newLogic) });
  }

  const currentDef = getTypeDef(fieldType);
  const showOptions = currentDef.hasOptions;
  const isLayout = currentDef.isLayout;
  const isPageBreak = fieldType === 'page_break';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isPageBreak ? 'border-dashed border-slate-300' : 'border-slate-200'}`}
    >
      {/* Page break special render */}
      {isPageBreak ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 border-t-2 border-dashed border-slate-300" />
          <div className="flex items-center gap-2 shrink-0">
            <SplitSquareHorizontal size={13} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Page Break</span>
          </div>
          <div className="flex-1 border-t-2 border-dashed border-slate-300" />
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onMoveUp} disabled={index === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500 transition-colors">
              <ChevronUp size={16} />
            </button>
            <button onClick={onMoveDown} disabled={index === total - 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500 transition-colors">
              <ChevronDown size={16} />
            </button>
            <button onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Card header */}
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
            onClick={() => setExpanded((e) => !e)}
          >
            <div className="p-2 rounded-xl bg-slate-100 shrink-0">
              <Icon size={15} className="text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 break-words" style={{ overflowWrap: 'anywhere' }}>
                {label || <span className="text-slate-400 italic">Untitled field</span>}
              </p>
              <p className="text-[11px] text-slate-400">
                {currentDef.label}
                {!isLayout && required ? ' · Required' : ''}
                {logic.enabled ? ' · Logic on' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={onMoveUp} disabled={index === 0}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500 transition-colors" title="Move up">
                <ChevronUp size={16} />
              </button>
              <button onClick={onMoveDown} disabled={index === total - 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500 transition-colors" title="Move down">
                <ChevronDown size={16} />
              </button>
              <button onClick={onDelete}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete field">
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
                      {isLayout
                        ? (fieldType === 'section' ? 'Heading text' : fieldType === 'instruction' || fieldType === 'instruction_image' ? 'Instruction text' : 'Field label')
                        : 'Field label'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onBlur={saveLabel}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                        placeholder={
                          isLayout
                            ? (fieldType === 'section' ? 'e.g. Site Details' : 'e.g. Please complete all fields')
                            : fieldType === 'url' ? 'e.g. Project website'
                            : fieldType === 'location' ? 'e.g. Site location'
                            : 'e.g. Client name'
                        }
                        className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
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
                              className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            />
                            <button onClick={() => removeOption(i)}
                              className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
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
                          className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                        <button onClick={addOption}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors">
                          Add
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Linear scale settings */}
                  {fieldType === 'linear_scale' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Scale settings</label>
                      <LinearScaleSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}

                  {/* Rating settings */}
                  {fieldType === 'rating' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Rating settings</label>
                      <RatingSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}

                  {/* URL settings */}
                  {fieldType === 'url' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">URL settings</label>
                      <UrlSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}

                  {/* Location settings */}
                  {fieldType === 'location' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Location settings</label>
                      <LocationSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}

                  {/* Instruction + Image — thumbnail uploader */}
                  {fieldType === 'instruction_image' && (
                    <InstructionImageUploader
                      templateId={field.templateId}
                      fieldId={field.id}
                      currentUrl={typeof settings.thumbnailUrl === 'string' ? settings.thumbnailUrl : null}
                      onUploaded={(url) => saveSettings({ ...settings, thumbnailUrl: url })}
                    />
                  )}

                  {/* Photo / Signature info */}
                  {(fieldType === 'photo' || fieldType === 'signature') && (
                    <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2">
                      {fieldType === 'photo'
                        ? 'Photo capture and upload will be available when filling out this form.'
                        : 'Signature capture will be available when filling out this form.'}
                    </p>
                  )}

                  {/* Divider before logic */}
                  <div className="border-t border-slate-100" />

                  {/* Conditional logic editor */}
                  <LogicEditor
                    fieldId={field.id}
                    logic={logic}
                    allFields={allFields}
                    onChange={saveLogic}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
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
  const settings = parseSettings(field.settingsJson);

  // Layout types
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

  if (field.fieldType === 'instruction_image') {
    const thumbnailUrl = typeof settings.thumbnailUrl === 'string' ? settings.thumbnailUrl : null;
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex gap-3 items-start">
        <div className="w-14 h-14 rounded-lg border border-blue-200 flex items-center justify-center shrink-0 overflow-hidden bg-blue-100">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="Instruction thumbnail" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus size={18} className="text-blue-400" />
          )}
        </div>
        <p className="text-sm text-blue-800">{field.label || 'Instruction text'}</p>
      </div>
    );
  }

  if (field.fieldType === 'page_break') {
    return (
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 border-t-2 border-dashed border-slate-300" />
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">Page Break</span>
        <div className="flex-1 border-t-2 border-dashed border-slate-300" />
      </div>
    );
  }

  // Input fields
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
      {field.fieldType === 'url' && (
        <div className="h-9 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-3 gap-2">
          <Link size={13} className="text-slate-300" />
          <span className="text-xs text-slate-300">
            {typeof settings.placeholder === 'string' && settings.placeholder ? settings.placeholder : 'https://'}
          </span>
        </div>
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
      {field.fieldType === 'linear_scale' && (() => {
        const min = typeof settings.min === 'number' ? settings.min : 1;
        const max = typeof settings.max === 'number' ? settings.max : 10;
        const step = typeof settings.step === 'number' ? settings.step : 1;
        const leftLabel = typeof settings.leftLabel === 'string' ? settings.leftLabel : '';
        const rightLabel = typeof settings.rightLabel === 'string' ? settings.rightLabel : '';
        const vals = Array.from({ length: Math.min(max - min + 1, 20) }, (_, i) => min + i * step);
        return (
          <div>
            <div className="flex gap-1 flex-wrap mb-1">
              {vals.map((v) => (
                <span key={v} className="text-[11px] px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">{v}</span>
              ))}
            </div>
            {(leftLabel || rightLabel) && (
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{leftLabel}</span><span>{rightLabel}</span>
              </div>
            )}
          </div>
        );
      })()}
      {field.fieldType === 'rating' && (() => {
        const style = typeof settings.style === 'string' ? settings.style : 'stars';
        const max = typeof settings.max === 'number' ? settings.max : 5;
        return (
          <div className="flex gap-1">
            {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((v) => (
              <span key={v} className="text-lg">
                {style === 'stars' ? '☆' : style === 'emoji' ? ['😞','😐','🙂','😊','😄'][Math.min(v - 1, 4)] : (
                  <span className="text-sm px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500">{v}</span>
                )}
              </span>
            ))}
          </div>
        );
      })()}
      {field.fieldType === 'location' && (
        <div className="flex flex-col gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 w-fit">
            <MapPin size={13} className="text-slate-400" /> Capture current location
          </button>
          {settings.manualAddress !== false && (
            <div className="h-9 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-3">
              <span className="text-xs text-slate-300">Manual address…</span>
            </div>
          )}
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
      void load();
    }
  }

  async function moveField(index: number, direction: 'up' | 'down') {
    const newFields = [...fields];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newFields.length) return;
    [newFields[index], newFields[swapIdx]] = [newFields[swapIdx], newFields[index]];
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
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
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
          <div className="lg:w-64 shrink-0">
            <div className="lg:sticky lg:top-20">
              <AddFieldPanel onAdd={addField} adding={adding} />
            </div>
          </div>
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
                    allFields={fields}
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
