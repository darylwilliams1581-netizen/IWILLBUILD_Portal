import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { escapeHtml, safeUrl } from '@/lib/html-escape';
import { openPrintWindow } from '@/lib/print-html';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Save,
  Send,
  Printer,
  SkipForward,
  Pencil,
} from 'lucide-react';
import type { Job } from '@/lib/jobs-api';
import { motion, AnimatePresence } from 'motion/react';
import { type FormField, type FieldLogic, parseLogic, parseSettings } from '../FormFieldBuilder';
import SignaturePad, {
  type SignatureAnswer,
  type MultiSignatureAnswer,
  parseSignatureAnswer,
  parseMultiSignatureAnswer,
} from './SignaturePad';
import { ReadOnlyAnswer, FieldInput } from './FormFieldRenderers';
import { parseSkipRules } from '@/lib/skip-logic-types';
import { evaluateSkipRules } from '@/lib/skip-logic-engine';
import type { SkipAuditEntry } from '@/lib/skip-logic-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormSubmission {
  id: number;
  jobId: number;
  templateId: number;
  status: string;
  answersJson: string | null;
  completedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type AnswerValue = string | string[] | boolean | SignatureAnswer | MultiSignatureAnswer | GpsAnswer | null;
type Answers = Record<number, AnswerValue>; // fieldId -> value

// ── GPS structured answer ─────────────────────────────────────────────────────

export interface GpsAnswer {
  lat: number;
  lng: number;
  accuracy: number; // metres
  timestamp: string; // ISO
  address?: string;  // manual override
}

export function isGpsAnswer(v: unknown): v is GpsAnswer {
  return typeof v === 'object' && v !== null && 'lat' in v && 'lng' in v;
}

export function formatGps(g: GpsAnswer): string {
  if (g.address) return `${g.address} (${g.lat.toFixed(5)}, ${g.lng.toFixed(5)})`;
  return `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)} ±${Math.round(g.accuracy)}m`;
}

// ── Page-splitting utility ────────────────────────────────────────────────────
// Splits a flat field list into pages at every page_break field.
// Page 0 = fields before the first page_break.
// Each page_break starts a new page (the page_break field itself is NOT included).

export function splitIntoPages(fields: FormField[]): FormField[][] {
  const pages: FormField[][] = [[]];
  for (const field of fields) {
    if (field.fieldType === 'page_break') {
      pages.push([]);
    } else {
      pages[pages.length - 1].push(field);
    }
  }
  // Drop trailing empty pages
  while (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  return pages;
}

// ── Logic evaluator ───────────────────────────────────────────────────────────

function evaluateLogic(logic: FieldLogic, answers: Answers): boolean {
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
      conditionMet = Array.isArray(triggerAnswer)
        ? triggerAnswer.includes(value)
        : String(triggerAnswer ?? '').toLowerCase() === value.toLowerCase();
      break;
    case 'not_equals':
      conditionMet = Array.isArray(triggerAnswer)
        ? !triggerAnswer.includes(value)
        : String(triggerAnswer ?? '').toLowerCase() !== value.toLowerCase();
      break;
    case 'contains':
      conditionMet = Array.isArray(triggerAnswer)
        ? triggerAnswer.some((v) => v.toLowerCase().includes(value.toLowerCase()))
        : String(triggerAnswer ?? '').toLowerCase().includes(value.toLowerCase());
      break;
    default:
      conditionMet = false;
  }

  return action === 'show' ? conditionMet : !conditionMet;
}

function useFormLogic(fields: FormField[], answers: Answers): Set<number> {
  return useMemo(() => {
    const visible = new Set<number>();
    for (const field of fields) {
      if (evaluateLogic(parseLogic(field.logicJson), answers)) {
        visible.add(field.id);
      }
    }
    return visible;
  }, [fields, answers]);
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

export default function FormRunner({ jobId, job, submission, templateName, readOnly: initialReadOnly, onBack, onComplete }: FormRunnerProps) {
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

  // ── Pagination state ─────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const formTopRef = useRef<HTMLDivElement>(null);

  // ── Skip logic state ─────────────────────────────────────────────────────────
  // Set of field ids that have been skipped (auto-unrequired at validation time)
  const [skippedFieldIds, setSkippedFieldIds] = useState<Set<number>>(new Set());
  // Toast shown when a skip fires
  const [skipToast, setSkipToast] = useState<string | null>(null);
  // Back-stack: ordered list of [pageIndex, fieldId] pairs the user actually visited
  const [backStack, setBackStack] = useState<Array<{ page: number; fieldId: number }>>([]);

  const visibleFields = useFormLogic(fields, answers);

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

      // Evaluate skip rules for this field after the answer is set
      const field = fields.find((f) => f.id === fieldId);
      if (field) {
        const skipRules = parseSkipRules(field.logicJson);
        if (skipRules.length > 0) {
          const result = evaluateSkipRules(fieldId, skipRules, next as Record<number, unknown>);
          if (result.jumpTo !== null) {
            // Fire skip asynchronously so state update completes first
            setTimeout(() => {
              handleSkipFired(fieldId, result.jumpTo!, result.firedRule?.id ?? '', result.triggerValue, field.label, result.firedRule?.action ?? null);
            }, 0);
          }
        }
      }

      return next;
    });
    setErrors((prev) => { const n = { ...prev }; delete n[fieldId]; return n; });
    setSavedAt(null);
  }

  function handleSkipFired(
    sourceFieldId: number,
    jumpTo: number | 'end',
    ruleId: string,
    triggerValue: string,
    sourceFieldLabel: string,
    action: { targetType: string; targetFieldId?: number; targetLabel?: string } | null,
  ) {
    if (jumpTo === 'end') {
      // Mark all remaining fields as skipped
      const sourceIdx = fields.findIndex((f) => f.id === sourceFieldId);
      const remaining = fields.slice(sourceIdx + 1).map((f) => f.id);
      setSkippedFieldIds((prev) => new Set([...prev, ...remaining]));
      setSkipToast('Skipping to end of form…');
      setTimeout(() => setSkipToast(null), 2500);
      // Jump to last page and auto-complete
      setCurrentPage(pages.length - 1);
      scrollToTop();
      // Fire audit log
      void fireSkipAudit({
        sourceFieldId,
        sourceFieldLabel,
        ruleId,
        triggerValue,
        targetType: 'end',
        targetFieldId: null,
        targetFieldLabel: null,
      });
      return;
    }

    // Jump to a specific field
    const targetField = fields.find((f) => f.id === jumpTo);
    if (!targetField) return;

    // Find which page the target field is on
    let targetPage = 0;
    for (let p = 0; p < pages.length; p++) {
      if (pages[p].some((f) => f.id === jumpTo)) {
        targetPage = p;
        break;
      }
    }

    // Mark all fields between source and target as skipped
    const sourceIdx = fields.findIndex((f) => f.id === sourceFieldId);
    const targetIdx = fields.findIndex((f) => f.id === jumpTo);
    if (targetIdx > sourceIdx) {
      const skipped = fields.slice(sourceIdx + 1, targetIdx).map((f) => f.id);
      setSkippedFieldIds((prev) => new Set([...prev, ...skipped]));
    }

    // Push current position to back-stack
    setBackStack((prev) => [...prev, { page: currentPage, fieldId: sourceFieldId }]);

    const targetLabel = action?.targetLabel ?? targetField.label ?? `Field #${jumpTo}`;
    setSkipToast(`Skipped to: ${targetLabel}`);
    setTimeout(() => setSkipToast(null), 2500);

    setCurrentPage(targetPage);
    scrollToTop();

    // Fire audit log
    void fireSkipAudit({
      sourceFieldId,
      sourceFieldLabel,
      ruleId,
      triggerValue,
      targetType: action?.targetType ?? 'field',
      targetFieldId: jumpTo,
      targetFieldLabel: targetLabel,
    });
  }

  async function fireSkipAudit(data: {
    sourceFieldId: number;
    sourceFieldLabel: string;
    ruleId: string;
    triggerValue: string;
    targetType: string;
    targetFieldId: number | null;
    targetFieldLabel: string | null;
  }) {
    try {
      const entry: Partial<SkipAuditEntry> = {
        submissionId: submission.id,
        templateId: submission.templateId,
        jobId: jobId,
        ruleId: data.ruleId,
        sourceFieldId: data.sourceFieldId,
        sourceFieldLabel: data.sourceFieldLabel,
        triggerValue: data.triggerValue,
        targetType: data.targetType as SkipAuditEntry['targetType'],
        targetFieldId: data.targetFieldId ?? undefined,
        targetFieldLabel: data.targetFieldLabel ?? undefined,
        triggeredAt: new Date().toISOString(),
      };
      await fetch('/api/forms/skip-audit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch { /* non-fatal */ }
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
      // Skipped fields are auto-unrequired — never block submission
      if (skippedFieldIds.has(field.id)) continue;
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

  // ── Print / PDF ─────────────────────────────────────────────────────────────

  async function triggerPrint(
    printFields: FormField[],
    printAnswers: Answers,
    printVisible: Set<number>,
    formTitle: string,
    sub: FormSubmission,
    jobData: Job | null | undefined,
    isDraft: boolean,
  ) {
    // Fetch PDF style settings
    interface PdfStyle { headerText?: string; footerText?: string; formDisclaimer?: string; showFooterOnForms?: boolean }
    let pdfStyle: PdfStyle = {};
    try {
      const r = await fetch('/api/company-settings', { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { pdf?: PdfStyle };
        pdfStyle = d.pdf ?? {};
      }
    } catch { /* use defaults */ }

    const showFooter = pdfStyle.showFooterOnForms !== false;

    const companyName = escapeHtml((window as unknown as Record<string, string>).__iwb_company_name ?? '');
    const jobNum = escapeHtml(jobData?.jobNumber ?? '');
    const jobName = escapeHtml(jobData?.name ?? '');
    const jobAddress = escapeHtml(jobData?.address ?? '');
    const completedBy = escapeHtml(sub.completedByName ?? 'Unknown');
    const completedAt = escapeHtml(new Date(sub.updatedAt ?? sub.createdAt ?? Date.now()).toLocaleString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }));
    const statusLabel = isDraft ? 'DRAFT' : 'COMPLETED';
    const statusColor = isDraft ? '#d97706' : '#059669';

    // Build field HTML
    const fieldRows = printFields.map((field) => {
      if (!printVisible.has(field.id)) return '';

      if (field.fieldType === 'section') {
        return `<div class="section-heading">${escapeHtml(field.label)}</div>`;
      }
      if (field.fieldType === 'instruction' || field.fieldType === 'instruction_image') {
        const s = parseSettings(field.settingsJson);
        const thumb = typeof s.thumbnailUrl === 'string' ? s.thumbnailUrl : null;
        const safeSrc = thumb ? safeUrl(thumb) : '';
        return `<div class="instruction">${safeSrc ? `<img src="${safeSrc}" class="thumb" alt="" />` : ''}<span>${escapeHtml(field.label)}</span></div>`;
      }
      if (field.fieldType === 'page_break') {
        return `<div class="page-break-print"></div>`;
      }

      const val = printAnswers[field.id];
      const empty = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      let answerHtml = `<span class="no-answer">No answer</span>`;

      if (!empty) {
        if (field.fieldType === 'yes_no') {
          const v = String(val);
          answerHtml = `<span class="badge ${v === 'yes' ? 'badge-yes' : 'badge-no'}">${v === 'yes' ? '✓ Yes' : '✗ No'}</span>`;
        } else if (field.fieldType === 'checkbox') {
          answerHtml = `<span class="badge ${val === true ? 'badge-yes' : 'badge-no'}">${val === true ? '✓ Checked' : '✗ Unchecked'}</span>`;
        } else if (field.fieldType === 'multi_select' && Array.isArray(val)) {
          answerHtml = val.map((v) => `<span class="chip">${escapeHtml(v)}</span>`).join('');
        } else if (field.fieldType === 'rating') {
          const s = parseSettings(field.settingsJson);
          const max = typeof s.max === 'number' ? s.max : 5;
          const num = Number(val);
          answerHtml = Array.from({ length: Math.min(max, 10) }, (_, i) =>
            `<span style="color:${i < num ? '#f59e0b' : '#d1d5db'};font-size:18px">★</span>`
          ).join('');
        } else if (field.fieldType === 'url') {
          const safeHref = safeUrl(val);
          answerHtml = safeHref ? `<a href="${safeHref}">${escapeHtml(String(val))}</a>` : escapeHtml(String(val));
        } else if (field.fieldType === 'long_text') {
          answerHtml = `<p class="long-text">${escapeHtml(String(val)).replace(/\n/g, '<br/>')}</p>`;
        } else if (field.fieldType === 'location') {
          const gps = isGpsAnswer(val) ? val : null;
          if (gps) {
            const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(gps.lat)},${encodeURIComponent(gps.lng)}`;
            answerHtml = `<div class="gps-block">
              ${gps.address ? `<div class="gps-address">${escapeHtml(gps.address)}</div>` : ''}
              <div class="gps-coords">${escapeHtml(gps.lat.toFixed(6))}, ${escapeHtml(gps.lng.toFixed(6))} <span class="gps-acc">±${escapeHtml(gps.accuracy)}m</span></div>
              <div class="gps-time">Captured ${escapeHtml(new Date(gps.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
              <a href="${mapsUrl}" class="gps-link">View on Google Maps ↗</a>
            </div>`;
          } else {
            answerHtml = `<span class="mono">${escapeHtml(String(val))}</span>`;
          }
        } else if (field.fieldType === 'signature') {
          const s = parseSettings(field.settingsJson);
          if (s.multiple) {
            const multi = parseMultiSignatureAnswer(val);
            if (multi?.signers?.length) {
              answerHtml = multi.signers.map((sig) => {
                if (!sig.name && !sig.signatureDataUrl) return '';
                return `<div class="sig-block">
                  <div class="sig-name">${sig.name ?? 'Unknown'}</div>
                  ${sig.signatureDataUrl ? `<img src="${sig.signatureDataUrl}" class="sig-img" alt="Signature" />` : ''}
                  ${sig.signedAt ? `<div class="sig-date">Signed: ${new Date(sig.signedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
                </div>`;
              }).join('');
            }
          } else {
            const sig = parseSignatureAnswer(val);
            if (sig?.signatureDataUrl) {
              answerHtml = `<div class="sig-block">
                ${sig.name ? `<div class="sig-name">${sig.name}</div>` : ''}
                <img src="${sig.signatureDataUrl}" class="sig-img" alt="Signature" />
                ${sig.signedAt ? `<div class="sig-date">Signed: ${new Date(sig.signedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
              </div>`;
            }
          }
        } else {
          answerHtml = `<span>${String(val)}</span>`;
        }
      }

      return `<div class="field-row">
        <div class="field-label">${escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ''}</div>
        <div class="field-answer">${answerHtml}</div>
      </div>`;
    }).join('');

    const docTitle = `${jobNum ? jobNum + ' - ' : ''}${escapeHtml(formTitle)}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${docTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 14mm; }
  @page { size: A4; margin: 14mm; }
  @media print { body { padding: 0; } }

  .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f97316; padding-bottom: 12px; margin-bottom: 20px; }
  .company-name { font-size: 18px; font-weight: 800; color: #f97316; letter-spacing: -0.3px; }
  .form-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; background: ${isDraft ? '#fef3c7' : '#d1fae5'}; color: ${statusColor}; border: 1.5px solid ${isDraft ? '#fcd34d' : '#6ee7b7'}; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 20px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .meta-row { display: flex; flex-direction: column; gap: 1px; }
  .meta-label { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; }
  .meta-value { font-size: 12px; font-weight: 600; color: #334155; }

  .section-heading { font-size: 13px; font-weight: 800; color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin: 20px 0 12px; text-transform: uppercase; letter-spacing: 0.3px; }
  .instruction { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 12px; margin: 8px 0; font-size: 12px; color: #1e40af; display: flex; gap: 10px; align-items: flex-start; }
  .instruction .thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
  .page-break-line { border-top: 2px dashed #cbd5e1; margin: 16px 0; }
  .page-break-print { page-break-after: always; height: 0; margin: 0; padding: 0; }

  .field-row { margin-bottom: 14px; page-break-inside: avoid; }
  .field-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
  .field-label .req { color: #ef4444; }
  .field-answer { font-size: 13px; color: #1e293b; }
  .no-answer { color: #94a3b8; font-style: italic; }
  .long-text { white-space: pre-wrap; line-height: 1.6; }
  .mono { font-family: monospace; font-size: 12px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
  .badge-yes { background: #d1fae5; color: #065f46; }
  .badge-no { background: #fee2e2; color: #991b1b; }
  .chip { display: inline-block; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 600; color: #475569; margin: 2px 3px 2px 0; }

  .sig-block { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin: 4px 0; background: #fafafa; page-break-inside: avoid; }
  .sig-name { font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 6px; }
  .sig-img { max-width: 260px; max-height: 100px; border: 1px solid #e2e8f0; border-radius: 4px; background: #fff; display: block; }

  .gps-block { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; margin: 4px 0; }
  .gps-address { font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 3px; }
  .gps-coords { font-family: monospace; font-size: 12px; color: #15803d; }
  .gps-acc { color: #86efac; }
  .gps-time { font-size: 11px; color: #4ade80; margin-top: 2px; }
  .gps-link { font-size: 11px; color: #16a34a; text-decoration: underline; display: inline-block; margin-top: 4px; }
  .sig-date { font-size: 10px; color: #94a3b8; margin-top: 4px; }

  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  .disclaimer { font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; padding: 10px 0; line-height: 1.6; margin-top: 8px; }
</style>
</head>
<body>
  <div class="report-header">
    <div>
      ${pdfStyle.headerText ? `<div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:2px">${escapeHtml(pdfStyle.headerText)}</div>` : ''}
      ${companyName ? `<div class="company-name">${companyName}</div>` : ''}
      <div class="form-title">${escapeHtml(formTitle)}</div>
    </div>
    <div><span class="status-badge">${statusLabel}</span></div>
  </div>

  <div class="meta-grid">
    ${jobNum ? `<div class="meta-row"><div class="meta-label">Job Number</div><div class="meta-value">${jobNum}</div></div>` : ''}
    ${jobName ? `<div class="meta-row"><div class="meta-label">Job Name</div><div class="meta-value">${jobName}</div></div>` : ''}
    ${jobAddress ? `<div class="meta-row"><div class="meta-label">Address</div><div class="meta-value">${jobAddress}</div></div>` : ''}
    <div class="meta-row"><div class="meta-label">Completed By</div><div class="meta-value">${completedBy}</div></div>
    <div class="meta-row"><div class="meta-label">Date / Time</div><div class="meta-value">${completedAt}</div></div>
    <div class="meta-row"><div class="meta-label">Status</div><div class="meta-value">${statusLabel}</div></div>
  </div>

  ${fieldRows}

  ${pdfStyle.formDisclaimer ? `<div class="disclaimer"><strong>Disclaimer:</strong> ${escapeHtml(pdfStyle.formDisclaimer)}</div>` : ''}

  ${showFooter ? `<div class="footer">
    <span>${escapeHtml(pdfStyle.footerText || (companyName ? companyName + ' — ' : '') + formTitle)}</span>
    <span>Printed ${escapeHtml(new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>
  </div>` : ''}
</body>
</html>`;

    openPrintWindow(html, true);
  }

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
    // If we have a back-stack entry, use it (respects skip jumps)
    if (backStack.length > 0) {
      const prev = backStack[backStack.length - 1];
      setBackStack((s) => s.slice(0, -1));
      setCurrentPage(prev.page);
      scrollToTop();
    } else {
      setCurrentPage((p) => Math.max(p - 1, 0));
      scrollToTop();
    }
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
      <div className="flex flex-col gap-0">
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
              onClick={() => void triggerPrint(fields, answers, visibleFields, templateName, submission, job, false)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-primary hover:text-primary text-slate-600 transition-colors"
            >
              <Printer size={12} /> Print / PDF
            </button>
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
        <div className="max-w-2xl w-full flex flex-col gap-5 pb-10">
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
        <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
          <button onClick={onBack} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Back to Forms
          </button>
          <button
            onClick={() => void triggerPrint(fields, answers, visibleFields, templateName, submission, job, false)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-600 transition-colors"
          >
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>
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
          className="mt-2 px-6 py-2.5 bg-primary hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors">
          Back to Forms
        </button>
      </div>
    );
  }

  // ── Editable form ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4" ref={formTopRef}>
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
          <button
            onClick={() => void triggerPrint(fields, answers, visibleFields, templateName, submission, job, true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-slate-500 transition-colors"
          >
            <Printer size={12} /> Print Draft
          </button>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-700">{answeredCount}/{visibleInputFields.length}</p>
            <p className="text-[10px] text-slate-400">answered</p>
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

      {/* Skip logic toast */}
      <AnimatePresence>
        {skipToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 text-xs font-semibold text-primary bg-orange-50 border border-primary/20 rounded-xl px-3 py-2"
          >
            <SkipForward size={13} className="text-primary shrink-0" />
            {skipToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fields — current page only */}
      <div className="max-w-2xl w-full flex flex-col gap-5">
        <AnimatePresence mode="popLayout">
          {currentPageFields.map((field) => {
            if (!visibleFields.has(field.id)) return null;
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
      <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 mb-6 sm:mb-6 sticky bottom-0 sm:static z-20">
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
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 transition-colors shadow-sm"
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
