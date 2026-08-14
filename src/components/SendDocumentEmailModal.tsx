/**
 * Reusable document email compose dialog.
 * Covers Quotes, Invoices and completed Forms.
 *
 * Props
 * ─────
 * endpoint        POST endpoint that accepts the compose payload
 * documentLabel   Human label, e.g. "Quote", "Invoice", "Form"
 * documentType    Machine key: "quote" | "invoice" | "form"
 * documentName    Title / filename shown in the header
 * documentId      Numeric ID used for the PDF preview link
 * defaultTo       Pre-filled To address (customer email from server)
 * defaultSubject  Auto-generated subject
 * defaultMessage  Auto-generated message body
 * onClose         Called when the dialog should be dismissed
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  X,
} from 'lucide-react';
import {
  dedupeAddresses,
  firstInvalidAddress,
  MAX_MESSAGE_LEN,
  MAX_SUBJECT_LEN,
  parseAddresses,
  SYSTEM_FOOTER,
} from '@/lib/email-compose-utils';

export interface SendDocumentEmailProps {
  endpoint: string;
  documentLabel: string;
  documentType: 'quote' | 'invoice' | 'form';
  documentName: string;
  documentId: number;
  defaultTo?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  onClose: () => void;
}

interface SendResult {
  messageId: string;
  attachedPdf: boolean;
  ownerBcced: boolean;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLS =
  'w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 bg-white';

export default function SendDocumentEmailModal({
  endpoint,
  documentLabel,
  documentType,
  documentName,
  documentId,
  defaultTo = '',
  defaultSubject = '',
  defaultMessage = '',
  onClose,
}: SendDocumentEmailProps) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [attachPdf, setAttachPdf] = useState(true);
  const [bccOwner, setBccOwner] = useState(true);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState('');

  const pdfPreviewHref =
    documentType === 'quote'
      ? `/api/estimates/${documentId}/export-pdf`
      : documentType === 'invoice'
      ? `/api/invoices/${documentId}/export-pdf`
      : null; // forms: no standalone export-pdf endpoint

  function validate(): string | null {
    const toList = parseAddresses(to);
    if (toList.length === 0) return 'Enter at least one To recipient.';
    const badTo = firstInvalidAddress(toList);
    if (badTo) return `"${badTo}" is not a valid email address.`;

    const ccList = parseAddresses(cc);
    const badCc = firstInvalidAddress(ccList);
    if (badCc) return `CC: "${badCc}" is not a valid email address.`;

    const bccList = parseAddresses(bcc);
    const badBcc = firstInvalidAddress(bccList);
    if (badBcc) return `BCC: "${badBcc}" is not a valid email address.`;

    if (!subject.trim()) return 'Subject is required.';
    if (subject.length > MAX_SUBJECT_LEN)
      return `Subject must be ${MAX_SUBJECT_LEN} characters or fewer.`;
    if (!message.trim()) return 'Message body is required.';
    if (message.length > MAX_MESSAGE_LEN)
      return `Message must be ${MAX_MESSAGE_LEN} characters or fewer.`;

    return null;
  }

  async function handleSend() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Deduplicate across fields before sending
    const toList = dedupeAddresses(parseAddresses(to));
    const ccList = dedupeAddresses(parseAddresses(cc));
    const bccList = dedupeAddresses(parseAddresses(bcc));

    setSending(true);
    setError('');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: subject.trim(),
          message: message.trim(),
          attachPdf,
          bccOwner,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        messageId?: string;
        attachedPdf?: boolean;
        ownerBcced?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.messageId) {
        throw new Error(
          data.error ?? `Send failed (HTTP ${res.status}). No message ID returned.`
        );
      }
      setResult({
        messageId: data.messageId,
        attachedPdf: data.attachedPdf ?? false,
        ownerBcced: data.ownerBcced ?? false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error — please try again.');
    } finally {
      setSending(false);
    }
  }

  const toList = parseAddresses(to);
  const canSend =
    !sending &&
    toList.length > 0 &&
    subject.trim().length > 0 &&
    message.trim().length > 0;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92dvh]"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <Mail size={16} className="text-violet-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 leading-tight">
                  Email {documentLabel}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {documentName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {result ? (
              /* ── Success state ── */
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 size={40} className="text-emerald-500" />
                <p className="font-semibold text-gray-900">
                  {documentLabel} sent!
                </p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  The email was accepted by the gateway
                  {result.attachedPdf ? ' with the PDF attached' : ' without a PDF attachment'}
                  {result.ownerBcced ? ', and a private copy was sent to the company owner' : ''}.
                </p>
                <p className="text-[11px] text-slate-400">
                  Gateway accepted — delivery is not guaranteed (bounces and spam
                  filtering may still occur).
                </p>
                <button
                  onClick={onClose}
                  className="mt-2 px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              /* ── Compose state ── */
              <div className="flex flex-col gap-3.5">
                {/* PDF info banner */}
                <div className="flex items-start gap-2.5 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
                  <FileText
                    size={14}
                    className="text-violet-600 mt-0.5 shrink-0"
                  />
                  <p className="text-xs text-violet-900 leading-relaxed">
                    The server-generated PDF will be attached automatically. The
                    recipient does not need an IWILLBUILD login.
                  </p>
                  {pdfPreviewHref && (
                    <a
                      href={pdfPreviewHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto shrink-0 flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900 whitespace-nowrap"
                      title="Preview PDF"
                    >
                      <ExternalLink size={12} />
                      Preview PDF
                    </a>
                  )}
                </div>

                {/* To */}
                <FieldRow label="To">
                  <input
                    type="text"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setError('');
                    }}
                    placeholder={
                      defaultTo
                        ? defaultTo
                        : 'No customer email recorded — enter address'
                    }
                    className={INPUT_CLS}
                    disabled={sending}
                    autoFocus
                  />
                  {!defaultTo && (
                    <p className="text-[11px] text-amber-600">
                      No customer email recorded for this job.
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    Separate multiple addresses with commas or semicolons.
                  </p>
                </FieldRow>

                {/* Cc */}
                <FieldRow label="Cc">
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => {
                      setCc(e.target.value);
                      setError('');
                    }}
                    placeholder="Optional — separate with commas"
                    className={INPUT_CLS}
                    disabled={sending}
                  />
                </FieldRow>

                {/* Bcc */}
                <FieldRow label="Bcc">
                  <input
                    type="text"
                    value={bcc}
                    onChange={(e) => {
                      setBcc(e.target.value);
                      setError('');
                    }}
                    placeholder="Optional — separate with commas"
                    className={INPUT_CLS}
                    disabled={sending}
                  />
                </FieldRow>

                {/* Subject */}
                <FieldRow label="Subject">
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value.slice(0, MAX_SUBJECT_LEN));
                      setError('');
                    }}
                    placeholder="Email subject"
                    className={INPUT_CLS}
                    disabled={sending}
                  />
                </FieldRow>

                {/* Message */}
                <FieldRow label="Message">
                  <textarea
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value.slice(0, MAX_MESSAGE_LEN));
                      setError('');
                    }}
                    rows={5}
                    placeholder="Email message body"
                    className={`${INPUT_CLS} resize-y min-h-[100px]`}
                    disabled={sending}
                  />
                  <p className="text-[11px] text-slate-400">
                    {message.length}/{MAX_MESSAGE_LEN} chars
                  </p>
                </FieldRow>

                {/* System footer notice */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-slate-500 italic">
                    System footer appended automatically: &ldquo;{SYSTEM_FOOTER}&rdquo;
                  </p>
                </div>

                {/* Checkboxes */}
                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={attachPdf}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                      disabled={sending}
                      className="w-4 h-4 accent-violet-600"
                    />
                    <span className="text-sm text-gray-800">
                      Attach {documentLabel} PDF
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={bccOwner}
                      onChange={(e) => setBccOwner(e.target.checked)}
                      disabled={sending}
                      className="w-4 h-4 accent-violet-600"
                    />
                    <span className="text-sm text-gray-800">
                      BCC a copy to the company owner
                    </span>
                  </label>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <AlertCircle
                      size={14}
                      className="text-red-500 mt-0.5 shrink-0"
                    />
                    <p className="text-xs text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {!result && (
            <div className="flex gap-2 justify-end px-5 py-4 border-t border-border shrink-0">
              <button
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSend()}
                disabled={!canSend}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Mail size={14} />
                )}
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
