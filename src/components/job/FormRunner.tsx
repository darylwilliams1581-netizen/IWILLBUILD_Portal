import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Save,
  Send,
  Pencil,
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

// Shared types/utils live in form-types.ts (keeps this file a pure default export for Fast Refresh)
import type { FormSubmission, GpsAnswer } from './form-types';
import { isGpsAnswer, splitIntoPages } from './form-types';

type AnswerValue = string | string[] | boolean | SignatureAnswer | MultiSignatureAnswer | GpsAnswer | null;
type Answers = Record<number, AnswerValue>; // fieldId -> value

// ── Logic evaluator ───────────────────────────────────────────────────────────

function useFormLogic(fields: FormField[]): Set<number> {
  return useMemo(() => {
    // Skip logic removed — all fields are always visible
    const visible = new Set<number>();
    for (const field of fields) {
      visible.add(field.id);
    }
    return visible;
  }, [fields]);
}

// ── Read-only answer display ──────────────────────────────────────────────────

// ── Main form runner ──────────────────────────────────────────────────────────

interface FormRunnerProps {
  jobId?: number;
  job?: Job | null;
  submission: FormSubmission;
  templateName: string;
  readOnly: boolean;
  onBack: () => void;
  onComplete: () => void;
}

export default function FormRunner({ job, submission, templateName, readOnly: initialReadOnly, onBack, onComplete }: FormRunnerProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [apiError, setApiError] = useState('');
  const [isDone, setIsDone] = useState(submission.status === 'completed');
  // readOnly can be toggled to "reopen" a completed form
  const [readOnly, setReadOnly] = useState(initialReadOnly && submission.status === 'completed');

  // ── Global Document Actions widget registration ───────────────────────────
  // Register a descriptor when viewing a completed form so the global floating
  // widget appears.  Unregisters automatically on unmount or when the form is
  // no longer in completed read-only mode.
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

  // Split fields into pages at page_break boundaries
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

      // Restore saved answers from the submission
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

  function setAnswer(fieldId: number, value: AnswerValue) {
    setAnswers((prev) => {
      const next = { ...prev, [fieldId]: value };
      return next;
    });
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
      setSavedAt(new Date());
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
        // GPS: accept either a GpsAnswer object or a non-empty string (manual address)
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
      setIsDone(true);
      setReadOnly(true);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setCompleting(false);
    }
  }

  async function reopenForm() {
    setApiError('');
    try {
      const res = await fetch(`/api/job-forms/${submission.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Reopen failed');
      }
      setIsDone(false);
      setReadOnly(false);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Reopen failed');
    }
  }


  // triggerPrint removed — Print Draft button removed from form header

  // Progress stats — across ALL pages
  const inputFields = fields.filter(
    (f) => !['section', 'instruction', 'instruction_image', 'page_break'].includes(f.fieldType),
  );
  const visibleInputFields = inputFields.filter((f) => visibleFields.has(f.id));
  const answeredCount = visibleInputFields.filter((f) => {
    const v = answers[f.id];
    if (f.fieldType === 'signature') {
      const settings = parseSettings(f.settingsJson);
      if (settings.multiple) {
        return !!parseMultiSignatureAnswer(v)?.signers.some((s) => s.signatureDataUrl);
      }
      return !!parseSignatureAnswer(v)?.signatureDataUrl;
    }
    if (f.fieldType === 'location') {
      return !!v && (isGpsAnswer(v) || (typeof v === 'string' && v.trim() !== ''));
    }
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;

  // Per-page progress
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
      <>
      <div className="flex flex-col gap-0 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-400">Viewing completed form</p>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={9} /> Completed
              </span>
            </div>
            <h2 className="font-heading font-bold text-base text-slate-900 truncate">{templateName}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={reopenForm}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-amber-400 hover:text-amber-600 text-slate-600 transition-colors"
            >
              <Pencil size={12} /> Edit / Reopen
            </button>
          </div>
        </div>

        {apiError && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">
            <AlertCircle size={13} /> {apiError}
          </div>
        )}

        {/* Fields */}
        <div className="w-full flex flex-col gap-5 pb-10">
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

        {/* Footer */}
        <div className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
          <button onClick={onBack} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Back to Forms
          </button>
        </div>
      </div>

      </>
    );
  }

  // ── Completion success screen ───────────────────────────────────────────────
  if (isDone) {
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
        <button onClick={onComplete}
          className="mt-2 px-6 py-2.5 bg-primary hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors">
          Back to Forms
        </button>
      </div>
    );
  }

  // ── Editable form ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full" ref={formTopRef}>
      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400">
            Filling out
            {savedAt && (
              <span className="ml-2 text-emerald-600 font-medium">
                · Saved {savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
          <h2 className="font-heading font-bold text-base text-slate-900 truncate">{templateName}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-700">{answeredCount}/{visibleInputFields.length}</p>
            <p className="text-[10px] text-slate-500">answered</p>
          </div>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden -mt-2">
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
          {/* Page dots */}
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
          {/* Per-page progress */}
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

      {/* Fields — current page only, all shown (skip logic disabled) */}
      <div className="w-full flex flex-col gap-5">
        <AnimatePresence mode="popLayout">
          {currentPageFields.map((field) => {
            return (
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
            );
          })}
        </AnimatePresence>
      </div>

      {/* Footer action bar — sticky on mobile */}
      <div className="w-full bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 mb-6 sm:mb-6 sticky bottom-0 sm:static z-20">
        {isMultiPage ? (
          /* Multi-page nav */
          <div className="flex items-center gap-2.5">
            {/* Prev */}
            <button
              type="button"
              onClick={goToPrevPage}
              disabled={currentPage === 0 || saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>

            {/* Save draft */}
            <button
              onClick={saveProgress}
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

            {/* Next or Complete */}
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
                onClick={completeForm}
                disabled={saving || completing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
              >
                {completing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Complete Form
              </button>
            )}
          </div>
        ) : (
          /* Single-page layout */
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              onClick={saveProgress}
              disabled={saving || completing}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 transition-colors sm:w-auto"
            >
              {saving
                ? <Loader2 size={14} className="animate-spin" />
                : savedAt
                ? <CheckCircle2 size={14} className="text-emerald-500" />
                : <Save size={14} />}
              Save Draft
            </button>
            <button
              onClick={completeForm}
              disabled={saving || completing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
            >
              {completing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Complete Form
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
