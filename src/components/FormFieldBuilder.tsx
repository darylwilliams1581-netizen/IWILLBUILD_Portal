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
  ChevronDown as ChevronDownIcon,
  Zap,
  Eye,
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
  noAnswer?: boolean;
}

const FIELD_TYPES: FieldTypeDef[] = [
  { type: 'short_text',        label: 'Short Text',           icon: Type,                  group: 'Text' },
  { type: 'long_text',         label: 'Long Text',            icon: AlignLeft,             group: 'Text' },
  { type: 'number',            label: 'Number',               icon: Hash,                  group: 'Text' },
  { type: 'url',               label: 'Link / URL',           icon: Link,                  group: 'Text' },
  { type: 'date',              label: 'Date',                 icon: Calendar,              group: 'Date & Time' },
  { type: 'datetime',          label: 'Date & Time',          icon: Clock,                 group: 'Date & Time' },
  { type: 'yes_no',            label: 'Yes / No',             icon: ToggleLeft,            group: 'Choice' },
  { type: 'checkbox',          label: 'Checkbox',             icon: CheckSquare,           group: 'Choice' },
  { type: 'single_choice',     label: 'Single Choice',        icon: Circle,                group: 'Choice', hasOptions: true },
  { type: 'multi_select',      label: 'Multi Select',         icon: List,                  group: 'Choice', hasOptions: true },
  { type: 'linear_scale',      label: 'Linear Scale',         icon: SlidersHorizontal,     group: 'Choice' },
  { type: 'rating',            label: 'Rating',               icon: Star,                  group: 'Choice' },
  { type: 'photo',             label: 'Photo / Media',        icon: Camera,                group: 'Media' },
  { type: 'signature',         label: 'Signature',            icon: PenLine,               group: 'Media' },
  { type: 'location',          label: 'Location / GPS',       icon: MapPin,                group: 'Field Ops' },
  { type: 'section',           label: 'Section Heading',      icon: Heading,               group: 'Layout', isLayout: true },
  { type: 'instruction',       label: 'Instruction',          icon: Info,                  group: 'Layout', isLayout: true },
  { type: 'instruction_image', label: 'Instruction + Image',  icon: ImagePlus,             group: 'Layout', isLayout: true },
  { type: 'page_break',        label: 'Page Break',           icon: SplitSquareHorizontal, group: 'Layout', isLayout: true, noAnswer: true },
];

const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((f) => [f.type, f]));
const GROUPS = ['Text', 'Date & Time', 'Choice', 'Media', 'Field Ops', 'Layout'];

function getTypeDef(type: string): FieldTypeDef {
  return FIELD_TYPE_MAP[type] ?? { type, label: type, icon: Type, group: 'Text' };
}

// ── Shared dark input style ───────────────────────────────────────────────────

const di = 'w-full bg-[#0f0f1a] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#e94560]/40 focus:border-[#e94560]/60 transition-colors';
const diSm = 'w-full bg-[#0f0f1a] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#e94560]/40 focus:border-[#e94560]/60 transition-colors';

// ── Settings editors ──────────────────────────────────────────────────────────

function LinearScaleSettings({ settings, onChange }: { settings: Record<string, unknown>; onChange: (s: Record<string, unknown>) => void }) {
  const min = typeof settings.min === 'number' ? settings.min : 1;
  const max = typeof settings.max === 'number' ? settings.max : 10;
  const step = typeof settings.step === 'number' ? settings.step : 1;
  const leftLabel = typeof settings.leftLabel === 'string' ? settings.leftLabel : '';
  const rightLabel = typeof settings.rightLabel === 'string' ? settings.rightLabel : '';
  const set = (key: string, value: unknown) => onChange({ ...settings, [key]: value });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {[['Min', 'min', min], ['Max', 'max', max], ['Step', 'step', step]].map(([lbl, key, val]) => (
          <div key={String(key)}>
            <label className="block text-[10px] font-bold text-white/35 mb-1 uppercase tracking-wider">{String(lbl)}</label>
            <input type="number" value={Number(val)} onChange={(e) => set(String(key), Number(e.target.value))} className={diSm} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-white/35 mb-1 uppercase tracking-wider">Left label</label>
          <input type="text" value={leftLabel} onChange={(e) => set('leftLabel', e.target.value)} placeholder="e.g. Not at all" className={diSm} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-white/35 mb-1 uppercase tracking-wider">Right label</label>
          <input type="text" value={rightLabel} onChange={(e) => set('rightLabel', e.target.value)} placeholder="e.g. Extremely" className={diSm} />
        </div>
      </div>
      <div className="rounded-xl px-3 py-2 bg-white/3 border border-white/6">
        <div className="flex justify-between text-[10px] text-white/30 mb-1.5">
          <span>{leftLabel || min}</span><span>{rightLabel || max}</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: Math.min(max - min + 1, 20) }, (_, i) => min + i * step).map((v) => (
            <span key={v} className="text-[11px] px-2 py-0.5 rounded-lg border border-white/10 bg-white/5 text-white/40">{v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RatingSettings({ settings, onChange }: { settings: Record<string, unknown>; onChange: (s: Record<string, unknown>) => void }) {
  const style = typeof settings.style === 'string' ? settings.style : 'stars';
  const max = typeof settings.max === 'number' ? settings.max : 5;
  const set = (key: string, value: unknown) => onChange({ ...settings, [key]: value });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-white/35 mb-1 uppercase tracking-wider">Style</label>
          <select value={style} onChange={(e) => set('style', e.target.value)}
            className={`${diSm} appearance-none`}>
            <option value="stars">★ Stars</option>
            <option value="numeric">1–N Numeric</option>
            <option value="emoji">😊 Emoji</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-white/35 mb-1 uppercase tracking-wider">Max rating</label>
          <input type="number" value={max} min={2} max={10} onChange={(e) => set('max', Number(e.target.value))} className={diSm} />
        </div>
      </div>
      <div className="rounded-xl px-3 py-2 bg-white/3 border border-white/6 flex gap-1">
        {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((v) => (
          <span key={v} className="text-lg">
            {style === 'stars' ? '☆' : style === 'emoji' ? ['😞','😐','🙂','😊','😄'][Math.min(v - 1, 4)] : (
              <span className="text-xs px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/40">{v}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function LocationSettings({ settings, onChange }: { settings: Record<string, unknown>; onChange: (s: Record<string, unknown>) => void }) {
  const manualAddress = settings.manualAddress !== false;
  const showMapPreview = settings.showMapPreview !== false;
  const set = (key: string, value: unknown) => onChange({ ...settings, [key]: value });

  return (
    <div className="flex flex-col gap-2">
      {[
        { key: 'manualAddress', label: 'Allow manual address fallback', val: manualAddress },
        { key: 'showMapPreview', label: 'Show map preview', val: showMapPreview },
      ].map(({ key, label, val }) => (
        <div key={key} className="flex items-center justify-between">
          <span className="text-xs text-white/60">{label}</span>
          <button onClick={() => set(key, !val)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${val ? 'bg-[#e94560]' : 'bg-white/15'}`}>
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      ))}
      <p className="text-[11px] text-white/30 bg-white/3 rounded-xl px-3 py-2 border border-white/6">
        Captures latitude, longitude, accuracy, and timestamp. If GPS is blocked, user can enter address manually.
      </p>
    </div>
  );
}

function UrlSettings({ settings, onChange }: { settings: Record<string, unknown>; onChange: (s: Record<string, unknown>) => void }) {
  const placeholder = typeof settings.placeholder === 'string' ? settings.placeholder : '';
  return (
    <div>
      <label className="block text-[10px] font-bold text-white/35 mb-1 uppercase tracking-wider">Placeholder text</label>
      <input type="text" value={placeholder} onChange={(e) => onChange({ ...settings, placeholder: e.target.value })}
        placeholder="e.g. https://example.com" className={diSm} />
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

const DEFAULT_LOGIC: FieldLogic = { enabled: false, action: 'show', triggerFieldId: null, operator: 'equals', value: '' };

export function parseLogic(json: string | null): FieldLogic {
  if (!json) return { ...DEFAULT_LOGIC };
  try { return { ...DEFAULT_LOGIC, ...JSON.parse(json) as Partial<FieldLogic> }; } catch { return { ...DEFAULT_LOGIC }; }
}

const TRIGGER_TYPES = new Set(['yes_no', 'single_choice', 'checkbox', 'multi_select']);

function getOperators(triggerType: string): Array<{ value: FieldLogic['operator']; label: string }> {
  if (triggerType === 'checkbox') return [
    { value: 'is_checked', label: 'is checked' },
    { value: 'is_not_checked', label: 'is not checked' },
  ];
  if (triggerType === 'yes_no') return [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
  ];
  return [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'contains', label: 'contains' },
  ];
}

// ── Logic editor ──────────────────────────────────────────────────────────────

function LogicEditor({ fieldId, logic, allFields, onChange }: {
  fieldId: number; logic: FieldLogic; allFields: FormField[]; onChange: (logic: FieldLogic) => void;
}) {
  const triggerFields = allFields.filter((f) => f.id !== fieldId && TRIGGER_TYPES.has(f.fieldType));
  const triggerField = triggerFields.find((f) => f.id === logic.triggerFieldId) ?? null;
  const operators = triggerField ? getOperators(triggerField.fieldType) : [];
  const triggerOptions = triggerField ? parseOptions(triggerField.optionsJson) : [];

  function setTriggerField(id: number | null) {
    const tf = allFields.find((f) => f.id === id) ?? null;
    const defaultOp = tf ? getOperators(tf.fieldType)[0].value : 'equals';
    onChange({ ...logic, triggerFieldId: id, operator: defaultOp, value: '' });
  }

  function set<K extends keyof FieldLogic>(key: K, val: FieldLogic[K]) { onChange({ ...logic, [key]: val }); }

  const needsValue = logic.operator !== 'is_checked' && logic.operator !== 'is_not_checked';
  const isYesNo = triggerField?.fieldType === 'yes_no';
  const isChoice = triggerField?.fieldType === 'single_choice' || triggerField?.fieldType === 'multi_select';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white/60">Conditional logic</span>
        <button onClick={() => set('enabled', !logic.enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${logic.enabled ? 'bg-[#e94560]' : 'bg-white/15'}`}>
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${logic.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {logic.enabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-3 rounded-xl p-3 border border-[#e94560]/20 bg-[#e94560]/5">
            {/* Action */}
            <div>
              <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">Action</label>
              <div className="flex gap-2">
                {(['show', 'hide'] as const).map((a) => (
                  <button key={a} onClick={() => set('action', a)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      logic.action === a ? 'bg-[#e94560] border-[#e94560] text-white' : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                    }`}>
                    {a === 'show' ? 'Show this field' : 'Hide this field'}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger field */}
            <div>
              <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">When field</label>
              {triggerFields.length === 0 ? (
                <p className="text-xs text-white/30 italic bg-white/3 rounded-lg border border-white/8 px-3 py-2">
                  No eligible trigger fields yet. Add a Yes/No, Single Choice, Checkbox, or Multi Select field above this one.
                </p>
              ) : (
                <select value={logic.triggerFieldId ?? ''} onChange={(e) => setTriggerField(e.target.value ? Number(e.target.value) : null)}
                  className={`${diSm} appearance-none`}>
                  <option value="">— select a field —</option>
                  {triggerFields.map((f) => <option key={f.id} value={f.id}>{f.label || `Field #${f.id}`}</option>)}
                </select>
              )}
            </div>

            {triggerField && (
              <div>
                <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">Condition</label>
                <select value={logic.operator} onChange={(e) => set('operator', e.target.value as FieldLogic['operator'])}
                  className={`${diSm} appearance-none`}>
                  {operators.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
              </div>
            )}

            {triggerField && needsValue && (
              <div>
                <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">Value</label>
                {isYesNo ? (
                  <select value={logic.value} onChange={(e) => set('value', e.target.value)} className={`${diSm} appearance-none`}>
                    <option value="">— select —</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : isChoice && triggerOptions.length > 0 ? (
                  <select value={logic.value} onChange={(e) => set('value', e.target.value)} className={`${diSm} appearance-none`}>
                    <option value="">— select —</option>
                    {triggerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="text" value={logic.value} onChange={(e) => set('value', e.target.value)} placeholder="Enter value…" className={diSm} />
                )}
              </div>
            )}

            {logic.triggerFieldId && (
              <div className="bg-white/5 border border-white/8 rounded-lg px-3 py-2">
                <p className="text-[11px] text-white/40">
                  <span className="font-bold text-white/70">{logic.action === 'show' ? 'Show' : 'Hide'}</span>{' '}
                  this field when{' '}
                  <span className="font-bold text-white/70">"{triggerField?.label || `Field #${logic.triggerFieldId}`}"</span>{' '}
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

// ── Instruction + Image uploader ──────────────────────────────────────────────

function InstructionImageUploader({ templateId, fieldId, currentUrl, onUploaded }: {
  templateId: number; fieldId: number; currentUrl: string | null; onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setError(''); setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`/api/forms/${templateId}/fields/${fieldId}/thumbnail`, {
        method: 'POST', credentials: 'include', body: formData,
      });
      const data = await res.json() as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload failed');
      onUploaded(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setUploading(false); }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-[10px] font-bold text-white/35 uppercase tracking-wider">Thumbnail image</label>
      {currentUrl ? (
        <div className="flex items-start gap-3">
          <img src={currentUrl} alt="Instruction thumbnail" className="w-20 h-20 rounded-xl object-cover border border-white/10 shrink-0" />
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs text-white/40">Image saved. Shown in form runner.</p>
            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-xs font-semibold text-white/60 cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              Replace image
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onInputChange} />
            </label>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          uploading ? 'border-[#e94560]/30 bg-[#e94560]/5 pointer-events-none' : 'border-white/10 bg-white/3 hover:border-[#e94560]/50 hover:bg-[#e94560]/5'
        }`}>
          {uploading ? (
            <><Loader2 size={18} className="animate-spin text-[#e94560]" /><span className="text-xs text-white/40">Uploading…</span></>
          ) : (
            <><ImagePlus size={18} className="text-white/25" /><span className="text-xs font-semibold text-white/40">Click to upload image</span><span className="text-[11px] text-white/25">JPEG, PNG or WebP · max 10 MB</span></>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onInputChange} disabled={uploading} />
        </label>
      )}
      {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-2.5 py-1.5">{error}</p>}
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

// Group accent colours
const GROUP_ACCENT: Record<string, string> = {
  Text: '#60a5fa',
  'Date & Time': '#a78bfa',
  Choice: '#34d399',
  Media: '#f472b6',
  'Field Ops': '#fb923c',
  Layout: '#94a3b8',
};

function FieldCard({ field, index, total, allFields, onMoveUp, onMoveDown, onDelete, onUpdate }: FieldCardProps) {
  const def = getTypeDef(field.fieldType);
  const Icon = def.icon;
  const accent = GROUP_ACCENT[def.group] ?? '#e94560';

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
    setOptions(next); setNewOption('');
    await saveOptions(next);
  }

  async function removeOption(i: number) {
    const next = options.filter((_, idx) => idx !== i);
    setOptions(next);
    await saveOptions(next);
  }

  async function editOption(i: number, val: string) {
    setOptions(options.map((o, idx) => (idx === i ? val : o)));
  }

  async function blurOption(_i: number) { await saveOptions(options); }

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

  // Page break — minimal strip
  if (isPageBreak) {
    return (
      <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/15 bg-white/2">
        <div className="flex-1 border-t border-dashed border-white/15" />
        <div className="flex items-center gap-2 shrink-0">
          <SplitSquareHorizontal size={12} className="text-white/25" />
          <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Page Break</span>
        </div>
        <div className="flex-1 border-t border-dashed border-white/15" />
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} className="p-1.5 rounded-lg hover:bg-white/8 disabled:opacity-20 text-white/30 transition-colors"><ChevronUp size={14} /></button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-1.5 rounded-lg hover:bg-white/8 disabled:opacity-20 text-white/30 transition-colors"><ChevronDown size={14} /></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-400/10 text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #1e1e35 0%, #1a1a2e 100%)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Left accent bar */}
      <div className="flex">
        <div className="w-0.5 shrink-0" style={{ background: expanded ? accent : 'transparent', transition: 'background 0.2s' }} />
        <div className="flex-1">
          {/* Card header */}
          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded((e) => !e)}>
            <div className="p-2 rounded-xl shrink-0" style={{ background: `${accent}18` }}>
              <Icon size={14} style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/90 break-words" style={{ overflowWrap: 'anywhere' }}>
                {label || <span className="text-white/25 italic">Untitled field</span>}
              </p>
              <p className="text-[11px] text-white/30">
                {currentDef.label}
                {!isLayout && required ? ' · Required' : ''}
                {logic.enabled ? <span className="text-[#e94560]/70"> · Logic on</span> : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={onMoveUp} disabled={index === 0} className="p-1.5 rounded-lg hover:bg-white/8 disabled:opacity-20 text-white/30 transition-colors"><ChevronUp size={14} /></button>
              <button onClick={onMoveDown} disabled={index === total - 1} className="p-1.5 rounded-lg hover:bg-white/8 disabled:opacity-20 text-white/30 transition-colors"><ChevronDown size={14} /></button>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-400/10 text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
              <ChevronDownIcon size={14} className={`text-white/20 transition-transform ml-1 ${expanded ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Expanded editor */}
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                <div className="px-4 pb-4 flex flex-col gap-4 border-t border-white/6 pt-3">

                  {/* Label */}
                  <div>
                    <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">
                      {isLayout
                        ? (fieldType === 'section' ? 'Heading text' : 'Instruction text')
                        : 'Field label'}
                    </label>
                    <div className="flex gap-2">
                      <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                        onBlur={saveLabel} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        placeholder={isLayout ? (fieldType === 'section' ? 'e.g. Site Details' : 'e.g. Please complete all fields') : 'e.g. Client name'}
                        className={`${di} flex-1 min-w-0`} />
                      {labelSaving && <Loader2 size={14} className="animate-spin text-white/30 self-center" />}
                    </div>
                  </div>

                  {/* Field type */}
                  {!isLayout && (
                    <div>
                      <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">Field type</label>
                      <select value={fieldType} onChange={(e) => changeType(e.target.value)} className={`${di} appearance-none`}>
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
                      <span className="text-xs font-semibold text-white/60">Required</span>
                      <button onClick={toggleRequired}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${required ? 'bg-[#e94560]' : 'bg-white/15'}`}>
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${required ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  )}

                  {/* Options */}
                  {showOptions && (
                    <div>
                      <label className="block text-[10px] font-bold text-white/35 mb-2 uppercase tracking-wider">
                        Options {optionSaving && <Loader2 size={10} className="inline animate-spin ml-1 text-white/30" />}
                      </label>
                      <div className="flex flex-col gap-1.5 mb-2">
                        {options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <GripVertical size={12} className="text-white/15 shrink-0" />
                            <input type="text" value={opt} onChange={(e) => editOption(i, e.target.value)} onBlur={() => blurOption(i)}
                              className={`${diSm} flex-1 min-w-0`} />
                            <button onClick={() => removeOption(i)} className="p-1 rounded-lg hover:bg-red-400/10 text-white/25 hover:text-red-400 transition-colors">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input type="text" value={newOption} onChange={(e) => setNewOption(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void addOption(); }}
                          placeholder="Add option…" className={`${diSm} flex-1 min-w-0`} />
                        <button onClick={addOption}
                          className="px-3 py-1.5 text-xs font-bold text-white rounded-lg transition-all hover:brightness-110"
                          style={{ background: 'linear-gradient(135deg, #e94560, #c73652)' }}>
                          Add
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Type-specific settings */}
                  {fieldType === 'linear_scale' && (
                    <div>
                      <label className="block text-[10px] font-bold text-white/35 mb-2 uppercase tracking-wider">Scale settings</label>
                      <LinearScaleSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}
                  {fieldType === 'rating' && (
                    <div>
                      <label className="block text-[10px] font-bold text-white/35 mb-2 uppercase tracking-wider">Rating settings</label>
                      <RatingSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}
                  {fieldType === 'url' && (
                    <div>
                      <label className="block text-[10px] font-bold text-white/35 mb-2 uppercase tracking-wider">URL settings</label>
                      <UrlSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}
                  {fieldType === 'location' && (
                    <div>
                      <label className="block text-[10px] font-bold text-white/35 mb-2 uppercase tracking-wider">Location settings</label>
                      <LocationSettings settings={settings} onChange={saveSettings} />
                    </div>
                  )}
                  {fieldType === 'instruction_image' && (
                    <InstructionImageUploader
                      templateId={field.templateId} fieldId={field.id}
                      currentUrl={typeof settings.thumbnailUrl === 'string' ? settings.thumbnailUrl : null}
                      onUploaded={(url) => saveSettings({ ...settings, thumbnailUrl: url })}
                    />
                  )}
                  {fieldType === 'photo' && (
                    <p className="text-xs text-white/30 bg-white/3 rounded-xl px-3 py-2 border border-white/6">
                      Photo capture will be available when filling out this form.
                    </p>
                  )}
                  {fieldType === 'signature' && (
                    <div className="flex flex-col gap-3">
                      {/* Allow multiple signatures toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/60">Allow multiple signatures</span>
                        <button
                          onClick={() => saveSettings({ ...settings, multiple: !settings.multiple })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.multiple ? 'bg-[#e94560]' : 'bg-white/15'}`}>
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${settings.multiple ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                      {/* Button label (only when multiple=true) */}
                      {Boolean(settings.multiple) && (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">Add signer button label</label>
                            <input
                              type="text"
                              value={typeof settings.buttonLabel === 'string' ? settings.buttonLabel : ''}
                              onChange={(e) => setSettings({ ...settings, buttonLabel: e.target.value })}
                              onBlur={() => saveSettings(settings)}
                              placeholder="+ Add Signer"
                              className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 text-xs placeholder:text-white/20 focus:outline-none focus:border-[#e94560]/50"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-white/35 mb-1.5 uppercase tracking-wider">Max signers</label>
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={typeof settings.maxSigners === 'number' ? settings.maxSigners : 20}
                              onChange={(e) => setSettings({ ...settings, maxSigners: Number(e.target.value) })}
                              onBlur={() => saveSettings(settings)}
                              className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 text-xs focus:outline-none focus:border-[#e94560]/50"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Divider + logic */}
                  <div className="border-t border-white/6" />
                  <LogicEditor fieldId={field.id} logic={logic} allFields={allFields} onChange={saveLogic} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ── Add field panel ───────────────────────────────────────────────────────────

function AddFieldPanel({ onAdd, adding }: { onAdd: (type: string) => Promise<void>; adding: boolean }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(145deg, #1e1e35 0%, #1a1a2e 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-4 py-3 border-b border-white/6 flex items-center gap-2">
        <Plus size={13} className="text-[#e94560]" />
        <p className="text-xs font-bold text-white/60 uppercase tracking-wider">Add field</p>
        {adding && <Loader2 size={12} className="animate-spin text-white/30 ml-auto" />}
      </div>
      <div className="p-3 flex flex-col gap-3">
        {GROUPS.map((group) => {
          const groupFields = FIELD_TYPES.filter((f) => f.group === group);
          const accent = GROUP_ACCENT[group] ?? '#e94560';
          return (
            <div key={group}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: `${accent}80` }}>{group}</p>
              <div className="grid grid-cols-2 gap-1">
                {groupFields.map((f) => {
                  const FIcon = f.icon;
                  return (
                    <button key={f.type} onClick={() => onAdd(f.type)} disabled={adding}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-white/6 hover:border-white/15 bg-white/2 hover:bg-white/5 disabled:opacity-40 text-left transition-all group">
                      <FIcon size={12} className="text-white/25 group-hover:text-white/60 shrink-0 transition-colors" />
                      <span className="text-[11px] font-medium text-white/45 group-hover:text-white/80 truncate transition-colors">{f.label}</span>
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

// ── Field preview ─────────────────────────────────────────────────────────────

function FieldPreview({ field }: { field: FormField }) {
  const options = parseOptions(field.optionsJson);
  const settings = parseSettings(field.settingsJson);

  if (field.fieldType === 'section') {
    return <div className="border-b border-white/15 pb-1"><h3 className="text-sm font-bold text-white/80">{field.label || 'Section Heading'}</h3></div>;
  }
  if (field.fieldType === 'instruction') {
    return <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2"><p className="text-xs text-blue-300">{field.label || 'Instruction text'}</p></div>;
  }
  if (field.fieldType === 'instruction_image') {
    const thumbnailUrl = typeof settings.thumbnailUrl === 'string' ? settings.thumbnailUrl : null;
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 flex gap-3 items-start">
        <div className="w-12 h-12 rounded-lg border border-blue-500/20 flex items-center justify-center shrink-0 overflow-hidden bg-blue-500/10">
          {thumbnailUrl ? <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={14} className="text-blue-400/50" />}
        </div>
        <p className="text-xs text-blue-300">{field.label || 'Instruction text'}</p>
      </div>
    );
  }
  if (field.fieldType === 'page_break') {
    return (
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 border-t border-dashed border-white/15" />
        <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest shrink-0">Page Break</span>
        <div className="flex-1 border-t border-dashed border-white/15" />
      </div>
    );
  }

  const previewBox = 'h-9 rounded-xl border border-white/10 bg-white/3';

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-white/60">
        {field.label || <span className="italic text-white/25">Untitled</span>}
        {field.required && <span className="text-[#e94560] ml-0.5">*</span>}
      </label>
      {(field.fieldType === 'short_text' || field.fieldType === 'number') && <div className={previewBox} />}
      {field.fieldType === 'long_text' && <div className="h-16 rounded-xl border border-white/10 bg-white/3" />}
      {field.fieldType === 'url' && (
        <div className={`${previewBox} flex items-center px-3 gap-2`}>
          <Link size={12} className="text-white/15" />
          <span className="text-xs text-white/15">{typeof settings.placeholder === 'string' && settings.placeholder ? settings.placeholder : 'https://'}</span>
        </div>
      )}
      {field.fieldType === 'date' && <div className={`${previewBox} flex items-center px-3`}><Calendar size={12} className="text-white/15" /></div>}
      {field.fieldType === 'datetime' && <div className={`${previewBox} flex items-center px-3`}><Clock size={12} className="text-white/15" /></div>}
      {field.fieldType === 'yes_no' && (
        <div className="flex gap-2">
          <div className="px-4 py-1.5 rounded-xl border border-white/10 bg-white/3 text-xs text-white/25">Yes</div>
          <div className="px-4 py-1.5 rounded-xl border border-white/10 bg-white/3 text-xs text-white/25">No</div>
        </div>
      )}
      {field.fieldType === 'checkbox' && (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border border-white/15 bg-white/3" />
          <span className="text-xs text-white/25">Check to confirm</span>
        </div>
      )}
      {(field.fieldType === 'single_choice' || field.fieldType === 'multi_select') && (
        <div className="flex flex-col gap-1">
          {options.length > 0 ? options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`shrink-0 ${field.fieldType === 'single_choice' ? 'h-3.5 w-3.5 rounded-full' : 'h-3.5 w-3.5 rounded'} border border-white/15 bg-white/3`} />
              <span className="text-xs text-white/35">{o}</span>
            </div>
          )) : <p className="text-xs text-white/20 italic">No options yet</p>}
        </div>
      )}
      {field.fieldType === 'linear_scale' && (() => {
        const min = typeof settings.min === 'number' ? settings.min : 1;
        const max = typeof settings.max === 'number' ? settings.max : 10;
        const step = typeof settings.step === 'number' ? settings.step : 1;
        return (
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: Math.min(max - min + 1, 20) }, (_, i) => min + i * step).map((v) => (
              <span key={v} className="text-[11px] px-2 py-0.5 rounded-lg border border-white/10 bg-white/3 text-white/30">{v}</span>
            ))}
          </div>
        );
      })()}
      {field.fieldType === 'rating' && (() => {
        const style = typeof settings.style === 'string' ? settings.style : 'stars';
        const max = typeof settings.max === 'number' ? settings.max : 5;
        return (
          <div className="flex gap-1">
            {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((v) => (
              <span key={v} className="text-lg text-white/20">
                {style === 'stars' ? '☆' : style === 'emoji' ? ['😞','😐','🙂','😊','😄'][Math.min(v - 1, 4)] : (
                  <span className="text-xs px-1.5 py-0.5 rounded border border-white/10 bg-white/3 text-white/25">{v}</span>
                )}
              </span>
            ))}
          </div>
        );
      })()}
      {field.fieldType === 'location' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/3 w-fit">
          <MapPin size={12} className="text-white/20" />
          <span className="text-xs text-white/25">Capture current location</span>
        </div>
      )}
      {field.fieldType === 'photo' && (
        <div className="h-14 rounded-xl border-2 border-dashed border-white/10 bg-white/2 flex items-center justify-center">
          <Camera size={16} className="text-white/15" />
        </div>
      )}
      {field.fieldType === 'signature' && (
        <div className="h-14 rounded-xl border-2 border-dashed border-white/10 bg-white/2 flex items-center justify-center gap-2">
          <PenLine size={16} className="text-white/15" />
          {Boolean(parseSettings(field.settingsJson).multiple) && (
            <span className="text-[10px] text-white/20 font-semibold">Multiple signers</span>
          )}
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
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/forms/${templateId}/fields`, { credentials: 'include' });
      const data = await res.json() as { fields?: FormField[]; template?: FormTemplate; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setFields(data.fields ?? []);
      setTemplate(data.template ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [templateId]);

  useEffect(() => { void load(); }, [load]);

  async function addField(fieldType: string) {
    setAdding(true);
    try {
      const res = await fetch(`/api/forms/${templateId}/fields`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldType, label: getTypeDef(fieldType).label }),
      });
      const data = await res.json() as { field?: FormField; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to add field');
      if (data.field) setFields((prev) => [...prev, data.field!]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to add field'); }
    finally { setAdding(false); }
  }

  async function updateField(fieldId: number, updates: Partial<FormField>) {
    try {
      const res = await fetch(`/api/forms/${templateId}/fields/${fieldId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json() as { field?: FormField; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to update');
      if (data.field) setFields((prev) => prev.map((f) => (f.id === fieldId ? data.field! : f)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update field'); }
  }

  async function deleteField(fieldId: number) {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    try {
      await fetch(`/api/forms/${templateId}/fields/${fieldId}`, { method: 'DELETE', credentials: 'include' });
    } catch { void load(); }
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
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reordered.map((f) => ({ id: f.id, fieldOrder: f.fieldOrder })) }),
      });
    } catch { void load(); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" style={{ background: '#0d0d1a' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-white/30">Loading form…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#0d0d1a' }}>
      {/* Builder header */}
      <div className="sticky top-0 z-10 border-b border-white/6" style={{ background: 'rgba(13,13,26,0.97)', backdropFilter: 'blur(12px)' }}>
        {/* Accent line */}
        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #e94560, #ff6b8a 40%, transparent)' }} />
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Form Builder</p>
            <h2 className="font-heading font-bold text-base text-white truncate">{template?.name ?? 'Form'}</h2>
          </div>
          <div className="flex items-center gap-1 rounded-xl p-1 border border-white/8 bg-white/3">
            <button onClick={() => setView('build')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === 'build' ? 'text-white shadow-sm' : 'text-white/35 hover:text-white/60'
              }`}
              style={view === 'build' ? { background: 'linear-gradient(135deg, #e94560, #c73652)' } : {}}>
              <Zap size={11} /> Build
            </button>
            <button onClick={() => setView('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === 'preview' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
              }`}>
              <Eye size={11} /> Preview
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-red-300 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
          <AlertCircle size={13} /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400/50 hover:text-red-300"><X size={13} /></button>
        </div>
      )}

      {/* Build view */}
      {view === 'build' && (
        <div className="flex flex-col lg:flex-row gap-4 p-4 flex-1">
          {/* Add field panel — sticky sidebar */}
          <div className="lg:w-60 shrink-0">
            <div className="lg:sticky lg:top-20">
              <AddFieldPanel onAdd={addField} adding={adding} />
            </div>
          </div>

          {/* Field list */}
          <div className="flex-1 flex flex-col gap-2.5">
            {fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(233,69,96,0.1)', border: '1px solid rgba(233,69,96,0.2)' }}>
                  <Plus size={24} className="text-[#e94560]/60" />
                </div>
                <p className="text-sm font-bold text-white/40">No fields yet</p>
                <p className="text-xs text-white/20 mt-1">Add fields from the panel on the left</p>
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
          <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(145deg, #1e1e35 0%, #1a1a2e 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #e94560, #ff6b8a, transparent)' }} />
            <div className="p-5 flex flex-col gap-5">
              <div>
                <h2 className="font-heading font-bold text-lg text-white">{template?.name}</h2>
                {template?.description && <p className="text-sm text-white/40 mt-1">{template.description}</p>}
              </div>
              {fields.length === 0 ? (
                <p className="text-sm text-white/25 italic text-center py-8">No fields added yet</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {fields.map((field) => <FieldPreview key={field.id} field={field} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
