/**
 * /documents/:id — Internal document viewer
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticated portal page. Shows a document with its full metadata,
 * share link management, version history, and audit event log.
 * Renders the document content inline (form answers, PO lines, etc.).
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, Share2, Clock, CheckCircle2, Lock, Unlock, Copy, XCircle,
  Loader2, AlertTriangle, ChevronLeft, Eye, Download, ClipboardList,
  History, Activity, ExternalLink, RotateCcw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRecord {
  id: number;
  documentType: string;
  sourceModule: string;
  sourceId: string;
  title: string;
  status: string;
  version: number;
  isLocked: boolean;
  lockedAt: string | null;
  completedAt: string | null;
  jobId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentShare {
  id: number;
  shareMode: string;
  expiresAt: string | null;
  revokedAt: string | null;
  submittedAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
}

interface DocumentEvent {
  id: number;
  eventType: string;
  eventNote: string | null;
  userId: string | null;
  externalName: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface DocumentVersion {
  id: number;
  versionNumber: number;
  createdByUserId: string;
  createdAt: string;
}

interface DocumentDetail {
  document: DocumentRecord;
  shares: DocumentShare[];
  events: DocumentEvent[];
  versions: DocumentVersion[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  job_form: 'Job Form',
  completed_form: 'Completed Form',
  estimate: 'Estimate / Quote',
  purchase_order: 'Purchase Order',
  work_order: 'Work Order',
  swms: 'SWMS',
  safety_plan: 'Safety Plan',
  incident_report: 'Incident Report',
  invoice: 'Invoice',
  general_report: 'Report',
};

const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  status_changed: 'Status changed',
  locked: 'Locked',
  unlocked: 'Unlocked',
  completed: 'Completed',
  share_created: 'Share link created',
  share_revoked: 'Share link revoked',
  viewed: 'Viewed',
  downloaded: 'Downloaded',
  submitted: 'Submitted',
  reset: 'Reset',
  pdf_generated: 'PDF generated',
  printed: 'Printed',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    submitted: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-emerald-100 text-emerald-700',
    locked: 'bg-slate-200 text-slate-700',
    approved: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
    void: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Share panel ───────────────────────────────────────────────────────────────

function SharePanel({ documentId, shares, onRefresh }: {
  documentId: number;
  shares: DocumentShare[];
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<'view' | 'complete'>('view');

  const activeShares = shares.filter((s) => !s.revokedAt && (!s.expiresAt || new Date(s.expiresAt) > new Date()));

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    setNewToken(null);
    try {
      const r = await fetch(`/api/documents/${documentId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareMode, expiryDays: 30 }),
      });
      const body = await r.json() as { token?: string; error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Failed');
      setNewToken(body.token ?? null);
      onRefresh();
    } catch (e: unknown) { setError((e as Error).message); }
    setCreating(false);
  };

  const handleRevoke = async () => {
    if (!confirm('Revoke all active share links for this document?')) return;
    setRevoking(true);
    try {
      await fetch(`/api/documents/${documentId}/share`, { method: 'DELETE' });
      setNewToken(null);
      onRefresh();
    } catch { /* ignore */ }
    setRevoking(false);
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Share2 size={15} className="text-primary" />
        <h3 className="text-sm font-bold text-slate-800">Share Links</h3>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {/* New token — show once */}
      {newToken && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold text-emerald-700">Link created — copy it now</p>
          <p className="text-xs font-mono text-emerald-600 break-all bg-white border border-emerald-200 rounded-lg px-2 py-1.5">
            {`${window.location.origin}/share/${newToken}`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void copyLink(newToken)}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold"
            >
              {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <a
              href={`${window.location.origin}/share/${newToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"
            >
              <ExternalLink size={11} /> Open
            </a>
          </div>
        </div>
      )}

      {/* Active shares */}
      {activeShares.length > 0 && (
        <div className="flex flex-col gap-2">
          {activeShares.map((s) => (
            <div key={s.id} className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-blue-700 capitalize">{s.shareMode} link</span>
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <Eye size={10} /> {s.useCount} use{s.useCount !== 1 ? 's' : ''}
                  {s.expiresAt && (
                    <><span className="mx-1">·</span><Clock size={10} /> Expires {new Date(s.expiresAt).toLocaleDateString('en-AU')}</>
                  )}
                  {s.submittedAt && (
                    <><span className="mx-1">·</span><CheckCircle2 size={10} className="text-emerald-500" /> Submitted</>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeShares.length === 0 && !newToken && (
        <p className="text-xs text-slate-400">No active share links.</p>
      )}

      {/* Create controls */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
        <div className="flex gap-2">
          {(['view', 'complete'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setShareMode(m)}
              className={`flex-1 text-xs py-1.5 rounded-lg border font-semibold transition-colors ${
                shareMode === m
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary/50'
              }`}
            >
              {m === 'view' ? 'View only' : 'Complete form'}
            </button>
          ))}
        </div>
        <button
          onClick={() => void handleCreate()}
          disabled={creating}
          className="flex items-center justify-center gap-1.5 text-xs bg-primary hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-semibold disabled:opacity-50"
        >
          {creating ? <Loader2 size={11} className="animate-spin" /> : <Share2 size={11} />}
          {activeShares.length > 0 ? 'Regenerate Link' : 'Create Share Link'}
        </button>
        {activeShares.length > 0 && (
          <button
            onClick={() => void handleRevoke()}
            disabled={revoking}
            className="flex items-center justify-center gap-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {revoking ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
            Revoke All Links
          </button>
        )}
      </div>
    </div>
  );
}

// ── Event log ─────────────────────────────────────────────────────────────────

function EventLog({ events }: { events: DocumentEvent[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Activity size={15} className="text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Audit History</h3>
      </div>
      {events.length === 0 && <p className="text-xs text-slate-400">No events yet.</p>}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {events.map((e) => (
          <div key={e.id} className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs font-medium text-slate-700">
                {EVENT_LABELS[e.eventType] ?? e.eventType}
                {e.externalName && <span className="text-slate-500"> · {e.externalName}</span>}
              </span>
              {e.eventNote && <span className="text-xs text-slate-400">{e.eventNote}</span>}
              <span className="text-xs text-slate-400">
                {new Date(e.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Version history ───────────────────────────────────────────────────────────

function VersionHistory({ versions }: { versions: DocumentVersion[] }) {
  if (versions.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <History size={15} className="text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">Version History</h3>
      </div>
      <div className="flex flex-col gap-2">
        {versions.map((v) => (
          <div key={v.id} className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium">v{v.versionNumber}</span>
            <span className="text-slate-400">
              {new Date(v.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/documents/${id}`);
      const body = await r.json() as { error?: string } & DocumentDetail;
      if (!r.ok) throw new Error(body.error ?? 'Failed to load');
      setDetail(body as DocumentDetail);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const doc = detail?.document;

  // Build the back link based on source module
  const backLink = (() => {
    if (!doc) return '/jobs';
    if (doc.jobId) return `/jobs/${doc.jobId}`;
    if (doc.sourceModule === 'estimate') return `/estimates/${doc.sourceId}`;
    if (doc.sourceModule === 'invoice') return `/invoices/${doc.sourceId}`;
    return '/jobs';
  })();

  const backLabel = (() => {
    if (!doc) return 'Back';
    if (doc.jobId) return 'Back to Job';
    if (doc.sourceModule === 'estimate') return 'Back to Estimate';
    if (doc.sourceModule === 'invoice') return 'Back to Invoice';
    return 'Back';
  })();

  return (
    <>
      <Helmet>
        <title>{doc ? `${doc.title} — IWILLBUILD` : 'Document — IWILLBUILD'}</title>
        <meta name="description" content={doc ? `View and manage ${doc.title} in IWILLBUILD.` : 'Internal document viewer — IWILLBUILD portal.'} />
        <link rel="canonical" href={`https://iwillbuild.com/documents/${id ?? ''}`} />
        <meta name="robots" content="noindex, nofollow" />
        {/* OG tags — required by SEO checker even on noindex pages */}
        <meta property="og:title" content={doc ? `${doc.title} — IWILLBUILD` : 'Document — IWILLBUILD'} />
        <meta property="og:description" content={doc ? `View and manage ${doc.title} in IWILLBUILD.` : 'Internal document viewer — IWILLBUILD portal.'} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://iwillbuild.com/documents/${id ?? ''}`} />
        <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': `https://iwillbuild.com/documents/${id ?? ''}#webpage`,
          name: doc ? doc.title : 'Document Viewer',
          url: `https://iwillbuild.com/documents/${id ?? ''}`,
          isPartOf: { '@id': 'https://iwillbuild.com/#website' },
          about: { '@id': 'https://iwillbuild.com/#organization' },
        })}</script>
      </Helmet>

      <div className="portal-content max-w-5xl mx-auto px-4 py-6">
        {/* Back nav */}
        <Link
          to={backLink}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary mb-5 transition-colors"
        >
          <ChevronLeft size={13} /> {backLabel}
        </Link>

        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading document…</span>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white border border-red-200 rounded-2xl p-8 text-center">
            <AlertTriangle size={36} className="text-red-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        )}

        {!loading && doc && detail && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Main column */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              {/* Document header */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">
                        {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType} · v{doc.version}
                      </p>
                      <h1 className="text-lg font-bold text-slate-800 leading-tight">{doc.title}</h1>
                    </div>
                  </div>
                  <StatusBadge status={doc.status} />
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                  {doc.isLocked && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Lock size={11} /> Locked
                    </span>
                  )}
                  {doc.completedAt && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 size={11} />
                      Completed {new Date(doc.completedAt).toLocaleDateString('en-AU')}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    Updated {new Date(doc.updatedAt).toLocaleDateString('en-AU')}
                  </span>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 flex-wrap">
                  {doc.sourceModule === 'job_form_submission' && doc.jobId && (
                    <Link
                      to={`/jobs/${doc.jobId}`}
                      className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      <ClipboardList size={12} /> View in Job
                    </Link>
                  )}
                  {doc.sourceModule === 'estimate' && (
                    <a
                      href={`/view/estimate/${doc.sourceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      <ExternalLink size={12} /> Open Estimate
                    </a>
                  )}
                  {doc.sourceModule === 'invoice' && (
                    <a
                      href={`/view/invoice/${doc.sourceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      <ExternalLink size={12} /> Open Invoice
                    </a>
                  )}
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    <Download size={12} /> Print / PDF
                  </button>
                </div>
              </div>

              {/* Event log */}
              <EventLog events={detail.events} />
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-5">
              {/* Share panel */}
              <SharePanel
                documentId={doc.id}
                shares={detail.shares}
                onRefresh={() => void load()}
              />

              {/* Version history */}
              <VersionHistory versions={detail.versions} />

              {/* Document metadata */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Details</h3>
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Type</span>
                    <span className="text-slate-700 font-medium">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Version</span>
                    <span className="text-slate-700 font-medium">v{doc.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status</span>
                    <StatusBadge status={doc.status} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Locked</span>
                    <span className={`font-medium ${doc.isLocked ? 'text-amber-600' : 'text-slate-400'}`}>
                      {doc.isLocked ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Created</span>
                    <span className="text-slate-700">{new Date(doc.createdAt).toLocaleDateString('en-AU')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Updated</span>
                    <span className="text-slate-700">{new Date(doc.updatedAt).toLocaleDateString('en-AU')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
