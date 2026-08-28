/**
 * SourceDocumentPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the Word/PDF source document details for a template.
 * Rendered as a slide-in sheet from the right side of the screen.
 *
 * Actions:
 *   - Download original source file
 *   - Replace with a new revision (upload new file)
 *   - View revision history
 *   - Attach to a job (opens AttachToJobSheet)
 *   - Publish to Shared Library (platform owner only)
 *   - Archive document
 *
 * The panel fetches its own data so it can be mounted independently.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, RefreshCw, History, Library, Archive,
  FileText, File, Loader2, AlertCircle, CheckCircle,
  ChevronDown, ChevronUp, Clock, Briefcase, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import AttachToJobSheet from '@/components/studio/AttachToJobSheet';

interface SourceMeta {
  hasSourceDocument: boolean;
  sourceType: 'blocks' | 'docx' | 'pdf';
  sourceFileName: string | null;
  sourceMimeType: string | null;
  sourceSha256: string | null;
  sourceRevision: number;
  sourceUpdatedAt: string | null;
  revisions: Array<{
    id: number;
    revision: number;
    source_file_name: string;
    source_sha256: string;
    file_size_bytes: number;
    uploaded_by: string | null;
    uploaded_at: string;
    notes: string | null;
  }>;
}

interface Props {
  templateId: number;
  templateName: string;
  templateType?: string;
  isPlatformOwner?: boolean;
  onClose: () => void;
  onArchive?: () => void;
}

export default function SourceDocumentPanel({
  templateId,
  templateName,
  templateType = 'custom',
  isPlatformOwner = false,
  onClose,
  onArchive,
}: Props) {
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [publishTitle, setPublishTitle] = useState(templateName);
  const [publishType, setPublishType] = useState('procedure');
  const [publishSummary, setPublishSummary] = useState('');
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // ── Preview state ─────────────────────────────────────────────────────────
  /** null = not yet checked; 'loading' = checking; 'available' = iframe ready;
   *  'unavailable' = 503 from pdf-preview (DOCX, no Gotenberg); 'error' = other failure */
  type PreviewStatus = null | 'loading' | 'available' | 'unavailable' | 'error';
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>(null);
  const [previewUnavailableMsg, setPreviewUnavailableMsg] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    void loadMeta();
  }, [templateId]);

  async function loadMeta() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/document-templates/${templateId}/source-document`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load source document info');
      const data = await res.json() as SourceMeta;
      setMeta(data);
      // Reset preview state when meta reloads (e.g. after replace)
      setPreviewStatus(null);
      setShowPreview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  /**
   * For PDF source: the download endpoint streams the file directly — the
   * browser PDF viewer handles it natively inside an <iframe>.
   *
   * For DOCX source: call pdf-preview. If 200 → iframe. If 503 → show the
   * deliberate fallback panel. Any other error → show error state.
   */
  async function checkPreview(sourceType: 'docx' | 'pdf') {
    setPreviewStatus('loading');
    if (sourceType === 'pdf') {
      // PDF is always viewable directly — no server check needed
      setPreviewStatus('available');
      return;
    }
    // DOCX — probe pdf-preview endpoint
    try {
      const res = await fetch(`/api/document-templates/${templateId}/source-document/pdf-preview`, {
        credentials: 'include',
      });
      if (res.ok) {
        setPreviewStatus('available');
      } else if (res.status === 503) {
        const data = await res.json() as { message?: string };
        setPreviewUnavailableMsg(
          data.message ?? 'PDF preview requires a Gotenberg service. The original DOCX is available for download.'
        );
        setPreviewStatus('unavailable');
      } else {
        setPreviewStatus('error');
      }
    } catch {
      setPreviewStatus('error');
    }
  }

  async function handleDownload() {
    const a = document.createElement('a');
    a.href = `/api/document-templates/${templateId}/source-document/download`;
    a.download = meta?.sourceFileName ?? `${templateName}.${meta?.sourceType ?? 'docx'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleReplaceFile(file: File) {
    setReplacing(true);
    setReplaceError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/document-templates/${templateId}/source-document/replace`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Replace failed');
      }
      toast.success('Source document updated to new revision');
      await loadMeta();
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setReplacing(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await fetch(`/api/document-templates/${templateId}/publish-to-library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: publishTitle,
          type: publishType,
          summary: publishSummary,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Publish failed');
      }
      toast.success('Published to Shared Library');
      setShowPublishForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  const srcIcon = meta?.sourceType === 'pdf' ? File : FileText;
  const SrcIcon = srcIcon;
  const srcColor = meta?.sourceType === 'pdf' ? 'text-red-500' : 'text-blue-600';
  const srcBg = meta?.sourceType === 'pdf' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200';
  const srcLabel = meta?.sourceType === 'pdf' ? 'PDF Source' : 'Word Source';

  const panel = createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${srcBg}`}>
              <SrcIcon size={15} className={srcColor} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Source Document</p>
              <p className="text-xs text-slate-400 truncate max-w-[180px]">{templateName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && meta && (
            <>
              {/* Source badge + file info */}
              {meta.hasSourceDocument ? (
                <div className={`rounded-xl border p-4 ${srcBg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${srcBg} ${srcColor}`}>
                      {srcLabel}
                    </span>
                    <span className="text-xs text-slate-500">Rev {meta.sourceRevision}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {meta.sourceFileName ?? 'Unknown file'}
                  </p>
                  {meta.sourceUpdatedAt && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock size={11} />
                      Updated {new Date(meta.sourceUpdatedAt).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  )}
                  {meta.sourceSha256 && (
                    <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      SHA-256: {meta.sourceSha256.slice(0, 16)}…
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 text-center">
                  <p className="text-sm text-slate-500">No source document attached</p>
                  <p className="text-xs text-slate-400 mt-1">
                    This document was created as Studio blocks, not from a Word or PDF source.
                  </p>
                </div>
              )}

              {/* Actions */}
              {meta.hasSourceDocument && (
                <div className="flex flex-col gap-2">
                  {/* Preview toggle */}
                  <button
                    onClick={() => {
                      if (!showPreview) {
                        setShowPreview(true);
                        if (previewStatus === null) {
                          void checkPreview(meta.sourceType as 'docx' | 'pdf');
                        }
                      } else {
                        setShowPreview(false);
                      }
                    }}
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors"
                  >
                    {showPreview ? <EyeOff size={14} className="text-slate-500" /> : <Eye size={14} className="text-slate-500" />}
                    {showPreview ? 'Hide preview' : 'Preview document'}
                  </button>

                  {/* Preview area */}
                  {showPreview && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      {previewStatus === 'loading' && (
                        <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-xs">
                          <Loader2 size={16} className="animate-spin" />
                          {meta.sourceType === 'docx' ? 'Converting to PDF…' : 'Loading preview…'}
                        </div>
                      )}

                      {previewStatus === 'available' && (
                        <iframe
                          src={
                            meta.sourceType === 'pdf'
                              ? `/api/document-templates/${templateId}/source-document/download`
                              : `/api/document-templates/${templateId}/source-document/pdf-preview`
                          }
                          title={`Preview: ${meta.sourceFileName ?? templateName}`}
                          className="w-full"
                          style={{ height: '480px', border: 'none' }}
                        />
                      )}

                      {previewStatus === 'unavailable' && (
                        /* Deliberate fallback panel — no Gotenberg configured for DOCX */
                        <div className="p-4 flex flex-col gap-3">
                          <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs">
                            <AlertCircle size={13} className="shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">Preview unavailable</p>
                              <p className="mt-0.5 text-amber-600">{previewUnavailableMsg}</p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500">
                            You can still download the original file, replace it with a new revision,
                            attach it to a job, or publish it to the shared library.
                          </p>
                          <button
                            onClick={() => void handleDownload()}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                          >
                            <Download size={12} />
                            Download original {meta.sourceType === 'pdf' ? 'PDF' : 'DOCX'}
                          </button>
                        </div>
                      )}

                      {previewStatus === 'error' && (
                        <div className="flex items-center gap-2 px-3 py-3 text-xs text-red-600">
                          <AlertCircle size={13} />
                          Preview failed — download the original file instead.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Download */}
                  <button
                    onClick={() => void handleDownload()}
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors"
                  >
                    <Download size={14} className="text-slate-500" />
                    Download original {meta.sourceType === 'pdf' ? 'PDF' : 'DOCX'}
                  </button>

                  {/* Replace */}
                  <button
                    onClick={() => replaceInputRef.current?.click()}
                    disabled={replacing}
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-sm font-semibold text-blue-700 transition-colors disabled:opacity-50"
                  >
                    {replacing
                      ? <Loader2 size={14} className="animate-spin" />
                      : <RefreshCw size={14} />
                    }
                    Replace with new revision
                  </button>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".docx,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleReplaceFile(file);
                      e.target.value = '';
                    }}
                  />
                  {replaceError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={11} /> {replaceError}
                    </p>
                  )}

                  {/* Revision history */}
                  {meta.revisions.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <History size={12} />
                          Revision history ({meta.revisions.length})
                        </span>
                        {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {showHistory && (
                        <div className="divide-y divide-slate-100">
                          {meta.revisions.map((rev) => (
                            <div key={rev.id} className="px-4 py-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-700">Rev {rev.revision}</span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(rev.uploaded_at).toLocaleDateString('en-AU', {
                                    day: 'numeric', month: 'short',
                                  })}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate">{rev.source_file_name}</p>
                              {rev.notes && (
                                <p className="text-xs text-slate-400 italic mt-0.5">{rev.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-slate-100" />

              {/* Platform owner: Publish to Library */}
              {isPlatformOwner && (
                <div>
                  {!showPublishForm ? (
                    <button
                      onClick={() => setShowPublishForm(true)}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-sm font-semibold text-violet-700 transition-colors w-full"
                    >
                      <Library size={14} />
                      Publish to Shared Library
                    </button>
                  ) : (
                    <div className="border border-violet-200 rounded-xl p-4 flex flex-col gap-3 bg-violet-50/40">
                      <p className="text-xs font-bold text-violet-700">Publish to Library</p>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-600 font-medium">Title</label>
                        <input
                          value={publishTitle}
                          onChange={(e) => setPublishTitle(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-600 font-medium">Type</label>
                        <select
                          value={publishType}
                          onChange={(e) => setPublishType(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                        >
                          {['policy', 'procedure', 'swms', 'form', 'checklist', 'induction', 'report', 'toolbox_talk', 'prestart'].map((t) => (
                            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-600 font-medium">Summary (optional)</label>
                        <textarea
                          value={publishSummary}
                          onChange={(e) => setPublishSummary(e.target.value)}
                          rows={2}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handlePublish()}
                          disabled={publishing || !publishTitle.trim()}
                          className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {publishing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          Publish
                        </button>
                        <button
                          onClick={() => setShowPublishForm(false)}
                          className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Archive */}
              {onArchive && (
                <button
                  onClick={onArchive}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-sm font-semibold text-slate-500 hover:text-red-600 transition-colors"
                >
                  <Archive size={14} />
                  Archive document
                </button>
              )}

              {/* Attach to Job */}
              <button
                onClick={() => setShowAttachSheet(true)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-sm font-semibold text-emerald-700 transition-colors"
              >
                <Briefcase size={14} />
                Attach to job
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  // Render AttachToJobSheet outside the panel portal so it stacks above
  const attachSheet = showAttachSheet ? (
    <AttachToJobSheet
      open={showAttachSheet}
      studioDocId={templateId}
      docTitle={templateName}
      templateType={templateType}
      onClose={() => setShowAttachSheet(false)}
      onAttached={() => {
        setShowAttachSheet(false);
        toast.success(`"${templateName}" attached to job`);
      }}
    />
  ) : null;

  return (
    <>
      {panel}
      {attachSheet}
    </>
  );
}
