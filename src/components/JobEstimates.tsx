import { useState, useEffect, useRef } from 'react';
import { useNavigate } from "react-router";
import { Plus, FileText, Loader2, AlertCircle, Copy, Trash2, ChevronRight, ChevronDown, Check, Lock, Receipt, ArrowRight, MoreHorizontal } from 'lucide-react';
import { fetchEstimates, createEstimate, deleteEstimate, patchEstimateStatus, getEstimateStatusStyle, ESTIMATE_STATUSES, type Estimate } from '@/lib/estimates-api';
import { usePermissions } from '@/lib/usePermissions';
interface Props {
  jobId: number;
}

// Statuses a non-admin can set (cannot set Approved)
const NON_ADMIN_STATUSES = ESTIMATE_STATUSES.filter(s => s !== 'Approved');
export default function JobEstimates({
  jobId
}: Props) {
  const navigate = useNavigate();
  const {
    isAdmin,
    isOwner
  } = usePermissions();
  const canApprove = isAdmin || isOwner;
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusOpenId, setStatusOpenId] = useState<number | null>(null);
  const [statusSaving, setStatusSaving] = useState<number | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<number | null>(null);
  const [converting, setConverting] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    load();
  }, [jobId]);

  // Close status dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusOpenId(null);
      }
    }
    if (statusOpenId !== null) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusOpenId]);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEstimates(jobId);
      setEstimates(data);
    } catch {
      setError('Failed to load estimates.');
    } finally {
      setLoading(false);
    }
  }
  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError('');
    try {
      const est = await createEstimate({
        jobId,
        title: newTitle.trim()
      });
      if (!est?.id) throw new Error('No estimate ID returned');
      setShowNew(false);
      setNewTitle('');
      navigate(`/estimates/${est.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create estimate.');
    } finally {
      setCreating(false);
    }
  }
  async function handleDuplicate(est: Estimate) {
    try {
      const res = await fetch(`/api/estimates/${est.id}`, {
        credentials: 'include'
      });
      const data = (await res.json()) as {
        estimate: Estimate;
        lines: Array<{
          description: string;
          quantity: string;
          unit: string | null;
          rate: string;
          lineOrder: number;
        }>;
      };
      const newEst = await createEstimate({
        jobId,
        title: `${est.title} (Copy)`,
        status: 'Draft',
        markupPercent: data.estimate.markupPercent,
        gstMode: data.estimate.gstMode,
        notes: data.estimate.notes ?? undefined,
        lines: data.lines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit ?? undefined,
          rate: l.rate,
          lineOrder: l.lineOrder
        }))
      });
      navigate(`/estimates/${newEst.id}`);
    } catch {
      setError('Failed to duplicate estimate.');
    }
  }
  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      await deleteEstimate(id);
      setDeleteId(null);
      setEstimates(prev => prev.filter(e => e.id !== id));
    } catch {
      setError('Failed to delete estimate.');
    } finally {
      setDeleting(false);
    }
  }
  async function handleStatusChange(est: Estimate, newStatus: string) {
    setStatusOpenId(null);
    if (est.status === newStatus) return;
    setStatusSaving(est.id);
    try {
      const updated = await patchEstimateStatus(est.id, newStatus);
      setEstimates(prev => prev.map(e => e.id === est.id ? {
        ...e,
        status: updated.status
      } : e));
    } catch {
      setError('Failed to update status.');
    } finally {
      setStatusSaving(null);
    }
  }
  async function handleConvertToInvoice(est: Estimate) {
    // If already locked, just navigate to the existing invoice
    if (est.locked && est.locked_invoice_id) {
      navigate(`/invoices/${est.locked_invoice_id}`);
      return;
    }
    setConverting(est.id);
    setError('');
    try {
      const res = await fetch(`/api/estimates/${est.id}/convert-to-invoice`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = (await res.json()) as {
        invoice_id?: number;
        invoice_number?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 409 && data.invoice_id) {
          navigate(`/invoices/${data.invoice_id}`);
          return;
        }
        throw new Error(data.error ?? 'Failed to convert');
      }
      await load();
      navigate(`/invoices/${data.invoice_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to convert estimate to invoice.');
    } finally {
      setConverting(null);
    }
  }
  if (loading) {
    return <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>;
  }
  const availableStatuses = canApprove ? ESTIMATE_STATUSES : NON_ADMIN_STATUSES;
  return <div className="flex flex-col gap-4">
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">
          Estimates ({estimates.length})
        </h2>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors">
          <Plus size={14} />
          New Estimate
        </button>
      </div>

      {/* New estimate inline form */}
      {showNew && <div className="bg-white rounded-xl border border-primary/40 p-4 flex flex-col gap-3 shadow-sm">
          <p className="text-sm font-semibold">New Estimate</p>
          <input autoFocus type="text" placeholder="Estimate title (e.g. Electrical Rough-in)" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => {
        if (e.key === 'Enter') handleCreate();
        if (e.key === 'Escape') {
          setShowNew(false);
          setNewTitle('');
        }
      }} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => {
          setShowNew(false);
          setNewTitle('');
        }} className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            <button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-violet-700 text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-60">
              {creating ? <Loader2 size={13} className="animate-spin" /> : null}
              Create & Open
            </button>
          </div>
        </div>}

      {/* Empty state */}
      {estimates.length === 0 && !showNew && <div className="bg-white rounded-xl border border-border p-8 text-center">
          <FileText size={32} className="mx-auto text-muted-foreground mb-3 opacity-40" />
          <p className="text-sm font-semibold text-foreground mb-1">No estimates yet</p>
          <p className="text-xs text-muted-foreground mb-4">Create an estimate to start pricing this job.</p>
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} />
            New Estimate
          </button>
        </div>}

      {estimates.length > 0 && <div className="flex flex-col gap-2" ref={dropdownRef}>
          {estimates.map(est => {
        const style = getEstimateStatusStyle(est.status);
        const isApproved = est.status === 'Approved';
        const isSavingThis = statusSaving === est.id;
        const isLocked = !!est.locked;
        const isConverting = converting === est.id;
        return <div key={est.id} className={`bg-white rounded-xl border transition-all group ${isLocked ? 'border-amber-200 bg-amber-50/30' : 'border-border hover:border-primary/30 hover:shadow-sm'}`}>
                {/* Locked banner */}
                {isLocked && <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-200 bg-amber-50 rounded-t-xl">
                    <Lock size={12} className="text-amber-600 shrink-0" />
                    <span className="text-xs font-semibold text-amber-700">Locked — converted to invoice</span>
                    {est.locked_invoice_id && <button onClick={() => navigate(`/invoices/${est.locked_invoice_id}`)} className="ml-auto flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors">
                        View Invoice <ArrowRight size={11} />
                      </button>}
                  </div>}

                <div className="flex items-center gap-3 px-4 py-3">

                  {/* Click area → open editor */}
                  <button onClick={() => navigate(`/estimates/${est.id}`)} className="flex-1 flex items-center gap-3 min-w-0 text-left">
                    <div className={`p-2 rounded-lg shrink-0 ${isLocked ? 'bg-amber-100' : 'bg-muted'}`}>
                      <FileText size={15} className={isLocked ? 'text-amber-600' : 'text-muted-foreground'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{est.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(est.updatedAt).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                      </p>
                    </div>

                    {/* Total */}
                    {est.total !== undefined && est.total > 0 && <span className="text-sm font-bold text-foreground shrink-0 tabular-nums">
                        ${est.total.toLocaleString('en-AU', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
                      </span>}

                    <ChevronRight size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  {/* Status dropdown — hidden when locked */}
                  {!isLocked && <div className="relative shrink-0">
                      <button onClick={e => {
                e.stopPropagation();
                setStatusOpenId(statusOpenId === est.id ? null : est.id);
              }} disabled={isSavingThis} className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full border transition-colors ${style.bg} ${style.color} hover:opacity-80`} title={isApproved && !canApprove ? 'Only admins can change Approved status' : 'Change status'}>
                        {isSavingThis ? <Loader2 size={10} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
                        {est.status}
                        {isApproved && !canApprove ? <Lock size={9} className="ml-0.5 opacity-60" /> : <ChevronDown size={10} />}
                      </button>

                      {statusOpenId === est.id && <>
                          <div className="fixed inset-0 z-10" onClick={() => setStatusOpenId(null)} />
                          <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 py-1 min-w-[180px]">
                            {availableStatuses.map(s => {
                    const st = getEstimateStatusStyle(s);
                    const isLockedStatus = s === 'Approved' && !canApprove;
                    return <button key={s} onClick={e => {
                      e.stopPropagation();
                      if (!isLockedStatus) void handleStatusChange(est, s);
                    }} disabled={isLockedStatus} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors
                                    ${isLockedStatus ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted'}
                                    ${est.status === s ? 'font-bold' : ''}`}>
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                                  <span className="flex-1">{s}</span>
                                  {isLockedStatus && <Lock size={10} className="text-muted-foreground" />}
                                  {est.status === s && !isLockedStatus && <Check size={12} className="text-primary" />}
                                </button>;
                  })}
                            {!canApprove && <p className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border mt-1">
                                Admin approval required for Approved status
                              </p>}
                          </div>
                        </>}
                    </div>}

                  {/* Convert to Invoice button — shown when Approved and not yet locked */}
                  {!isLocked && isApproved && <button onClick={() => void handleConvertToInvoice(est)} disabled={isConverting} title="Convert to Invoice" className="flex items-center gap-1.5 text-xs font-bold bg-primary hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 shrink-0">
                      {isConverting ? <Loader2 size={12} className="animate-spin" /> : <Receipt size={12} />}
                      Invoice
                    </button>}

                  {/* ⋯ overflow — Duplicate + Delete (hidden when locked) */}
                  {!isLocked && <div className="relative shrink-0">
                      <button onClick={e => {
                e.stopPropagation();
                setMoreOpenId(moreOpenId === est.id ? null : est.id);
              }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="More options">
                        <MoreHorizontal size={15} />
                      </button>
                      {moreOpenId === est.id && <>
                          <div className="fixed inset-0 z-10" onClick={() => setMoreOpenId(null)} />
                          <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                            <button onClick={e => {
                    e.stopPropagation();
                    setMoreOpenId(null);
                    void handleDuplicate(est);
                  }} className="w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 hover:bg-muted transition-colors">
                              <Copy size={13} className="text-muted-foreground" />
                              Duplicate
                            </button>
                            <div className="border-t border-border my-1" />
                            <button onClick={e => {
                    e.stopPropagation();
                    setMoreOpenId(null);
                    setDeleteId(est.id);
                  }} className="w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 hover:bg-red-50 text-red-600 transition-colors">
                              <Trash2 size={13} />
                              Delete
                            </button>
                          </div>
                        </>}
                    </div>}
                </div>
              </div>;
      })}
        </div>}
      {/* Delete confirm */}
      {deleteId !== null && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <h3 className="font-heading font-bold text-base">Delete Estimate?</h3>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the estimate and all its lines. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)} disabled={deleting} className="flex items-center gap-1.5 text-sm font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>}

    </div>;
}
