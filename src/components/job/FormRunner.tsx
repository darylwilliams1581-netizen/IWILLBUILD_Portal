import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Save,
  Send,
  MapPin,
  Camera,
  PenLine,
  Link,
  SplitSquareHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { type FormField, type FieldLogic, parseLogic, parseOptions, parseSettings } from '../FormFieldBuilder';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormSubmission {
  id: number;
  jobId: number;
  templateId: number;
  status: string;
  answersJson: string | null;
}

type AnswerValue = string | string[] | boolean | null;
type Answers = Record<number, AnswerValue>; // fieldId -> value

// ── Logic evaluator ───────────────────────────────────────────────────────────

function evaluateLogic(logic: FieldLogic, answers: Answers): boolean {
  // Returns true if the field SHOULD BE VISIBLE
  if (!logic.enabled) return true;

  const { action, triggerFieldId, operator, value } = logic;
  if (!triggerFieldId) return true;

  const triggerAnswer = answers[triggerFieldId];
  let conditionMet = false;

  switch (operator) {
    case 'is_checked':
      conditionMet = triggerAnswer === true;
      break;
    case 'is_not_checked':
      conditionMet = triggerAnswer !== true;
      break;
    case 'equals':
      if (Array.isArray(triggerAnswer)) {
        conditionMet = triggerAnswer.includes(value);
      } else {
        conditionMet = String(triggerAnswer ?? '').toLowerCase() === value.toLowerCase();
      }
      break;
    case 'not_equals':
      if (Array.isArray(triggerAnswer)) {
        conditionMet = !triggerAnswer.includes(value);
      } else {
        conditionMet = String(triggerAnswer ?? '').toLowerCase() !== value.toLowerCase();
      }
      break;
    case 'contains':
      if (Array.isArray(triggerAnswer)) {
        conditionMet = triggerAnswer.some((v) => v.toLowerCase().includes(value.toLowerCase()));
      } else {
        conditionMet = String(triggerAnswer ?? '').toLowerCase().includes(value.toLowerCase());
      }
      break;
    default:
      conditionMet = false;
  }

  if (action === 'show') return conditionMet;
  if (action === 'hide') return !conditionMet;
  return true;
}

function useFormLogic(fields: FormField[], answers: Answers): Set<number> {
  return useMemo(() => {
    const visible = new Set<number>();
    for (const field of fields) {
      const logic = parseLogic(field.logicJson);
      if (evaluateLogic(logic, answers)) {
        visible.add(field.id);
      }
    }
    return visible;
  }, [fields, answers]);
}

// ── Individual field renderer ─────────────────────────────────────────────────

interface FieldInputProps {
  field: FormField;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
  error?: string;
}

function FieldInput({ field, value, onChange, error }: FieldInputProps) {
  const options = parseOptions(field.optionsJson);
  const settings = parseSettings(field.settingsJson);

  const baseInput = 'w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const errorBorder = error ? 'border-red-400' : 'border-slate-200';

  // Layout types — no answer
  if (field.fieldType === 'section') {
    return (
      <div className="border-b-2 border-slate-300 pb-1">
        <h3 className="text-base font-bold text-slate-800">{field.label}</h3>
      </div>
    );
  }
  if (field.fieldType === 'instruction') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <p className="text-sm text-blue-800">{field.label}</p>
      </div>
    );
  }
  if (field.fieldType === 'instruction_image') {
    const thumbnailUrl = typeof settings.thumbnailUrl === 'string' ? settings.thumbnailUrl : null;
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3 items-start">
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-blue-200" />
        )}
        <p className="text-sm text-blue-800">{field.label}</p>
      </div>
    );
  }
  if (field.fieldType === 'page_break') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 border-t-2 border-dashed border-slate-300" />
        <SplitSquareHorizontal size={13} className="text-slate-400 shrink-0" />
        <div className="flex-1 border-t-2 border-dashed border-slate-300" />
      </div>
    );
  }

  // Input fields
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {field.fieldType === 'short_text' && (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${errorBorder}`}
          placeholder="Type your answer…"
        />
      )}

      {field.fieldType === 'long_text' && (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={`${baseInput} ${errorBorder} resize-none`}
          placeholder="Type your answer…"
        />
      )}

      {field.fieldType === 'number' && (
        <input
          type="number"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${errorBorder}`}
          placeholder="0"
        />
      )}

      {field.fieldType === 'url' && (
        <div className="relative">
          <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseInput} ${errorBorder} pl-9`}
            placeholder={typeof settings.placeholder === 'string' ? settings.placeholder : 'https://'}
          />
        </div>
      )}

      {field.fieldType === 'date' && (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${errorBorder}`}
        />
      )}

      {field.fieldType === 'datetime' && (
        <input
          type="datetime-local"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${errorBorder}`}
        />
      )}

      {field.fieldType === 'yes_no' && (
        <div className="flex gap-2">
          {(['yes', 'no'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(value === opt ? null : opt)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                value === opt
                  ? opt === 'yes'
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-red-500 border-red-500 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {opt === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )}

      {field.fieldType === 'checkbox' && (
        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            onClick={() => onChange(!value)}
            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
              value === true ? 'bg-primary border-primary' : 'bg-white border-slate-300 group-hover:border-primary'
            }`}
          >
            {value === true && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="text-sm text-slate-700">Check to confirm</span>
        </label>
      )}

      {field.fieldType === 'single_choice' && (
        <div className="flex flex-col gap-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => onChange(value === opt ? null : opt)}
                className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  value === opt ? 'border-primary' : 'border-slate-300 group-hover:border-primary'
                }`}
              >
                {value === opt && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <span className="text-sm text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {field.fieldType === 'multi_select' && (
        <div className="flex flex-col gap-2">
          {options.map((opt) => {
            const selected = Array.isArray(value) ? value.includes(opt) : false;
            return (
              <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => {
                    const current = Array.isArray(value) ? value : [];
                    onChange(selected ? current.filter((v) => v !== opt) : [...current, opt]);
                  }}
                  className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    selected ? 'bg-primary border-primary' : 'bg-white border-slate-300 group-hover:border-primary'
                  }`}
                >
                  {selected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-slate-700">{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {field.fieldType === 'linear_scale' && (() => {
        const min = typeof settings.min === 'number' ? settings.min : 1;
        const max = typeof settings.max === 'number' ? settings.max : 10;
        const step = typeof settings.step === 'number' ? settings.step : 1;
        const leftLabel = typeof settings.leftLabel === 'string' ? settings.leftLabel : '';
        const rightLabel = typeof settings.rightLabel === 'string' ? settings.rightLabel : '';
        const vals = Array.from({ length: Math.min(max - min + 1, 20) }, (_, i) => min + i * step);
        const selected = typeof value === 'string' ? Number(value) : null;
        return (
          <div>
            <div className="flex gap-1.5 flex-wrap mb-1">
              {vals.map((v) => (
                <button
                  key={v}
                  onClick={() => onChange(selected === v ? null : String(v))}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${
                    selected === v ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {(leftLabel || rightLabel) && (
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>{leftLabel}</span><span>{rightLabel}</span>
              </div>
            )}
          </div>
        );
      })()}

      {field.fieldType === 'rating' && (() => {
        const style = typeof settings.style === 'string' ? settings.style : 'stars';
        const max = typeof settings.max === 'number' ? settings.max : 5;
        const selected = typeof value === 'string' ? Number(value) : null;
        const emojis = ['😞', '😐', '🙂', '😊', '😄'];
        return (
          <div className="flex gap-2">
            {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                onClick={() => onChange(selected === v ? null : String(v))}
                className={`text-2xl transition-transform hover:scale-110 ${selected !== null && v <= selected ? 'opacity-100' : 'opacity-40'}`}
              >
                {style === 'stars'
                  ? (selected !== null && v <= selected ? '★' : '☆')
                  : style === 'emoji'
                  ? emojis[Math.min(v - 1, 4)]
                  : (
                    <span className={`text-sm px-2 py-1 rounded-lg border font-semibold transition-colors ${selected === v ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                      {v}
                    </span>
                  )}
              </button>
            ))}
          </div>
        );
      })()}

      {field.fieldType === 'location' && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              if (!navigator.geolocation) {
                onChange('GPS not available');
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  onChange(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} (±${Math.round(pos.coords.accuracy)}m)`);
                },
                () => onChange(''),
              );
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 w-fit transition-colors"
          >
            <MapPin size={14} className="text-primary" />
            {value ? 'Re-capture location' : 'Capture current location'}
          </button>
          {value && typeof value === 'string' && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 font-mono">{value}</p>
          )}
          {settings.manualAddress !== false && (
            <input
              type="text"
              value={typeof value === 'string' && value.includes(',') ? '' : (typeof value === 'string' ? value : '')}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Or enter address manually…"
              className={`${baseInput} ${errorBorder}`}
            />
          )}
        </div>
      )}

      {field.fieldType === 'photo' && (
        <div className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
          <Camera size={20} className="text-slate-300" />
          <p className="text-xs text-slate-400">Photo upload coming soon</p>
        </div>
      )}

      {field.fieldType === 'signature' && (
        <div className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
          <PenLine size={20} className="text-slate-300" />
          <p className="text-xs text-slate-400">Signature capture coming soon</p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

// ── Main form runner ──────────────────────────────────────────────────────────

interface FormRunnerProps {
  jobId: number;
  submission: FormSubmission;
  templateName: string;
  onBack: () => void;
  onComplete: () => void;
}

export default function FormRunner({ jobId, submission, templateName, onBack, onComplete }: FormRunnerProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [apiError, setApiError] = useState('');
  const [done, setDone] = useState(submission.status === 'completed');

  // Evaluate which fields are visible
  const visibleFields = useFormLogic(fields, answers);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forms/${submission.templateId}/fields`, { credentials: 'include' });
      const data = await res.json() as { fields?: FormField[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load fields');
      setFields(data.fields ?? []);

      // Restore saved answers
      if (submission.answersJson) {
        try {
          const saved = JSON.parse(submission.answersJson) as Answers;
          setAnswers(saved);
        } catch { /* ignore */ }
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [submission.templateId, submission.answersJson]);

  useEffect(() => { void load(); }, [load]);

  function setAnswer(fieldId: number, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error for this field
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    setSaved(false);
  }

  async function saveProgress() {
    setSaving(true);
    setApiError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/forms/${submission.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answersJson: JSON.stringify(answers), status: 'in_progress' }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function validate(): boolean {
    const newErrors: Record<number, string> = {};
    for (const field of fields) {
      // Skip hidden fields
      if (!visibleFields.has(field.id)) continue;
      // Skip layout/non-answer fields
      if (['section', 'instruction', 'instruction_image', 'page_break'].includes(field.fieldType)) continue;
      if (!field.required) continue;

      const val = answers[field.id];
      let empty = false;
      if (val === null || val === undefined || val === '') empty = true;
      else if (Array.isArray(val) && val.length === 0) empty = true;

      if (empty) {
        newErrors[field.id] = 'This field is required';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function completeForm() {
    if (!validate()) return;
    setCompleting(true);
    setApiError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/forms/${submission.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answersJson: JSON.stringify(answers), status: 'completed' }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Complete failed');
      }
      setDone(true);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setCompleting(false);
    }
  }

  // Visible input fields (for progress count)
  const inputFields = fields.filter(
    (f) => !['section', 'instruction', 'instruction_image', 'page_break'].includes(f.fieldType),
  );
  const visibleInputFields = inputFields.filter((f) => visibleFields.has(f.id));
  const answeredCount = visibleInputFields.filter((f) => {
    const v = answers[f.id];
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  // Completed state
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="p-5 rounded-full bg-emerald-50 border-2 border-emerald-200"
        >
          <CheckCircle2 size={36} className="text-emerald-500" />
        </motion.div>
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900">Form Completed</h2>
          <p className="text-sm text-slate-500 mt-1">{templateName}</p>
        </div>
        <button
          onClick={onComplete}
          className="mt-2 px-6 py-2.5 bg-primary hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Back to Forms
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400">Filling out</p>
          <h2 className="font-heading font-bold text-base text-slate-900 truncate">{templateName}</h2>
        </div>
        {/* Progress */}
        <div className="text-right shrink-0">
          <p className="text-xs font-bold text-slate-700">{answeredCount}/{visibleInputFields.length}</p>
          <p className="text-[10px] text-slate-400">answered</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <motion.div
          className="h-full bg-primary"
          animate={{ width: visibleInputFields.length > 0 ? `${(answeredCount / visibleInputFields.length) * 100}%` : '0%' }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {apiError && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertCircle size={13} /> {apiError}
        </div>
      )}

      {/* Fields */}
      <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
        <div className="flex flex-col gap-5">
          <AnimatePresence mode="popLayout">
            {fields.map((field) => {
              const visible = visibleFields.has(field.id);
              if (!visible) return null;
              return (
                <motion.div
                  key={field.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <FieldInput
                    field={field}
                    value={answers[field.id] ?? null}
                    onChange={(val) => setAnswer(field.id, val)}
                    error={errors[field.id]}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={saveProgress}
          disabled={saving || completing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Save size={14} />}
          {saved ? 'Saved' : 'Save progress'}
        </button>
        <button
          onClick={completeForm}
          disabled={saving || completing}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 transition-colors"
        >
          {completing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Complete form
        </button>
      </div>
    </div>
  );
}
