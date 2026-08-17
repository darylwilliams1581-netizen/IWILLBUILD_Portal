/**
 * FormDocumentActionsModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Document Actions entry point for a completed Form submission.
 *
 * Desktop: renders as a centred modal dialog.
 * iOS/Capacitor: renders as a bottom sheet (slides up from the bottom edge).
 *
 * Three actions:
 *   1. PDF     — Desktop: opens inline in the browser PDF viewer (Print + Save
 *                are provided by the browser chrome).
 *                iOS:     fetches the authenticated PDF bytes, writes them to
 *                         the Capacitor Filesystem cache, then opens the native
 *                         iOS share sheet so the user can Print, Save to Files,
 *                         Mail, or Message the PDF.
 *   2. Email   — Opens the existing SendDocumentEmailModal.
 *   3. Share   — Opens the existing ShareLinkModal.
 *
 * Props:
 *   submissionId   — job_form_submissions.id
 *   templateName   — display name for the form template
 *   jobId          — optional, passed through to email modal
 *   job            — optional Job object, passed through to email modal
 *   onClose        — called when the modal/sheet should be dismissed
 */
import { useState } from 'react';
import { X, FileDown, Mail, Link2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isNative, getFilesystemPlugin, getSharePlugin, FilesystemDirectory } from '@/lib/capacitor-plugins';
import SendDocumentEmailModal from '@/components/SendDocumentEmailModal';
import type { JobEmailContext } from '@/components/SendDocumentEmailModal';
import ShareLinkModal from '@/components/ShareLinkModal';
import type { Job } from '@/lib/jobs-api';
import type { DocumentOutputVariant } from '@/lib/document-actions-context';

interface Props {
  submissionId: number;
  templateName: string;
  jobId?: number;
  job?: Job | null;
  /**
   * Which output variant to generate.  Completed forms have only one PDF
   * shape so this is always 'default' in practice.  The prop is accepted
   * here so the interface is consistent with future multi-variant adapters
   * (e.g. Estimate: with_costs / without_costs / full_breakdown).
   */
  outputVariant?: DocumentOutputVariant;
  onClose: () => void;
}

type ActivePanel = 'menu' | 'email' | 'share';

export default function FormDocumentActionsModal({
  submissionId,
  templateName,
  jobId,
  job,
  // outputVariant is accepted for interface consistency with future multi-variant
  // adapters (e.g. Estimate).  Completed forms have a single PDF shape so the
  // value is not used here — it will be forwarded to the PDF endpoint when
  // multi-variant support is wired in Stage 3+.
  outputVariant: _outputVariant = 'default',
  onClose,
}: Props) {
  const [activePanel, setActivePanel] = useState<ActivePanel>('menu');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const native = isNative();

  // ── PDF action ──────────────────────────────────────────────────────────────

  async function handlePdf() {
    setPdfError('');
    setPdfLoading(true);
    try {
      if (native) {
        await handlePdfNative();
      } else {
        handlePdfDesktop();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open PDF';
      setPdfError(msg);
    } finally {
      setPdfLoading(false);
    }
  }

  /** Desktop: open the PDF inline in a new tab — browser provides Print + Save. */
  function handlePdfDesktop() {
    // Open inline so the browser PDF viewer is shown with its native Print/Save toolbar.
    const url = `/api/job-forms/${submissionId}/export-pdf?action=view`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  }

  /**
   * iOS/Capacitor: fetch authenticated PDF bytes → write to Filesystem cache →
   * open native share sheet → clean up temp file.
   *
   * Cancellation (user dismisses share sheet) is treated as success — no error shown.
   */
  async function handlePdfNative() {
    const Filesystem = getFilesystemPlugin();
    const Share = getSharePlugin();

    if (!Filesystem || !Share) {
      // Plugins not available — fall back to opening in the in-app browser
      handlePdfDesktop();
      return;
    }

    // Fetch PDF bytes with session credentials
    const res = await fetch(`/api/job-forms/${submissionId}/export-pdf?action=download`, {
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Server returned ${res.status}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/pdf')) {
      throw new Error('Server returned unexpected content type');
    }

    // Convert response to base64 for Filesystem.writeFile
    const arrayBuffer = await res.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    // Safe filename — strip special chars
    const safeTitle = templateName
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'form';
    const filename = `${safeTitle}-${submissionId}.pdf`;
    const tempPath = `iwb-share/${filename}`;

    // Ensure the temp directory exists
    try {
      await Filesystem.mkdir({ path: 'iwb-share', directory: FilesystemDirectory.Cache, recursive: true });
    } catch {
      // Directory may already exist — ignore
    }

    // Write to cache
    const writeResult = await Filesystem.writeFile({
      path: tempPath,
      data: base64,
      directory: FilesystemDirectory.Cache,
    });

    // Open native share sheet
    try {
      await Share.share({
        title: templateName,
        files: [writeResult.uri],
        dialogTitle: `Share ${templateName}`,
      });
    } catch (shareErr) {
      // User cancelled the share sheet — not an error
      const msg = shareErr instanceof Error ? shareErr.message : '';
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('dismiss')) {
        throw shareErr;
      }
    } finally {
      // Clean up temp file — best-effort
      try {
        await Filesystem.deleteFile({ path: tempPath, directory: FilesystemDirectory.Cache });
      } catch {
        // Non-fatal
      }
    }

    onClose();
  }

  // ── Email defaults ──────────────────────────────────────────────────────────

  const emailJobContext: JobEmailContext | undefined = job
    ? {
        jobNumber: job.jobNumber ?? '',
        jobName: job.name ?? '',
        jobAddress: job.address ?? '',
        clientName: job.client ?? '',
        docLabel: templateName,
        docDetail: job.jobNumber ? `Job ${job.jobNumber}` : '',
      }
    : undefined;

  // ── Render ──────────────────────────────────────────────────────────────────

  // When a sub-panel is active, render it directly (it manages its own overlay)
  if (activePanel === 'email') {
    return (
      <SendDocumentEmailModal
        endpoint={`/api/job-forms/${submissionId}/send-email`}
        documentLabel="Form"
        documentType="form"
        documentId={submissionId}
        documentName={templateName}
        defaultSubject={`${templateName}${job?.jobNumber ? ` — Job ${job.jobNumber}` : ''}`}
        defaultMessage={`Please find the completed ${templateName} attached.`}
        job={emailJobContext}
        jobId={jobId}
        onClose={onClose}
      />
    );
  }

  if (activePanel === 'share') {
    return (
      <ShareLinkModal
        open
        onClose={onClose}
        target={{
          type: 'completed_form',
          id: String(submissionId),
          title: templateName,
          linkType: 'document_view',
          defaultPermissions: ['view', 'download'],
        }}
      />
    );
  }

  // ── Main menu ───────────────────────────────────────────────────────────────

  const actions = [
    {
      id: 'pdf',
      icon: <FileDown size={20} className="text-violet-600" />,
      label: 'PDF',
      description: native
        ? 'Open the iOS share sheet — Print, Save to Files, Mail or Message'
        : 'Open in browser PDF viewer — Print or Save from there',
      onClick: () => void handlePdf(),
      loading: pdfLoading,
    },
    {
      id: 'email',
      icon: <Mail size={20} className="text-blue-600" />,
      label: 'Email',
      description: 'Send the PDF as an email attachment',
      onClick: () => setActivePanel('email'),
      loading: false,
    },
    {
      id: 'share',
      icon: <Link2 size={20} className="text-emerald-600" />,
      label: 'Secure Share',
      description: 'Create a secure link with QR code',
      onClick: () => setActivePanel('share'),
      loading: false,
    },
  ];

  // Bottom sheet on native, centred modal on web
  if (native) {
    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            className="relative bg-white rounded-t-2xl shadow-2xl pb-safe"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-500 font-medium">Document Actions</p>
                <p className="text-sm font-bold text-slate-900 truncate max-w-[240px]">{templateName}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Error */}
            {pdfError && (
              <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <AlertCircle size={13} className="shrink-0" /> {pdfError}
              </div>
            )}

            {/* Actions */}
            <div className="px-4 py-3 flex flex-col gap-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.loading}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 transition-colors text-left disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    {action.loading ? <Loader2 size={18} className="animate-spin text-slate-400" /> : action.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{action.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{action.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Safe area spacer */}
            <div className="h-4" />
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  // Desktop modal
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        {/* Modal */}
        <motion.div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.15 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500 font-medium">Document Actions</p>
              <p className="text-sm font-bold text-slate-900 truncate max-w-[240px]">{templateName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Error */}
          {pdfError && (
            <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertCircle size={13} className="shrink-0" /> {pdfError}
            </div>
          )}

          {/* Actions */}
          <div className="px-4 py-4 flex flex-col gap-2">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={action.onClick}
                disabled={action.loading}
                className="flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left disabled:opacity-60 group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 group-hover:border-slate-300 transition-colors">
                  {action.loading ? <Loader2 size={18} className="animate-spin text-slate-400" /> : action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{action.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
