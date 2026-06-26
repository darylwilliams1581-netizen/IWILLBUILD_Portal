import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, FileText, Loader2, AlertCircle, Copy, Trash2, ChevronRight,
} from 'lucide-react';
import {
  fetchEstimates, createEstimate, deleteEstimate, getEstimateStatusStyle,
  estimateTotals, type Estimate,
} from '@/lib/estimates-api';

interface Props {
  jobId: number;
}

export default function JobEstimates({ jobId }: Props) {
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { load(); }, [jobId]);

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
    try {
      const est = await createEstimate({ jobId, title: newTitle.trim() });
      setShowNew(false);
      setNewTitle('');
      navigate(`/estimates/${est.id}`);
    } catch {
      setError('Failed to create estimate.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(est: Estimate) {
    try {
      // Fetch full estimate with lines
      const res = await fetch(`/api/estimates/${est.id}`, { credentials: 'include' });
      const data = await res.json() as { estimate: Estimate; lines: Array<{ description: string; quantity: string; unit: string | null; rate: string; lineOrder: number }> };
      const newEst = await createEstimate({
        jobId,
        title: `${est.title} (Copy)`,
        status: 'Draft',
        markupPercent: data.estimate.markupPercent,
        gstMode: data.estimate.gstMode,
        notes: data.estimate.notes ?? undefined,
        lines: data.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit ?? undefined,
          rate: l.rate,
          lineOrder: l.lineOrder,
        })),
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
      setEstimates((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError('Failed to delete estimate.');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">
          Estimates ({estimates.length})
        </h2>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} />
          New Estimate
        </button>
      </div>

      {/* New estimate inline form */}
      {showNew && (
        <div className="bg-white rounded-xl border border-primary/40 p-4 flex flex-col gap-3 shadow-sm">
          <p className="text-sm font-semibold">New Estimate</p>
          <input
            autoFocus
            type="text"
            placeholder="Estimate title (e.g. Electrical Rough-in)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowNew(false); setNewTitle(''); } }}
            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowNew(false); setNewTitle(''); }}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : null}
              Create & Open
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {estimates.length === 0 && !showNew && (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <FileText size={32} className="mx-auto text-muted-foreground mb-3 opacity-40" />
          <p className="text-sm font-semibold text-foreground mb-1">No estimates yet</p>
          <p className="text-xs text-muted-foreground mb-4">Create an estimate to start pricing this job.</p>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} />
            New Estimate
          </button>
        </div>
      )}

      {/* Estimate list */}
      {estimates.length > 0 && (
        <div className="flex flex-col gap-2">
          {estimates.map((est) => {
            const style = getEstimateStatusStyle(est.status);
            const totals = estimateTotals([], est.markupPercent, est.gstMode as 'No GST' | 'Add 10% GST');
            void totals; // totals shown in editor; list shows status only
            return (
              <div
                key={est.id}
                className="bg-white rounded-xl border border-border hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-3 p-4">
                  {/* Click to open */}
                  <button
                    onClick={() => navigate(`/estimates/${est.id}`)}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left"
                  >
                    <div className="p-2 rounded-lg bg-muted shrink-0">
                      <FileText size={15} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{est.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(est.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${style.bg} ${style.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {est.status}
                    </span>
                    <ChevronRight size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDuplicate(est)}
                      title="Duplicate"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(est.id)}
                      title="Delete"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <h3 className="font-heading font-bold text-base">Delete Estimate?</h3>
            <p className="text-sm text-muted-foreground">This will permanently delete the estimate and all its lines. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="flex items-center gap-1.5 text-sm font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
