/**
 * JobPurchaseOrders — Purchase Orders / Work Orders for a specific job.
 *
 * Lives under Money / Records in the job detail sidebar.
 * Extracted from JobProgress where it did not belong.
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, FileText, ExternalLink } from 'lucide-react';
import {
  type Contractor, type PurchaseOrder,
  fmt, POStatusBadge, CreatePOModal, PODetailModal,
} from './JobProgressPOModals';

interface Props { jobId: number; }

export default function JobPurchaseOrders({ jobId }: Props) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [activePO, setActivePO] = useState<PurchaseOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [poRes, contRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/purchase-orders`, { credentials: 'include' }),
        fetch(`/api/customers?type=contractor&status=active`, { credentials: 'include' }),
      ]);
      if (poRes.ok) {
        const d = await poRes.json() as { purchaseOrders: PurchaseOrder[] };
        setPurchaseOrders(d.purchaseOrders ?? []);
      }
      if (contRes.ok) {
        const d = await contRes.json() as { customers: Contractor[] };
        setContractors(d.customers ?? []);
      }
    } catch {
      setError('Failed to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading purchase orders…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-destructive text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
            <FileText size={14} className="text-primary" />
            Purchase Orders / Work Orders
            {purchaseOrders.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                {purchaseOrders.length}
              </span>
            )}
          </h3>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus size={12} />New PO
          </button>
        </div>

        {/* List */}
        {purchaseOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <FileText size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No purchase orders yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click "New PO" to create a purchase order or work order for this job.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {purchaseOrders.map((po) => {
              const total = parseFloat(po.total) || 0;
              return (
                <button
                  key={po.id}
                  onClick={() => setActivePO(po)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText size={14} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">{po.po_number}</p>
                      <POStatusBadge status={po.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{po.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {po.assigned_to_type === 'internal'
                        ? `Internal${po.assigned_to_name ? ` — ${po.assigned_to_name}` : ''}`
                        : (po.contractor_name ?? po.assigned_to_name ?? 'Contractor')}
                      {po.trade_type ? ` · ${po.trade_type}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-foreground">{fmt(total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {po.lines.length} line{po.lines.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ExternalLink size={13} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreatePOModal
          jobId={jobId}
          selectedLines={[]}
          contractors={contractors}
          onClose={() => setShowCreate(false)}
          onCreated={(po) => {
            setPurchaseOrders((prev) => [po, ...prev]);
            setShowCreate(false);
          }}
        />
      )}

      {activePO && (
        <PODetailModal
          po={activePO}
          jobId={jobId}
          onClose={() => setActivePO(null)}
          onUpdated={(updated) => {
            setPurchaseOrders((prev) => prev.map((p) => p.id === updated.id ? updated : p));
            setActivePO(updated);
          }}
          onDeleted={(poId) => {
            setPurchaseOrders((prev) => prev.filter((p) => p.id !== poId));
            setActivePO(null);
          }}
        />
      )}
    </div>
  );
}
