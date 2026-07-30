import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, Plus, Loader2, AlertCircle, ChevronLeft,
  Mail, Share2, ExternalLink, Copy, Trash2, CheckCircle,
  Receipt, ChevronDown, Link2, Link2Off, Home,
} from 'lucide-react';
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
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
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
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-opacity hover:opacity-80 ${style.bg} ${style.color}`}
      >
        {saving
          ? <Loader2 size={10} className="animate-spin" />
          : <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
        {estimate.status}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-2xl shadow-xl py-1.5 min-w-[140px]">
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
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-gray-50 transition-colors ${estimate.status === s ? st.color : 'text-gray-700'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {s}
                  {estimate.status === s && <CheckCircle size={10} className="ml-auto text-violet-600" />}
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
      const data = await res.json() as { invoice_id?: number; invoice?: { id: number }; error?: string };
      // 201 = new invoice created
      if (res.status === 201 && data.invoice_id) {
        navigate(`/invoices/${data.invoice_id}`);
        return;
      }
      // 409 = already locked — navigate to the existing invoice
      if (res.status === 409 && data.invoice_id) {
        navigate(`/invoices/${data.invoice_id}`);
        return;
      }
      // Legacy shape fallback
      if (data.invoice?.id) { navigate(`/invoices/${data.invoice.id}`); return; }
      await load();
    } catch {
      setError('Failed to convert to invoice');
    } finally {
      setConvertingId(null);
    }
  }

  async function handleUnlockAndReconvert(estimateId: number) {
    if (!confirm('The linked invoice was deleted. Unlock this quote and create a new invoice?')) return;
    setConvertingId(estimateId);
    try {
      // Unlock the estimate first
      const unlockRes = await fetch(`/api/estimates/${estimateId}/unlock`, {
        method: 'POST', credentials: 'include',
      });
      if (!unlockRes.ok) { setError('Failed to unlock quote'); return; }
      // Now re-convert
      const res = await fetch(`/api/estimates/${estimateId}/convert-to-invoice`, {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json() as { invoice_id?: number };
      if (data.invoice_id) { navigate(`/invoices/${data.invoice_id}`); return; }
      await load();
    } catch {
      setError('Failed to re-create invoice');
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

  return (
    <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden">
      <Helmet>
        <title>{job ? `Quotes — ${job.name}` : 'Quotes'} — IWILLBUILD</title>
        <meta name="description" content="View and manage quotes for this job." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/quotes`} />
      </Helmet>
      <h1 className="sr-only">{job ? `Quotes — ${job.name}` : 'Quotes'}</h1>

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(`/jobs/${id}`)}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => navigate('/')} className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors touch-manipulation shadow-sm" title="Dashboard"><Home size={18} /></button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
            <p className="text-gray-900 font-bold text-xl leading-tight text-center">Quotes</p>
            <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
              <button onClick={() => navigate('/jobs')} className="hover:text-violet-600 transition-colors">Jobs</button>
              <span>/</span>
              <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-violet-600 transition-colors truncate max-w-[80px]">{job?.name ?? '...'}</button>
              <span>/</span>
              <span className="text-gray-500 font-medium">Quotes</span>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 bg-violet-500 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-bold px-4 py-2.5 rounded-2xl transition-colors disabled:opacity-60 shrink-0"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              New Quote
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 px-4 py-5 space-y-3 max-w-2xl w-full mx-auto">

        {error && (
          <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm">
            <AlertCircle size={15} className="shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-gray-300" />
          </div>
        ) : estimates.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-violet-400" />
            </div>
            <p className="font-bold text-gray-800 mb-1">No quotes yet</p>
            <p className="text-sm text-gray-400 mb-5">Create your first quote for this job</p>
            {canEdit && (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 bg-violet-500 hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-2xl transition-colors disabled:opacity-60"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                New Quote
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
              {estimates.length} {estimates.length === 1 ? 'Quote' : 'Quotes'}
            </p>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden divide-y divide-gray-50" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              {estimates.map((est) => {
                const isLocked = est.locked === 1 || est.locked === true;
                const invoiceGone = isLocked && !est.invoice_exists;
                return (
                  <div key={est.id} className="px-4 py-4">
                    {/* Row 1: icon + title + total */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText size={15} className="text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/estimates/${est.id}`}
                          className="font-bold text-gray-900 text-sm hover:text-violet-600 transition-colors truncate block"
                        >
                          {est.title}
                        </Link>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(est.createdAt)}</p>
                      </div>
                      <span className="font-bold text-gray-900 text-sm tabular-nums shrink-0">
                        {fmt(est.total ?? 0)}
                      </span>
                    </div>

                    {/* Row 2: status + invoice badge + actions */}
                    <div className="flex items-center gap-2 mt-3 ml-12 flex-wrap">
                      <StatusDropdown
                        estimate={est}
                        canEdit={canEdit}
                        onStatusChange={handleStatusChange}
                      />

                      {/* Locked → invoice exists: show "Sent to Invoice" badge + navigate button */}
                      {isLocked && est.invoice_exists && (
                        <button
                          onClick={() => navigate(`/invoices/${est.locked_invoice_id}`)}
                          className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors hover:bg-emerald-100"
                          title="View linked invoice"
                        >
                          <Link2 size={11} />
                          Sent to Invoice
                        </button>
                      )}

                      {/* Locked → invoice was deleted: show warning + re-push button */}
                      {invoiceGone && canEdit && (
                        <button
                          onClick={() => handleUnlockAndReconvert(est.id)}
                          disabled={convertingId === est.id}
                          className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors hover:bg-amber-100 disabled:opacity-60"
                          title="Invoice was deleted — click to re-create"
                        >
                          {convertingId === est.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Link2Off size={11} />}
                          Re-push Invoice
                        </button>
                      )}

                      {/* Not yet invoiced: show Invoice button */}
                      {est.status === 'Approved' && canEdit && !isLocked && (
                        <button
                          onClick={() => handleConvertToInvoice(est.id)}
                          disabled={convertingId === est.id}
                          className="flex items-center gap-1.5 bg-violet-500 hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
                        >
                          {convertingId === est.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Receipt size={11} />}
                          Invoice
                        </button>
                      )}

                      <div className="flex items-center gap-0.5 ml-auto">
                        <a
                          href={`mailto:?subject=${encodeURIComponent(est.title)}&body=${encodeURIComponent(`View quote: ${window.location.origin}/view/estimate/${est.id}`)}`}
                          title="Email"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Mail size={14} />
                        </a>
                        <button
                          title="Copy share link"
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/view/estimate/${est.id}`)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <Share2 size={14} />
                        </button>
                        <Link
                          to={`/estimates/${est.id}`}
                          title="Open editor"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <ExternalLink size={14} />
                        </Link>
                        <button
                          title="Duplicate"
                          onClick={() => handleDuplicate(est.id)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <Copy size={14} />
                        </button>
                        {canEdit && (
                          <button
                            title="Delete"
                            onClick={() => handleDelete(est.id)}
                            disabled={deletingId === est.id}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {deletingId === est.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
