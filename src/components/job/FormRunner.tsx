import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Save,
  Send,
  SplitSquareHorizontal,
} from 'lucide-react';
import type { Job } from '@/lib/jobs-api';
import { motion, AnimatePresence } from 'motion/react';
import { type FormField, parseSettings } from '../FormFieldBuilder';
import {
  type SignatureAnswer,
  type MultiSignatureAnswer,
  parseSignatureAnswer,
  parseMultiSignatureAnswer,
} from './SignaturePad';
import { ReadOnlyAnswer, FieldInput } from './FormFieldRenderers';
import { useDocumentActionsRegistration } from '@/lib/document-actions-context';

// ── Types ─────────────────────────────────────────────────────────────────────

import type { FormSubmission, GpsAnswer } from './form-types';
import { isGpsAnswer, splitIntoPages } from './form-types';

type AnswerValue = string | string[] | boolean | SignatureAnswer | MultiSignatureAnswer | GpsAnswer | null;
type Answers = Record<number, AnswerValue>; // fieldId -> value

// ── Logic evaluator ───────────────────────────────────────────────────────────

function useFormLogic(fields: FormField[]): Set<number> {
  return useMemo(() => {
    const visible = new Set<number>();
    for (const field of fields) {
      visible.add(field.id);
    }
    return visible;
  }, [fields]);
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FormRunnerProps {
  jobId?: number;
  job?: Job | null;
  submission: FormSubmission;
  templateName: string;
  /** True when the form is opened in read-only (completed) mode */
  readOnly: boolean;
  /** Called by the shell to reopen a completed form */
  onReopen: () => void;
  /** Called when the form is successfully completed — shell decides what to do next */
  onComplete: () => void;
  /** Called when save-draft succeeds — shell can update its saved-at display */
  onSaved?: (at: Date) => void;
  /** Shell passes a ref so it can read live progress for its header */
  onProgressChange?: (answered: number, total: number) => void;
  /** Shell passes a ref so it can trigger Save Draft from outside */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  /** Shell passes a ref so it can trigger Complete Form from outside */
  completeRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

// ── Main form runner ──────────────────────────────────────────────────────────

export default function FormRunner({
  job,
  submission,
  templateName,
  readOnly,
  onReopen,
  onComplete,
  onSaved,
  onProgressChange,
  saveRef,
  completeRef,
}: FormRunnerProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [apiError, setApiError] = useState('');

  // ── Global Document Actions widget registration ───────────────────────────
  useDocumentActionsRegistration(
    readOnly && submission.status === 'completed'
      ? {
          documentType: 'completed_form',
          recordId: submission.id,
          title: templateName,
          jobId: job?.id,
          job,
          availableActions: ['pdf', 'email', 'secure_share'],
        }
      : null,
  );

  // ── Pagination state ─────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const formTopRef = useRef<HTMLDivElement>(null);

  const visibleFields = useFormLogic(fields);

  const pages = useMemo(() => splitIntoPages(fields), [fields]);
  const totalPages = pages.length;
  const isMultiPage = totalPages > 1;
  const currentPageFields = pages[currentPage] ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forms/${submission.templateId}/fields`, { credentials: 'include' });
      const data = await res.json() as { fields?: FormField[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load fields');
      setFields(data.fields ?? []);

      if (submission.answersJson) {
        try {
          setAnswers(JSON.parse(submission.answersJson) as Answers);
        } catch { /* ignore */ }
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [submission.templateId, submission.answersJson]);

  useEffect(() => { void load(); }, [load]);

  // ── Progress stats ────────────────────────────────────────────────────────────
  const inputFields = fields.filter(
    (f) => !['section', 'instruction', 'instruction_image', 'page_break'].includes(f.fieldType),
  );
  const visibleInputFields = inputFields.filter((f) => visibleFields.has(f.id));
  const answeredCount = visibleInputFields.filter((f) => {
    const v = answers[f.id];
    if (f.fieldType === 'signature') {
      const settings = parseSettings(f.settingsJson);
      if (settings.multiple) return !!parseMultiSignatureAnswer(v)?.signers.some((s) => s.signatureDataUrl);
      return !!parseSignatureAnswer(v)?.signatureDataUrl;
    }
    if (f.fieldType === 'location') return !!v && (isGpsAnswer(v) || (typeof v === 'string' && v.trim() !== ''));
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;

  // Notify shell of progress changes
  useEffect(() => {
    onProgressChange?.(answeredCount, visibleInputFields.length);
  }, [answeredCount, visibleInputFields.length, onProgressChange]);

  // ── Per-page progress ─────────────────────────────────────────────────────────
  const currentPageInputFields = currentPageFields.filter(
    (f) => !['section', 'instruction', 'instruction_image'].includes(f.fieldType) && visibleFields.has(f.id),
  );
  const currentPageAnswered = currentPageInputFields.filter((f) => {
    const v = answers[f.id];
    if (f.fieldType === 'signature') {
      const settings = parseSettings(f.settingsJson);
      if (settings.multiple) return !!parseMultiSignatureAnswer(v)?.signers.some((s) => s.signatureDataUrl);
      return !!parseSignatureAnswer(v)?.signatureDataUrl;
    }
    if (f.fieldType === 'location') return !!v && (isGpsAnswer(v) || (typeof v === 'string' && v.trim() !== ''));
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;

  function setAnswer(fieldId: number, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => { const n = { ...prev }; delete n[fieldId]; return n; });
    setSavedAt(null);
  }

  async function saveProgress() {
    setSaving(true);
    setApiError('');
    try {
      const res = await fetch(`/api/job-forms/${submission.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answersJson: JSON.stringify(answers), status: 'in_progress' }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      const now = new Date();
      setSavedAt(now);
      onSaved?.(now);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function validate(fieldsToCheck?: FormField[]): boolean {
    const checkFields = fieldsToCheck ?? fields;
    const newErrors: Record<number, string> = {};
    for (const field of checkFields) {
      if (!visibleFields.has(field.id)) continue;
      if (['section', 'instruction', 'instruction_image', 'page_break'].includes(field.fieldType)) continue;
      if (!field.required) continue;
      const val = answers[field.id];
      let empty: boolean;
      if (field.fieldType === 'signature') {
        const settings = parseSettings(field.settingsJson);
        if (settings.multiple) {
          const multi = parseMultiSignatureAnswer(val);
          empty = !multi?.signers.some((s) => s.name && s.signatureDataUrl);
        } else {
          const sig = parseSignatureAnswer(val);
          empty = !sig?.signatureDataUrl;
        }
      } else if (field.fieldType === 'location') {
        empty = !val || (typeof val === 'string' && val.trim() === '');
      } else {
        empty = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      }
      if (empty) newErrors[field.id] = 'This field is required';
    }
    setErrors((prev) => ({ ...prev, ...newErrors }));
    return Object.keys(newErrors).length === 0;
  }

  function validateCurrentPage(): boolean {
    return validate(currentPageFields);
  }

  async function completeForm() {
    if (!validate()) return;
    setCompleting(true);
    setApiError('');
    try {
      const res = await fetch(`/api/job-forms/${submission.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answersJson: JSON.stringify(answers), status: 'completed' }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Complete failed');
      }
      onComplete();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setCompleting(false);
    }
  }

  // Expose save/complete to shell via refs
  useEffect(() => {
    if (saveRef) saveRef.current = saveProgress;
    if (completeRef) completeRef.current = completeForm;
  });

  function scrollToTop() {
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goToNextPage() {
    if (!validateCurrentPage()) return;
    void saveProgress();
    setCurrentPage((p) => Math.min(p + 1, totalPages - 1));
    scrollToTop();
  }

  function goToPrevPage() {
    setCurrentPage((p) => Math.max(p - 1, 0));
    scrollToTop();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  // ── Completed / read-only view ──────────────────────────────────────────────
  if (readOnly) {
    return (
      <div className="flex flex-col gap-0 max-w-2xl mx-auto w-full" ref={formTopRef}>
        {apiError && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
            <AlertCircle size={13} /> {apiError}
            <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Fields — read-only */}
        <div className="w-full flex flex-col gap-5 pb-6">
          {fields.map((field) => {
            if (!visibleFields.has(field.id)) return null;

            if (field.fieldType === 'section') {
              return (
                <div key={field.id} className="border-b-2 border-slate-300 pb-1">
                  <h3 className="text-base font-bold text-slate-800">{field.label}</h3>
                </div>
              );
            }
            if (field.fieldType === 'instruction' || field.fieldType === 'instruction_image') {
              const settings = parseSettings(field.settingsJson);
              const thumbnailUrl = typeof settings.thumbnailUrl === 'string' ? settings.thumbnailUrl : null;
              return (
                <div key={field.id} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3 items-start">
                  {thumbnailUrl && (
                    <img src={thumbnailUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-blue-200" />
                  )}
                  <p className="text-sm text-blue-800">{field.label}</p>
                </div>
              );
            }
            if (field.fieldType === 'page_break') {
              return (
                <div key={field.id} className="flex items-center gap-3 py-2">
                  <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                  <SplitSquareHorizontal size={13} className="text-slate-400 shrink-0" />
                  <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                </div>
              );
            }

            return (
              <div key={field.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <ReadOnlyAnswer field={field} value={answers[field.id] ?? null} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Editable form ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full" ref={formTopRef}>

      {/* Overall progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: visibleInputFields.length > 0 ? `${(answeredCount / visibleInputFields.length) * 100}%` : '0%' }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Page indicator — only shown for multi-page forms */}
      {isMultiPage && (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal size={13} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">
              Page {currentPage + 1} of {totalPages}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setCurrentPage(i); scrollToTop(); }}
                className={`rounded-full transition-all ${
                  i === currentPage
                    ? 'w-5 h-2 bg-primary'
                    : i < currentPage
                    ? 'w-2 h-2 bg-emerald-400'
                    : 'w-2 h-2 bg-slate-200 hover:bg-slate-300'
                }`}
                title={`Page ${i + 1}`}
              />
            ))}
          </div>
          <span className="text-xs text-slate-400">
            {currentPageAnswered}/{currentPageInputFields.length} on this page
          </span>
        </div>
      )}

      {apiError && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertCircle size={13} /> {apiError}
        </div>
      )}

      {/* Fields — current page only */}
      <div className="w-full flex flex-col gap-5">
        <AnimatePresence mode="popLayout">
          {currentPageFields.map((field) => (
            <motion.div key={field.id} layout
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2 }}>
              <FieldInput
                field={field}
                value={answers[field.id] ?? null}
                onChange={(val) => setAnswer(field.id, val)}
                error={errors[field.id]}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Footer action bar — owned by the shell on the page, but also rendered  ──
          here for multi-page navigation (Prev/Next) which is internal to the form.
          Single-page Save Draft + Complete are rendered by the shell footer instead. */}
      {isMultiPage && (
        <div className="w-full bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 mb-6 sticky bottom-0 z-20"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={goToPrevPage}
              disabled={currentPage === 0 || saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>

            <button
              onClick={() => void saveProgress()}
              disabled={saving || completing}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors"
            >
              {saving
                ? <Loader2 size={14} className="animate-spin" />
                : savedAt
                ? <CheckCircle2 size={14} className="text-emerald-500" />
                : <Save size={14} />}
              Save
            </button>

            <div className="flex-1" />

            {currentPage < totalPages - 1 ? (
              <button
                type="button"
                onClick={goToNextPage}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => void completeForm()}
                disabled={saving || completing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
              >
                {completing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Complete Form
              </button>
            )}
          </div>
        </div>
      )}

      {/* Spacer so the shell's sticky footer doesn't cover the last field on single-page forms */}
      {!isMultiPage && <div className="h-24" />}
    </div>
  );
}
