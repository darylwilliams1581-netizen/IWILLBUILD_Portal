import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, Plus, Loader2, AlertCircle, ChevronLeft,
  Mail, Share2, ExternalLink, Copy, Trash2, CheckCircle,
  Receipt, ChevronDown, Link2, Link2Off, Home, ArrowRight,
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
          <div className="absolute left-0 top-full mt-1.5 z-20 bg-white border border-gray-100 rounded-2xl shadow-xl py-1.5 min-w-[148px]" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}>
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
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                  <span className="flex-1 text-left">{s}</span>
                  {estimate.status === s && <CheckCircle size={10} className="text-violet-500 shrink-0" />}
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
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

  useEffect(() => { void load(); }, [load]);

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
      if (res.status === 201 && data.invoice_id) { navigate(`/invoices/${data.invoice_id}`); return; }
      if (res.status === 409 && data.invoice_id) { navigate(`/invoices/${data.invoice_id}`); return; }
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
      const unlockRes = await fetch(`/api/estimates/${estimateId}/unlock`, { method: 'POST', credentials: 'include' });
      if (!unlockRes.ok) { setError('Failed to unlock quote'); return; }
      const res = await fetch(`/api/estimates/${estimateId}/convert-to-invoice`, { method: 'POST', credentials: 'include' });
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
      const res = await fetch(`/api/estimates/${estimateId}/duplicate`, { method: 'POST', credentials: 'include' });
      if (res.ok) await load();
    } catch {
      setError('Failed to duplicate');
    }
  }

  async function handleCopyLink(estimateId: number) {
    await navigator.clipboard.writeText(`${window.location.origin}/view/estimate/${estimateId}`);
    setCopiedId(estimateId);
    setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden lg:pt-[104px]">
      <Helmet>
        <title>{job ? `Quotes — ${job.name}` : 'Quotes'} — IWILLBUILD</title>
        <meta name="description" content="View and manage quotes for this job." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/quotes`} />
      </Helmet>
      <h1 className="sr-only">{job ? `Quotes — ${job.name}` : 'Quotes'}</h1>

      {/* ── Header ── */}
      <div
        className="bg-white border-b border-gray-100 safe-top shrink-0"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}
      >
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">

          {/* Back */}
          <button
            onClick={() => navigate(`/jobs/${id}`)}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors shrink-0"
            aria-label="Back to job"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Home */}
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 flex items-center justify-center text-white transition-colors shrink-0"
            aria-label="Dashboard"
          >
            <Home size={15} />
          </button>

          {/* Title block — centred */}
          <div className="flex-1 min-w-0 text-center px-1">
            <p className="font-bold text-gray-900 text-[15px] leading-tight tracking-tight">Quotes</p>
            <p className="text-[11px] text-gray-400 leading-tight truncate mt-px">{job?.name ?? '…'}</p>
          </div>

          {/* New button */}
          {canEdit && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-[13px] font-bold px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60 shrink-0"
            >
              {creating
                ? <Loader2 size={13} className="animate-spin" />
                : <Plus size={13} strokeWidth={2.5} />}
              New
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-3">

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm">
              <AlertCircle size={15} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={22} className="animate-spin text-gray-300" />
            </div>
          )}

          {/* Empty state */}
          {!loading && estimates.length === 0 && (
            <div
              className="bg-white rounded-3xl border border-gray-100 p-12 flex flex-col items-center text-center"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
                <FileText size={22} className="text-violet-400" />
              </div>
              <p className="font-bold text-gray-800 text-[15px] mb-1">No quotes yet</p>
              <p className="text-sm text-gray-400 mb-6">Create your first quote for this job</p>
              {canEdit && (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-2xl transition-colors disabled:opacity-60"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  New Quote
                </button>
              )}
            </div>
          )}

          {/* Quote list */}
          {!loading && estimates.length > 0 && (
            <>
              {/* Count label */}
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-1">
                {estimates.length} {estimates.length === 1 ? 'Quote' : 'Quotes'}
              </p>

              {/* Cards */}
              <div
                className="bg-white rounded-3xl border border-gray-100 overflow-hidden divide-y divide-gray-50"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              >
                {estimates.map((est) => {
                  const isLocked = est.locked === 1 || est.locked === true;
                  const invoiceGone = isLocked && !est.invoice_exists;

                  return (
                    <div key={est.id} className="px-4 pt-4 pb-3">

                      {/* ── Row 1: icon · title · total ── */}
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                          <FileText size={15} className="text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/estimates/${est.id}`}
                            className="font-bold text-gray-900 text-[14px] leading-snug hover:text-violet-600 transition-colors truncate block"
                          >
                            {est.title}
                          </Link>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{fmtDate(est.createdAt)}</p>
                        </div>
                        <span className="font-bold text-gray-900 text-[14px] tabular-nums shrink-0 mt-0.5">
                          {fmt(est.total ?? 0)}
                        </span>
                      </div>

                      {/* ── Row 2: status + invoice badges ── */}
                      <div className="flex items-center gap-2 mt-2.5 ml-12 flex-wrap">
                        <StatusDropdown
                          estimate={est}
                          canEdit={canEdit}
                          onStatusChange={handleStatusChange}
                        />

                        {/* Locked → invoice exists */}
                        {isLocked && est.invoice_exists && (
                          <button
                            onClick={() => navigate(`/invoices/${est.locked_invoice_id}`)}
                            className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold px-2.5 py-1 rounded-full hover:bg-emerald-100 transition-colors"
                          >
                            <Link2 size={10} />
                            Invoiced
                          </button>
                        )}

                        {/* Locked → invoice deleted */}
                        {invoiceGone && canEdit && (
                          <button
                            onClick={() => handleUnlockAndReconvert(est.id)}
                            disabled={convertingId === est.id}
                            className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors disabled:opacity-60"
                          >
                            {convertingId === est.id
                              ? <Loader2 size={10} className="animate-spin" />
                              : <Link2Off size={10} />}
                            Re-push
                          </button>
                        )}

                        {/* Approved + not yet invoiced */}
                        {est.status === 'Approved' && canEdit && !isLocked && (
                          <button
                            onClick={() => handleConvertToInvoice(est.id)}
                            disabled={convertingId === est.id}
                            className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
                          >
                            {convertingId === est.id
                              ? <Loader2 size={10} className="animate-spin" />
                              : <Receipt size={10} />}
                            Invoice
                          </button>
                        )}
                      </div>

                      {/* ── Row 3: action strip + Open CTA ── */}
                      <div className="flex items-center mt-2 ml-12 pt-2 border-t border-gray-50">
                        {/* Secondary icon actions */}
                        <div className="flex items-center gap-0.5">
                          <a
                            href={`mailto:?subject=${encodeURIComponent(est.title)}&body=${encodeURIComponent(`View quote: ${window.location.origin}/view/estimate/${est.id}`)}`}
                            title="Email quote"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail size={14} />
                          </a>
                          <button
                            title={copiedId === est.id ? 'Copied!' : 'Copy share link'}
                            onClick={() => void handleCopyLink(est.id)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                              copiedId === est.id
                                ? 'text-emerald-600 bg-emerald-50'
                                : 'text-gray-400 hover:text-violet-600 hover:bg-violet-50'
                            }`}
                          >
                            {copiedId === est.id
                              ? <CheckCircle size={14} />
                              : <Share2 size={14} />}
                          </button>
                          <button
                            title="Duplicate"
                            onClick={() => handleDuplicate(est.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                          >
                            <Copy size={14} />
                          </button>
                          {canEdit && (
                            <button
                              title="Delete"
                              onClick={() => handleDelete(est.id)}
                              disabled={deletingId === est.id}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            >
                              {deletingId === est.id
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>

                        {/* Open CTA — right-aligned, always visible */}
                        <Link
                          to={`/estimates/${est.id}`}
                          className="ml-auto flex items-center gap-1 text-[12px] font-bold text-violet-600 hover:text-violet-700 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Open
                          <ArrowRight size={12} strokeWidth={2.5} />
                        </Link>
                      </div>

                    </div>
                  );
                })}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
