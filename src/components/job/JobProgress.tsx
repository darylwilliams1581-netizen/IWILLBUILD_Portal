import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, AlertCircle, TrendingUp, CheckSquare, Square,
  Plus, FileText, Download, ChevronDown, X, Loader2,
  CheckCircle2, Clock, Send, DollarSign, Ban, Pencil,
  Users, HardHat, Wrench, Calendar, MessageSquare,
  ExternalLink, Trash2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProgressLine {
  id: number;
  description: string;
  quantity: string;
  unit: string | null;
  rate: string;
  percentComplete: number;
  progressNote: string | null;
  assignmentType: string | null;
  assignedToName: string | null;
  contractorId: number | null;
  tradeType: string | null;
}

interface Contractor {
  id: number;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  abn: string | null;
  trade_type: string | null;
  record_type: string;
}

interface POLine {
  id: number;
  description: string;
  qty: string;
  unit: string | null;
  rate: string;
  amount: string;
  sort_order: number;
}

interface PurchaseOrder {
  id: number;
  po_number: string;
  title: string;
  status: string;
  assigned_to_type: string;
  assigned_to_name: string | null;
  contractor_id: number | null;
  contractor_name: string | null;
  contractor_email: string | null;
  contractor_phone: string | null;
  contractor_abn: string | null;
  trade_type: string | null;
  instructions: string | null;
  start_date: string | null;
  finish_date: string | null;
  subtotal: string;
  gst: string;
  total: string;
  cancelled_note: string | null;
  created_at: string;
  lines: POLine[];
}

interface Props {
  jobId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lineTotal(line: ProgressLine) {
  return (parseFloat(line.quantity) || 0) * (parseFloat(line.rate) || 0);
}
function completedValue(line: ProgressLine) {
  return lineTotal(line) * (line.percentComplete / 100);
}
function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

const TRADE_TYPES = [
  'Concreting', 'Electrical', 'Excavation', 'Formwork', 'Framing',
  'General Labour', 'Landscaping', 'Painting', 'Plumbing', 'Roofing',
  'Steel / Structural', 'Tiling', 'Waterproofing', 'Other',
];

const PO_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',     color: 'text-slate-600',  bg: 'bg-slate-100',  icon: <Pencil size={10} /> },
  sent:      { label: 'Sent',      color: 'text-blue-700',   bg: 'bg-blue-50',    icon: <Send size={10} /> },
  completed: { label: 'Completed', color: 'text-emerald-700',bg: 'bg-emerald-50', icon: <CheckCircle2 size={10} /> },
  paid:      { label: 'Paid',      color: 'text-violet-700', bg: 'bg-violet-50',  icon: <DollarSign size={10} /> },
  cancelled: { label: 'Cancelled', color: 'text-red-700',    bg: 'bg-red-50',     icon: <Ban size={10} /> },
};

// ── Assignment Badge ──────────────────────────────────────────────────────────

function AssignmentBadge({ line }: { line: ProgressLine }) {
  if (!line.assignmentType) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">Unassigned</span>;
  }
  if (line.assignmentType === 'internal') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200"><Users size={9} />Internal{line.assignedToName ? ` — ${line.assignedToName}` : ''}</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><HardHat size={9} />{line.assignedToName ?? 'Contractor'}</span>;
}

// ── PO Status Badge ───────────────────────────────────────────────────────────

function POStatusBadge({ status }: { status: string }) {
  const cfg = PO_STATUS_CONFIG[status] ?? PO_STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── Create PO Modal ───────────────────────────────────────────────────────────

interface CreatePOModalProps {
  jobId: number;
  selectedLines: ProgressLine[];
  contractors: Contractor[];
  onClose: () => void;
  onCreated: (po: PurchaseOrder) => void;
}

function CreatePOModal({ jobId, selectedLines, contractors, onClose, onCreated }: CreatePOModalProps) {
  const [assignType, setAssignType] = useState<'internal' | 'contractor'>('internal');
  const [assignedToName, setAssignedToName] = useState('');
  const [contractorId, setContractorId] = useState<number | null>(null);
  const [tradeType, setTradeType] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [startDate, setStartDate] = useState('');
  const [finishDate, setFinishDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredContractors = tradeType
    ? contractors.filter((c) => !c.trade_type || c.trade_type === tradeType)
    : contractors;

  async function handleCreate() {
    setSaving(true); setError('');
    try {
      const lines = selectedLines.map((l, i) => ({
        progressLineId: l.id,
        description: l.description,
        qty: parseFloat(l.quantity) || 1,
        unit: l.unit,
        rate: parseFloat(l.rate) || 0,
        amount: lineTotal(l),
        sortOrder: i,
      }));

      const selectedContractor = contractorId ? contractors.find((c) => c.id === contractorId) : null;
      const resolvedName = assignType === 'contractor'
        ? (selectedContractor?.name ?? assignedToName)
        : assignedToName;

      const res = await fetch(`/api/jobs/${jobId}/purchase-orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedToType: assignType,
          assignedToName: resolvedName,
          contractorId: assignType === 'contractor' ? contractorId : null,
          tradeType,
          title,
          instructions,
          startDate,
          finishDate,
          lines,
        }),
      });
      const data = await res.json() as { purchaseOrder?: PurchaseOrder; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to create PO'); return; }
      onCreated(data.purchaseOrder!);
    } catch {
      setError('Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText size={14} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">Generate Purchase Order / Work Order</p>
            <p className="text-xs text-muted-foreground">{selectedLines.length} scope line{selectedLines.length !== 1 ? 's' : ''} selected</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertCircle size={12} />{error}
            </div>
          )}

          {/* Assignment type */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2">Assign To</label>
            <div className="flex gap-2">
              {(['internal', 'contractor'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAssignType(t)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                    assignType === t
                      ? t === 'internal' ? 'bg-blue-600 text-white border-blue-600' : 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {t === 'internal' ? <Users size={12} /> : <HardHat size={12} />}
                  {t === 'internal' ? 'Internal Team' : 'Contractor'}
                </button>
              ))}
            </div>
          </div>

          {/* Trade filter */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Trade Type</label>
            <select
              value={tradeType}
              onChange={(e) => { setTradeType(e.target.value); setContractorId(null); }}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All trades</option>
              {TRADE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Contractor picker or internal name */}
          {assignType === 'contractor' ? (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Contractor {filteredContractors.length === 0 && tradeType ? `(no ${tradeType} contractors found)` : ''}
              </label>
              <select
                value={contractorId ?? ''}
                onChange={(e) => setContractorId(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select contractor…</option>
                {filteredContractors.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.trade_type ? ` (${c.trade_type})` : ''}</option>
                ))}
              </select>
              {filteredContractors.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No contractors found. Add contractors in the Customers module.</p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Team / Person Name (optional)</label>
              <input
                type="text"
                value={assignedToName}
                onChange={(e) => setAssignedToName(e.target.value)}
                placeholder="e.g. Site crew, John Smith…"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">PO Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Concrete slab pour — Stage 1"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Finish Date</label>
              <input type="date" value={finishDate} onChange={(e) => setFinishDate(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Instructions / Comments</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Special instructions, access requirements, safety notes…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            />
          </div>

          {/* Selected lines preview */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Scope Lines</p>
            <div className="border border-border rounded-xl overflow-hidden">
              {selectedLines.map((l, i) => (
                <div key={l.id} className={`flex items-center justify-between px-3 py-2 text-xs ${i > 0 ? 'border-t border-border' : ''}`}>
                  <span className="text-foreground truncate flex-1 mr-2">{l.description}</span>
                  <span className="text-muted-foreground whitespace-nowrap font-mono">{fmt(lineTotal(l))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
                <span className="text-xs font-bold text-foreground">Subtotal (ex GST)</span>
                <span className="text-xs font-bold font-mono text-foreground">{fmt(selectedLines.reduce((s, l) => s + lineTotal(l), 0))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-muted/30 shrink-0">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-xl transition-colors">Cancel</button>
          <button
            onClick={() => void handleCreate()}
            disabled={saving || (assignType === 'contractor' && !contractorId && filteredContractors.length > 0)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            Generate PO
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PO Detail Modal ───────────────────────────────────────────────────────────

interface PODetailModalProps {
  po: PurchaseOrder;
  jobId: number;
  onClose: () => void;
  onUpdated: (po: PurchaseOrder) => void;
  onDeleted: (poId: number) => void;
}

function PODetailModal({ po, jobId, onClose, onUpdated, onDeleted }: PODetailModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelNote, setCancelNote] = useState(po.cancelled_note ?? 'Please note this Purchase Order / Work Order has been cancelled.');
  const [statusDropOpen, setStatusDropOpen] = useState(false);

  async function updateStatus(newStatus: string) {
    setSaving(true); setError(''); setStatusDropOpen(false);
    try {
      const res = await fetch(`/api/jobs/${jobId}/purchase-orders/${po.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json() as { purchaseOrder?: PurchaseOrder; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      onUpdated(data.purchaseOrder!);
    } catch { setError('Failed to update status'); }
    finally { setSaving(false); }
  }

  async function handleCancel() {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/purchase-orders/${po.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancelledNote: cancelNote }),
      });
      const data = await res.json() as { purchaseOrder?: PurchaseOrder; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      onUpdated(data.purchaseOrder!);
      setShowCancelForm(false);
    } catch { setError('Failed to cancel PO'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${po.po_number}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/purchase-orders/${po.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) { setError('Failed to delete'); return; }
      onDeleted(po.id);
    } catch { setError('Failed to delete'); }
    finally { setSaving(false); }
  }

  function openPDF() {
    window.open(`/api/jobs/${jobId}/purchase-orders/${po.id}/pdf`, '_blank');
  }

  const isCancelled = po.status === 'cancelled';
  const subtotal = parseFloat(po.subtotal) || 0;
  const gst = parseFloat(po.gst) || 0;
  const total = parseFloat(po.total) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm text-foreground">{po.po_number}</p>
              <POStatusBadge status={po.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{po.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={openPDF} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors">
              <Download size={12} />PDF
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertCircle size={12} />{error}
            </div>
          )}

          {isCancelled && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 text-center">
              <p className="font-black text-red-700 text-lg tracking-widest">CANCELLED</p>
              {po.cancelled_note && <p className="text-xs text-red-600 mt-1">{po.cancelled_note}</p>}
            </div>
          )}

          {/* Assignment */}
          <div className={`rounded-xl p-3 border ${po.assigned_to_type === 'internal' ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
              {po.assigned_to_type === 'internal' ? 'Internal Assignment' : 'Contractor'}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {po.assigned_to_type === 'internal'
                ? `Internal Team${po.assigned_to_name ? ` — ${po.assigned_to_name}` : ''}`
                : (po.contractor_name ?? po.assigned_to_name ?? '—')}
            </p>
            {po.contractor_email && <p className="text-xs text-muted-foreground mt-0.5">{po.contractor_email}</p>}
            {po.contractor_phone && <p className="text-xs text-muted-foreground">{po.contractor_phone}</p>}
            {po.contractor_abn && <p className="text-xs text-muted-foreground">ABN: {po.contractor_abn}</p>}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {po.trade_type && (
              <div className="bg-muted/30 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Trade</p>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1"><Wrench size={11} />{po.trade_type}</p>
              </div>
            )}
            {(po.start_date || po.finish_date) && (
              <div className="bg-muted/30 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Schedule</p>
                <p className="text-xs text-foreground flex items-center gap-1"><Calendar size={10} />
                  {fmtDate(po.start_date)} → {fmtDate(po.finish_date)}
                </p>
              </div>
            )}
          </div>

          {po.instructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1"><MessageSquare size={10} />Instructions</p>
              <p className="text-xs text-amber-800 whitespace-pre-wrap">{po.instructions}</p>
            </div>
          )}

          {/* Lines */}
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Description</th>
                  <th className="text-center px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap">Qty</th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground">Rate</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {po.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-foreground">{l.description}</td>
                    <td className="px-2 py-2 text-center text-muted-foreground">{l.qty}{l.unit ? ` ${l.unit}` : ''}</td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">{fmt(parseFloat(l.rate) || 0)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{fmt(parseFloat(l.amount) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border px-3 py-2 space-y-1 bg-muted/20">
              <div className="flex justify-between text-xs text-muted-foreground"><span>Subtotal (ex GST)</span><span className="font-mono">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>GST (10%)</span><span className="font-mono">{fmt(gst)}</span></div>
              <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
            </div>
          </div>

          {/* Cancel form */}
          {showCancelForm && !isCancelled && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-red-700">Cancel this Purchase Order</p>
              <textarea
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                rows={3}
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 resize-y bg-white"
              />
              <div className="flex gap-2">
                <button onClick={() => void handleCancel()} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}Confirm Cancel
                </button>
                <button onClick={() => setShowCancelForm(false)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted">Dismiss</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border bg-muted/20 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            {!isCancelled && (
              <button onClick={() => setShowCancelForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors">
                <Ban size={11} />Cancel PO
              </button>
            )}
            <button onClick={() => void handleDelete()} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50">
              <Trash2 size={11} />Delete
            </button>
          </div>

          {/* Status changer */}
          {!isCancelled && (
            <div className="relative">
              <button
                onClick={() => setStatusDropOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : null}
                Change Status <ChevronDown size={11} />
              </button>
              {statusDropOpen && (
                <div className="absolute bottom-full right-0 mb-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden z-10 min-w-[140px]">
                  {Object.entries(PO_STATUS_CONFIG).filter(([s]) => s !== po.status && s !== 'cancelled').map(([s, cfg]) => (
                    <button key={s} onClick={() => void updateStatus(s)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left">
                      <span className={cfg.color}>{cfg.icon}</span>{cfg.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function JobProgress({ jobId }: Props) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tradeFilter, setTradeFilter] = useState('');
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [activePO, setActivePO] = useState<PurchaseOrder | null>(null);
  const pendingRef = useRef<Record<number, { percentComplete?: number; progressNote?: string }>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [progRes, poRes, contRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/progress`, { credentials: 'include' }),
        fetch(`/api/jobs/${jobId}/purchase-orders`, { credentials: 'include' }),
        fetch(`/api/customers?type=contractor&status=active`, { credentials: 'include' }),
      ]);
      if (progRes.ok) {
        const d = await progRes.json() as { lines: ProgressLine[] };
        setLines(d.lines ?? []);
      }
      if (poRes.ok) {
        const d = await poRes.json() as { purchaseOrders: PurchaseOrder[] };
        setPurchaseOrders(d.purchaseOrders ?? []);
      }
      if (contRes.ok) {
        const d = await contRes.json() as { customers: Contractor[] };
        setContractors(d.customers ?? []);
      }
    } catch {
      setError('Failed to load progress.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  async function syncFromEstimate() {
    if (!confirm('This will replace current progress lines with lines from the approved estimate. Continue?')) return;
    setSyncing(true); setError(''); setSyncMsg('');
    try {
      const res = await fetch(`/api/jobs/${jobId}/progress/sync`, { method: 'POST', credentials: 'include' });
      const data = await res.json() as { lines?: ProgressLine[]; estimateTitle?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setLines(data.lines ?? []);
      setSyncMsg(`Synced from "${data.estimateTitle}"`);
      pendingRef.current = {};
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const updates = Object.entries(pendingRef.current).map(([id, vals]) => ({ id: parseInt(id), ...vals }));
      if (updates.length === 0) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}/progress`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as { lines: ProgressLine[] };
        setLines(data.lines ?? []);
        pendingRef.current = {};
      } catch {
        setError('Failed to save progress.');
      } finally {
        setSaving(false);
      }
    }, 800);
  }

  function handlePercent(lineId: number, value: string) {
    const num = Math.max(0, Math.min(100, parseInt(value) || 0));
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, percentComplete: num } : l));
    pendingRef.current[lineId] = { ...pendingRef.current[lineId], percentComplete: num };
    scheduleSave();
  }

  function handleNote(lineId: number, value: string) {
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, progressNote: value } : l));
    pendingRef.current[lineId] = { ...pendingRef.current[lineId], progressNote: value };
    scheduleSave();
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const visible = filteredLines.map((l) => l.id);
    const allSelected = visible.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visible));
  }

  const filteredLines = tradeFilter
    ? lines.filter((l) => l.tradeType === tradeFilter || (!l.tradeType && tradeFilter === ''))
    : lines;

  const selectedLines = lines.filter((l) => selectedIds.has(l.id));

  const totalValue = lines.reduce((s, l) => s + lineTotal(l), 0);
  const totalCompleted = lines.reduce((s, l) => s + completedValue(l), 0);
  const totalRemaining = totalValue - totalCompleted;
  const overallPct = totalValue > 0 ? Math.round((totalCompleted / totalValue) * 100) : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header card ── */}
      <div className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Job Progress</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
            <button
              onClick={() => void syncFromEstimate()}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync from Estimate'}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
            <AlertCircle size={12} /> {error}
          </p>
        )}
        {syncMsg && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">{syncMsg}</p>
        )}

        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <TrendingUp size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No approved estimate yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Approve an estimate on the Estimates tab, then click "Sync from Estimate" to set up progress tracking.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">Total Value</p>
                <p className="font-heading font-bold text-sm text-foreground">{fmt(totalValue)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-center">
                <p className="text-xs text-emerald-700 mb-0.5">Completed</p>
                <p className="font-heading font-bold text-sm text-emerald-700">{fmt(totalCompleted)}</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-center">
                <p className="text-xs text-red-600 mb-0.5">Remaining</p>
                <p className="font-heading font-bold text-sm text-red-600">{fmt(totalRemaining)}</p>
              </div>
            </div>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="text-foreground">{overallPct}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${overallPct}%` }} />
            </div>
          </>
        )}
      </div>

      {/* ── Scope lines with assignment controls ── */}
      {lines.length > 0 && (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
            {/* Trade filter */}
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              <option value="">All trades</option>
              {TRADE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <div className="flex-1" />

            {selectedIds.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                <button
                  onClick={() => setShowCreatePO(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  <Plus size={12} />Generate PO / Work Order
                </button>
              </>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-3 w-8">
                    <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                      {filteredLines.length > 0 && filteredLines.every((l) => selectedIds.has(l.id))
                        ? <CheckSquare size={14} className="text-primary" />
                        : <Square size={14} />}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Qty / Unit</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">Line Total</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">% Done</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-emerald-700">Completed $</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Assignment</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLines.map((line) => {
                  const total = lineTotal(line);
                  const done = completedValue(line);
                  const isSelected = selectedIds.has(line.id);
                  return (
                    <tr key={line.id} className={`transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'}`}>
                      <td className="px-3 py-3">
                        <button onClick={() => toggleSelect(line.id)} className="text-muted-foreground hover:text-foreground">
                          {isSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground max-w-[180px]">
                        <p className="truncate">{line.description}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {line.quantity}{line.unit ? ` ${line.unit}` : ''}
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono text-foreground whitespace-nowrap">{fmt(total)}</td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number" min={0} max={100} value={line.percentComplete}
                          onChange={(e) => handlePercent(line.id, e.target.value)}
                          className="w-16 text-center px-2 py-1 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-mono font-semibold text-emerald-700 whitespace-nowrap">{fmt(done)}</td>
                      <td className="px-3 py-3">
                        <AssignmentBadge line={line} />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text" placeholder="Note…" value={line.progressNote ?? ''}
                          onChange={(e) => handleNote(line.id, e.target.value)}
                          className="w-full min-w-[100px] px-2 py-1 border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Purchase Orders section ── */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
            <FileText size={14} className="text-primary" />
            Purchase Orders / Work Orders
            {purchaseOrders.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">{purchaseOrders.length}</span>
            )}
          </h3>
          {lines.length > 0 && selectedIds.size === 0 && (
            <button
              onClick={() => {
                if (lines.length > 0) {
                  setSelectedIds(new Set(lines.map((l) => l.id)));
                  setShowCreatePO(true);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors"
            >
              <Plus size={12} />New PO
            </button>
          )}
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              <FileText size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No purchase orders yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Select scope lines above and click "Generate PO / Work Order" to create one.
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
                    <p className="text-xs text-muted-foreground">{po.lines.length} line{po.lines.length !== 1 ? 's' : ''}</p>
                  </div>
                  <ExternalLink size={13} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showCreatePO && (
        <CreatePOModal
          jobId={jobId}
          selectedLines={selectedLines}
          contractors={contractors}
          onClose={() => setShowCreatePO(false)}
          onCreated={(po) => {
            setPurchaseOrders((prev) => [po, ...prev]);
            setSelectedIds(new Set());
            setShowCreatePO(false);
            // Refresh lines to show updated assignment badges
            void load();
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
