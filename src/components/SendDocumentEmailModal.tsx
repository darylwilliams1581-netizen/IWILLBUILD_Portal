/**
 * Reusable document email compose dialog.
 *
 * Mobile  → bottom sheet, single column
 * Desktop → centred dialog, two-column (job panel left | compose right)
 *
 * After gateway acceptance:
 *  1. Creates a compact internal job note via POST /api/notes (if jobId provided)
 *  2. Calls onSuccess({ variant, title, subtitle }) so the parent can show a toast
 *  3. Closes itself
 *
 * On send failure: keeps the dialog open, shows inline error — no note, no toast.
 * On send success + note failure: calls onSuccess with variant="warning".
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  User,
  X,
} from 'lucide-react';
import { useImageSafeguardBatch } from '@/hooks/useImageSafeguardBatch';
import ImageSafeguardBatchModal from '@/components/ImageSafeguardBatchModal';
import {
  dedupeAddresses,
  firstInvalidAddress,
  MAX_MESSAGE_LEN,
  MAX_SUBJECT_LEN,
  parseAddresses,
} from '@/lib/email-compose-utils';
import type { ToastVariant } from '@/components/EmailSentToast';

export interface JobEmailContext {
  jobNumber: string;
  jobName: string;
  jobAddress: string;
  clientName: string;
  docLabel: string;
  docDetail: string;
}

export interface SendSuccessPayload {
  variant: ToastVariant;
  title: string;
  subtitle?: string;
}

export interface SendDocumentEmailProps {
  /** POST endpoint that accepts the email payload */
  endpoint: string;
  /** Human label for the document type, e.g. "Quote", "Invoice", "Form", "Job" */
  documentLabel: string;
  /** Controls PDF preview link and "Attach PDF" checkbox visibility */
  documentType: 'quote' | 'invoice' | 'form' | 'job';
  documentName: string;
  documentId: number;
  defaultTo?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  job?: JobEmailContext;
  /**
   * If provided, a compact audit note is created in entity_notes after
   * gateway acceptance. The note is scoped to this job.
   */
  jobId?: number;
  /**
   * CP12A7: For documentType='form', the submission ID is required to
   * resolve the exact photo refs embedded in the PDF for the safeguard gate.
   * The gate runs at Send time (after recipients are finalised).
   */
  submissionId?: number;
  /** Called after the modal closes — parent shows the toast */
  onSuccess?: (payload: SendSuccessPayload) => void;
  onClose: () => void;
}

const INPUT_CLS =
  'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 bg-white placeholder:text-gray-400 transition-shadow';

const LABEL_CLS = 'text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

/** Build the compact audit note body */
function buildNoteBody(opts: {
  docLabel: string;
  toList: string[];
  ccList: string[];
  ownerBcced: boolean;
  senderName: string;
  subject: string;
  message: string;
  attachedPdf: boolean;
  messageId: string;
}): string {
  const now = new Date().toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane',
  });
  const toStr = opts.toList.join(', ');
  const ccStr = opts.ccList.length ? opts.ccList.join(', ') : 'None';
  const bccStr = opts.ownerBcced ? 'Owner' : 'None';
  const bodyPreview = opts.message.length > 120 ? `${opts.message.slice(0, 117)}…` : opts.message;
  const attachment = opts.attachedPdf ? `${opts.docLabel} PDF` : 'None';

  return [
    `Email sent – ${opts.docLabel}`,
    `To: ${toStr}`,
    `Cc: ${ccStr}`,
    `BCC: ${bccStr}`,
    `Sent by: ${opts.senderName}`,
    `${now}`,
    `Subject: ${opts.subject}`,
    `Body: ${bodyPreview}`,
    `Attachment: ${attachment}`,
    `Status: Accepted`,
    `Ref: ${opts.messageId}`,
  ].join(' | ');
}

export default function SendDocumentEmailModal({
  endpoint,
  documentLabel,
  documentType,
  documentName,
  documentId,
  defaultTo = '',
  defaultSubject = '',
  defaultMessage = '',
  job,
  jobId,
  submissionId,
  onSuccess,
  onClose,
}: SendDocumentEmailProps) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [attachPdf, setAttachPdf] = useState(documentType !== 'job');
  const [bccOwner, setBccOwner] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // CP12A7: Safeguard gate — runs at Send time for form emails (after recipients finalised)
  const { checkBatch, modalProps: safeguardModalProps } = useImageSafeguardBatch();

  const pdfPreviewHref =
    documentType === 'quote'
      ? `/api/estimates/${documentId}/export-pdf`
      : documentType === 'invoice'
      ? `/api/invoices/${documentId}/export-pdf`
      : null;

  function validate(): string | null {
    const toList = parseAddresses(to);
    if (toList.length === 0) return 'Enter at least one recipient email address.';
    const badTo = firstInvalidAddress(toList);
    if (badTo) return `"${badTo}" is not a valid email address.`;
    if (showAdvanced) {
      const badCc = firstInvalidAddress(parseAddresses(cc));
      if (badCc) return `CC: "${badCc}" is not a valid email address.`;
      const badBcc = firstInvalidAddress(parseAddresses(bcc));
      if (badBcc) return `BCC: "${badBcc}" is not a valid email address.`;
    }
    if (!subject.trim()) return 'Subject is required.';
    if (subject.length > MAX_SUBJECT_LEN) return `Subject must be ${MAX_SUBJECT_LEN} characters or fewer.`;
    if (!message.trim()) return 'Message body is required.';
    if (message.length > MAX_MESSAGE_LEN) return `Message must be ${MAX_MESSAGE_LEN} characters or fewer.`;
    return null;
  }

  async function handleSend() {
    const err = validate();
    if (err) { setError(err); return; }

    const toList  = dedupeAddresses(parseAddresses(to));
    const ccList  = showAdvanced ? dedupeAddresses(parseAddresses(cc)) : [];
    const bccList = showAdvanced ? dedupeAddresses(parseAddresses(bcc)) : [];

    // ── CP12A7: Safeguard gate for form emails ────────────────────────────────
    // Gate runs here — after recipients are finalised — so the token is bound
    // to the exact recipients and photo refs that will be sent.
    let safeguardToken: string | undefined;
    if (documentType === 'form' && submissionId) {
      const allRecipients = [...toList, ...ccList, ...bccList];
      const outcome = await checkBatch({
        action: 'form_email',
        submissionId,
        recipients: allRecipients,
        jobId: jobId ?? null,
      });
      if (!outcome.allowed) {
        // User cancelled or images are blocked — do not send
        return;
      }
      safeguardToken = outcome.confirmationToken;
    }

    setSending(true);
    setError('');

    let sendData: { ok: boolean; messageId: string; attachedPdf: boolean; ownerBcced: boolean; senderName?: string };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList, cc: ccList, bcc: bccList,
          subject: subject.trim(), message: message.trim(),
          attachPdf, bccOwner,
          ...(safeguardToken ? { safeguardToken } : {}),
        }),
      });
      const data = await res.json() as { ok?: boolean; messageId?: string; attachedPdf?: boolean; ownerBcced?: boolean; senderName?: string; error?: string };
      if (!res.ok || !data.ok || !data.messageId) {
        throw new Error(data.error ?? `Send failed (HTTP ${res.status}).`);
      }
      sendData = {
        ok: true,
        messageId: data.messageId,
        attachedPdf: data.attachedPdf ?? false,
        ownerBcced: data.ownerBcced ?? false,
        senderName: data.senderName ?? 'Unknown',
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error — please try again.');
      setSending(false);
      return;
    }

    // ── Gateway accepted — now create the audit note ──────────────────────────
    let noteOk = true;
    if (jobId) {
      const noteBody = buildNoteBody({
        docLabel: documentLabel,
        toList,
        ccList,
        ownerBcced: sendData.ownerBcced,
        senderName: sendData.senderName ?? 'Unknown',
        subject: subject.trim(),
        message: message.trim(),
        attachedPdf: sendData.attachedPdf,
        messageId: sendData.messageId,
      });
      try {
        const noteRes = await fetch('/api/notes', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'job',
            entityId: jobId,
            entityLabel: job ? [job.jobNumber, job.jobName].filter(Boolean).join(' — ') : documentName,
            noteType: 'note',
            body: noteBody,
          }),
        });
        if (!noteRes.ok) noteOk = false;
      } catch {
        noteOk = false;
      }
    }

    // ── Close modal and fire toast ────────────────────────────────────────────
    setSending(false);
    onClose();

    if (onSuccess) {
      if (noteOk) {
        onSuccess({
          variant: 'success',
          title: 'Email sent successfully',
          subtitle: toList[0] ? `Sent to ${toList[0]}${toList.length > 1 ? ` +${toList.length - 1} more` : ''}` : undefined,
        });
      } else {
        onSuccess({
          variant: 'warning',
          title: 'Email sent, but the activity note could not be saved',
        });
      }
    }
  }

  const canSend = !sending && parseAddresses(to).length > 0 && subject.trim().length > 0 && message.trim().length > 0;
  const jobHeading = job ? [job.jobNumber, job.jobName].filter(Boolean).join(' \u2014 ') : documentName;

  /* ─────────────────────────────────────────────────────────────────────────
     Job context panel
  ───────────────────────────────────────────────────────────────────────── */
  const JobPanel = () => (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden h-full flex flex-col">
      <div className="bg-violet-600 px-4 py-3.5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Briefcase size={15} className="text-violet-200 shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-white leading-snug break-words">{jobHeading || 'Job'}</p>
        </div>
        {pdfPreviewHref && (
          <a
            href={pdfPreviewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-violet-200 hover:text-white whitespace-nowrap transition-colors mt-0.5"
          >
            <ExternalLink size={11} />
            Preview PDF
          </a>
        )}
      </div>

      <div className="px-4 py-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-2.5">
          <Paperclip size={13} className="text-violet-500 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-800 leading-tight">{job?.docLabel ?? documentLabel}</p>
            {job?.docDetail && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{job.docDetail}</p>}
          </div>
          {attachPdf && documentType !== 'job' && (
            <span className="shrink-0 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5 leading-none whitespace-nowrap">
              PDF attached
            </span>
          )}
        </div>

        {job?.clientName && (
          <div className="flex items-center gap-2.5">
            <User size={12} className="text-gray-400 shrink-0" />
            <p className="text-xs text-gray-700 font-medium">{job.clientName}</p>
          </div>
        )}

        {job?.jobAddress && (
          <div className="flex items-start gap-2.5">
            <MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-600 leading-snug">{job.jobAddress}</p>
          </div>
        )}

        {/* Desktop-only options */}
        <div className="hidden md:flex flex-col gap-2.5 mt-auto pt-4 border-t border-gray-200">
          {documentType !== 'job' && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} disabled={sending} className="w-4 h-4 accent-violet-600 rounded" />
              <span className="text-xs text-gray-700">Attach {documentLabel} as PDF</span>
            </label>
          )}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={bccOwner} onChange={(e) => setBccOwner(e.target.checked)} disabled={sending} className="w-4 h-4 accent-violet-600 rounded" />
            <span className="text-xs text-gray-700">Copy company owner</span>
          </label>
        </div>
      </div>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────────────────
     Compose form
  ───────────────────────────────────────────────────────────────────────── */
  const ComposeForm = () => (
    <div className="flex flex-col gap-4">
      <div>
        <p className={LABEL_CLS}>To</p>
        <input
          type="text"
          value={to}
          onChange={(e) => { setTo(e.target.value); setError(''); }}
          placeholder={defaultTo || 'Enter recipient email address'}
          className={INPUT_CLS}
          disabled={sending}
          autoFocus
        />
        {!defaultTo && (
          <p className="text-[11px] text-amber-600 mt-1">No customer email on file — enter manually.</p>
        )}
        <p className="text-[11px] text-gray-400 mt-1">Separate multiple addresses with commas.</p>
      </div>

      <div>
        <p className={LABEL_CLS}>Subject</p>
        <input
          type="text"
          value={subject}
          onChange={(e) => { setSubject(e.target.value.slice(0, MAX_SUBJECT_LEN)); setError(''); }}
          placeholder="Email subject"
          className={INPUT_CLS}
          disabled={sending}
        />
      </div>

      <div>
        <p className={LABEL_CLS}>Message</p>
        <textarea
          value={message}
          onChange={(e) => { setMessage(e.target.value.slice(0, MAX_MESSAGE_LEN)); setError(''); }}
          rows={6}
          placeholder="Email message body"
          className={`${INPUT_CLS} resize-none`}
          disabled={sending}
        />
        <p className="text-[11px] text-gray-400 mt-1 text-right">{message.length}/{MAX_MESSAGE_LEN}</p>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors self-start"
      >
        {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showAdvanced ? 'Hide Cc / Bcc' : 'Add Cc / Bcc'}
      </button>

      {showAdvanced && (
        <div className="flex flex-col gap-3">
          <div>
            <p className={LABEL_CLS}>Cc</p>
            <input type="text" value={cc} onChange={(e) => { setCc(e.target.value); setError(''); }} placeholder="Optional — separate with commas" className={INPUT_CLS} disabled={sending} />
          </div>
          <div>
            <p className={LABEL_CLS}>Bcc</p>
            <input type="text" value={bcc} onChange={(e) => { setBcc(e.target.value); setError(''); }} placeholder="Optional — separate with commas" className={INPUT_CLS} disabled={sending} />
          </div>
        </div>
      )}

      {/* Mobile-only options */}
      <div className="flex flex-col gap-2.5 pt-1 border-t border-gray-100 md:hidden">
        {documentType !== 'job' && (
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} disabled={sending} className="w-4 h-4 accent-violet-600 rounded" />
            <span className="text-sm text-gray-700">Attach {documentLabel} as PDF</span>
          </label>
        )}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={bccOwner} onChange={(e) => setBccOwner(e.target.checked)} disabled={sending} className="w-4 h-4 accent-violet-600 rounded" />
          <span className="text-sm text-gray-700">Send a copy to the company owner</span>
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3">
          <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );

  return (
    <>
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-end md:items-start md:pt-[124px] justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={sending ? undefined : onClose} />

        <motion.div
          className="relative bg-white w-full md:max-w-3xl md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col md:flex-row max-h-[94dvh] md:max-h-[calc(100dvh-140px)] overflow-hidden"
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                <Mail size={15} className="text-white" />
              </div>
              <p className="text-sm font-bold text-gray-900">Send {documentLabel}</p>
            </div>
            <button onClick={sending ? undefined : onClose} disabled={sending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40" aria-label="Close">
              <X size={17} />
            </button>
          </div>

          {/* Left column — job context */}
          {job && (
            <div className="md:w-64 md:shrink-0 md:border-r md:border-gray-100 p-4 md:p-5 md:flex md:flex-col md:overflow-y-auto">
              <div className="hidden md:flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                  <Mail size={15} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 leading-tight">Send {documentLabel}</p>
                  <p className="text-[11px] text-gray-400">via email</p>
                </div>
              </div>
              <div className="flex-1">
                <JobPanel />
              </div>
            </div>
          )}

          {/* Right column — compose */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="hidden md:flex items-center justify-between px-6 pt-5 pb-1 shrink-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Compose</p>
              <button onClick={sending ? undefined : onClose} disabled={sending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40" aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 md:px-6 py-4">
              {/* Sending overlay */}
              {sending ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Loader2 size={32} className="text-violet-500 animate-spin" />
                  <p className="text-sm font-semibold text-gray-700">Sending email…</p>
                  <p className="text-xs text-gray-400">Please wait</p>
                </div>
              ) : (
                <ComposeForm />
              )}
            </div>

            {!sending && (
              <div className="flex gap-2.5 px-5 md:px-6 py-4 border-t border-gray-100 shrink-0">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
                >
                  <Mail size={15} />
                  Send Email
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    {/* CP12A7: Safeguard batch confirmation modal — rendered outside AnimatePresence
        so it can appear over the email compose modal */}
    <ImageSafeguardBatchModal {...safeguardModalProps} />
    </>
  );
}
