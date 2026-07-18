import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, Plus, Loader2, AlertCircle, ChevronLeft,
  Mail, Share2, ExternalLink, Copy, Trash2, CheckCircle,
  Receipt, ChevronDown,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import FleetHeaderIcon from '@/components/FleetHeaderIcon';
import { usePermissions } from '@/lib/usePermissions';
import { fetchJob, type Job } from '@/lib/jobs-api';
import {
  getEstimateStatusStyle, ESTIMATE_STATUSES,
  type Estimate, type EstimateStatus,
} from '@/lib/estimates-api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Status dropdown ───────────────────────────────────────────────────────────
function StatusDropdown({
  estimate,
  canEdit,
  onStatusChange,
}: {
  estimate: Estimate;
  canEdit: boolean;
  onStatusChange: (id: number, status: EstimateStatus) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const style = getEstimateStatusStyle(estimate.status);

  if (!canEdit) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${style.bg} ${style.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        {estimate.status}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors hover:opacity-80 ${style.bg} ${style.color}`}
      >
        {saving ? <Loader2 size={10} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
        {estimate.status}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[130px]">
            {ESTIMATE_STATUSES.map((s) => {
              const st = getEstimateStatusStyle(s);
              return (
                <button
                  key={s}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setOpen(false);
                    setSaving(true);
                    await onStatusChange(estimate.id, s);
                    setSaving(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors ${estimate.status === s ? st.color : 'text-slate-700'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {s}
                  {estimate.status === s && <CheckCircle size={10} className="ml-auto text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JobQuotesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isOwner } = usePermissions();
  const canEdit = isAdmin || isOwner;

  const [job, setJob] = useState<Job | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const [jobData, estData] = await Promise.all([
        fetchJob(parseInt(id, 10)),
        fetch(`/api/estimates?jobId=${id}`, { credentials: 'include' }).then(r => r.json()) as Promise<{ estimates: Estimate[] }>,
      ]);
      setJob(jobData);
      setEstimates(estData.estimates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!id) return;
    setCreating(true);
    try {
      const res = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId: parseInt(id, 10), title: 'New Quote' }),
      });
      const data = await res.json() as { estimate?: { id: number }; id?: number };
      const newId = data.estimate?.id ?? (data as { id?: number }).id;
      if (newId) navigate(`/estimates/${newId}`);
    } catch {
      setError('Failed to create quote');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(estimateId: number) {
    if (!confirm('Delete this quote?')) return;
    setDeletingId(estimateId);
    try {
      await fetch(`/api/estimates/${estimateId}`, { method: 'DELETE', credentials: 'include' });
      setEstimates(prev => prev.filter(e => e.id !== estimateId));
    } catch {
      setError('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleConvertToInvoice(estimateId: number) {
    setConvertingId(estimateId);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/convert-to-invoice`, {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json() as { invoice?: { id: number } };
      if (data.invoice?.id) navigate(`/invoices/${data.invoice.id}`);
      else await load();
    } catch {
      setError('Failed to convert to invoice');
    } finally {
      setConvertingId(null);
    }
  }

  async function handleStatusChange(estimateId: number, status: EstimateStatus) {
    try {
      await fetch(`/api/estimates/${estimateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      setEstimates(prev => prev.map(e => e.id === estimateId ? { ...e, status } : e));
    } catch {
      setError('Failed to update status');
    }
  }

  async function handleDuplicate(estimateId: number) {
    try {
      const res = await fetch(`/api/estimates/${estimateId}/duplicate`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) await load();
    } catch {
      setError('Failed to duplicate');
    }
  }

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `Quotes — ${job.name}` : 'Quotes'} — IWILLBUILD Portal</title>
        <meta name="description" content="View and manage quotes for this job — create, edit, share and convert to invoice." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/quotes`} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <PortalSidebar />
      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 md:px-6 shrink-0 gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <FileText size={18} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-bold text-base leading-tight truncate">
              {job ? `${job.name}` : 'Quotes'}
            </h1>
            {job && <p className="text-xs text-slate-400 leading-tight">Quotes</p>}
          </div>
          {canEdit && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              New Quote
            </button>
          )}
          <FleetHeaderIcon />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-4xl">

            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-slate-300" />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm mb-4">
                <AlertCircle size={15} className="shrink-0" />{error}
              </div>
            )}

            {!loading && !error && (
              <>
                {/* Header count */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                    Quotes ({estimates.length})
                  </h2>
                </div>

                {estimates.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                      <FileText size={22} className="text-slate-400" />
                    </div>
                    <p className="font-semibold text-slate-700 mb-1">No quotes yet</p>
                    <p className="text-sm text-slate-400 mb-4">Create your first quote for this job</p>
                    {canEdit && (
                      <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-60"
                      >
                        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        New Quote
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                    {estimates.map((est) => {
                      const isLocked = est.locked === 1 || est.locked === true;
                      return (
                        <div key={est.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors group">
                          {/* Icon */}
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <FileText size={14} className="text-slate-400" />
                          </div>

                          {/* Title + date */}
                          <div className="flex-1 min-w-0">
                            <Link
                              to={`/estimates/${est.id}`}
                              className="font-semibold text-sm text-slate-800 hover:text-primary transition-colors truncate block"
                            >
                              {est.title}
                            </Link>
                            <p className="text-xs text-slate-400">{fmtDate(est.createdAt)}</p>
                          </div>

                          {/* Total */}
                          <span className="font-bold text-sm text-slate-800 shrink-0 tabular-nums">
                            {fmt(est.total ?? 0)}
                          </span>

                          {/* Status */}
                          <StatusDropdown
                            estimate={est}
                            canEdit={canEdit}
                            onStatusChange={handleStatusChange}
                          />

                          {/* Convert to Invoice button (Approved only) */}
                          {est.status === 'Approved' && canEdit && !isLocked && (
                            <button
                              onClick={() => handleConvertToInvoice(est.id)}
                              disabled={convertingId === est.id}
                              className="flex items-center gap-1.5 bg-primary hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 shrink-0"
                            >
                              {convertingId === est.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Receipt size={11} />}
                              Invoice
                            </button>
                          )}

                          {/* Action icons */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {/* Email */}
                            <a
                              href={`mailto:?subject=${encodeURIComponent(est.title)}&body=${encodeURIComponent(`Please find your quote attached.\n\nView online: ${window.location.origin}/view/estimate/${est.id}`)}`}
                              title="Email"
                              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Mail size={14} />
                            </a>
                            {/* Share link */}
                            <button
                              title="Copy share link"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/view/estimate/${est.id}`);
                              }}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <Share2 size={14} />
                            </button>
                            {/* Open */}
                            <Link
                              to={`/estimates/${est.id}`}
                              title="Open editor"
                              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <ExternalLink size={14} />
                            </Link>
                            {/* Duplicate */}
                            <button
                              title="Duplicate"
                              onClick={() => handleDuplicate(est.id)}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <Copy size={14} />
                            </button>
                            {/* Delete */}
                            {canEdit && (
                              <button
                                title="Delete"
                                onClick={() => handleDelete(est.id)}
                                disabled={deletingId === est.id}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {deletingId === est.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : <Trash2 size={14} />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
