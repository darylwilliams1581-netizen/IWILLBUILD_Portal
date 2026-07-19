import { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Receipt, ArrowLeft, Save, Send, Copy, Trash2, FileText,
  Plus, GripVertical, X, ChevronDown, Loader2, AlertCircle,
  Check, DollarSign, CreditCard, Ban, AlertTriangle,
  ChevronUp, User, Building2, RefreshCw, CheckCircle2, XCircle, Download, Share2,
  RotateCcw, Lock, Mail,
} from 'lucide-react';
import ShareLinkModal from '@/components/ShareLinkModal';
import SendInvoiceEmailModal from '@/components/SendInvoiceEmailModal';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import JobContextTab from '@/components/JobContextTab';
import CustomerSelector from '@/components/CustomerSelector';
import { usePermissions } from '@/lib/usePermissions';
import {
  fetchInvoice, createInvoice, updateInvoice, deleteInvoice,
  duplicateInvoice, markInvoiceSent, recordPayment, voidInvoice,
  fmtMoney, STATUS_LABELS, STATUS_COLORS,
  type Invoice, type InvoiceLine, type InvoiceStatus,
} from '@/lib/invoices-api';
import type { Customer } from '@/lib/customers-api';
import InvoicePreviewModal from '@/components/InvoicePreviewModal';

// ── Line item row ─────────────────────────────────────────────────────────────

interface LineItem {
  _key: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: number;
}

function newLine(sort = 0): LineItem {
  return { _key: `${Date.now()}-${sort}`, description: '', quantity: '1', unit: '', rate: '0', amount: 0 };
}

function calcAmount(qty: string, rate: string): number {
  return Math.round((parseFloat(qty) || 0) * (parseFloat(rate) || 0) * 100) / 100;
}

function LineRow({
  line, idx, total: lineCount,
  onChange, onDelete, onMoveUp, onMoveDown, onCopy,
  seeDollars,
}: {
  line: LineItem; idx: number; total: number;
  onChange: (key: string, field: keyof LineItem, val: string) => void;
  onDelete: (key: string) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
  onCopy: (key: string) => void;
  seeDollars: boolean;
}) {
  const inp = 'px-2.5 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white w-full';

  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0 group">
      {/* Drag handle / order */}
      <div className="flex flex-col gap-0.5 pt-2.5 shrink-0">
        <button type="button" onClick={() => onMoveUp(line._key)} disabled={idx === 0} className="p-0.5 rounded text-slate-300 hover:text-slate-500 disabled:opacity-20 transition-colors"><ChevronUp size={12} /></button>
        <button type="button" onClick={() => onMoveDown(line._key)} disabled={idx === lineCount - 1} className="p-0.5 rounded text-slate-300 hover:text-slate-500 disabled:opacity-20 transition-colors"><ChevronDown size={12} /></button>
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <textarea
          value={line.description}
          onChange={(e) => onChange(line._key, 'description', e.target.value)}
          placeholder="Description of work or materials…"
          rows={2}
          className={`${inp} resize-none`}
        />
      </div>

      {/* Qty */}
      <div className="w-16 shrink-0">
        <input
          type="number" min="0" step="any"
          value={line.quantity}
          onChange={(e) => onChange(line._key, 'quantity', e.target.value)}
          className={inp}
          placeholder="1"
        />
      </div>

      {/* Unit */}
      <div className="w-20 shrink-0">
        <input
          value={line.unit}
          onChange={(e) => onChange(line._key, 'unit', e.target.value)}
          className={inp}
          placeholder="ea"
        />
      </div>

      {/* Rate */}
      {seeDollars && (
        <div className="w-24 shrink-0">
          <input
            type="number" min="0" step="0.01"
            value={line.rate}
            onChange={(e) => onChange(line._key, 'rate', e.target.value)}
            className={inp}
            placeholder="0.00"
          />
        </div>
      )}

      {/* Amount */}
      {seeDollars && (
        <div className="w-24 shrink-0 pt-2 text-right">
          <span className="text-sm font-semibold text-foreground">{fmtMoney(line.amount)}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-0.5 pt-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={() => onCopy(line._key)} title="Copy line" className="p-1 rounded text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"><Copy size={12} /></button>
        <button type="button" onClick={() => onDelete(line._key)} title="Delete line" className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

// ── Record payment modal ──────────────────────────────────────────────────────

function RecordPaymentModal({
  invoiceId, balanceDue, onClose, onSaved,
}: { invoiceId: number; balanceDue: number; onClose: () => void; onSaved: (inv: Invoice) => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ payment_date: today, amount: String(balanceDue), method: '', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inp = 'w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Amount must be greater than 0'); return; }
    setSaving(true); setError('');
    try {
      const inv = await recordPayment(invoiceId, {
        payment_date: form.payment_date,
        amount: parseFloat(form.amount),
        method: form.method || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      onSaved(inv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-50 rounded-md"><CreditCard size={15} className="text-emerald-600" /></div>
            <h2 className="font-heading font-bold text-sm">Record Payment</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Amount <span className="text-red-500">*</span></label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Method</label>
              <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} className={inp}>
                <option value="">Select…</option>
                {['Bank Transfer', 'Cash', 'Cheque', 'Credit Card', 'EFTPOS', 'Other'].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Reference</label>
              <input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="e.g. BSB/Acc or receipt #" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Notes</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className={inp} />
          </div>
          {error && <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm"><AlertCircle size={13} className="shrink-0" />{error}</div>}
          <div className="flex gap-3 pt-1 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Record Payment
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

export default function InvoiceBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { can, isAdmin, isOwner, loading: permLoading, me } = usePermissions();
  const canInvoices = !permLoading && (isAdmin || isOwner || can('invoices'));
  const seeDollars = !permLoading && (isAdmin || isOwner || can('seeDollars'));

  const isNew = id === 'new';
  const jobIdFromQuery = searchParams.get('jobId') ? Number(searchParams.get('jobId')) : null;
  const fromEstimateId = searchParams.get('fromEstimate') ? Number(searchParams.get('fromEstimate')) : null;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [xeroSyncing, setXeroSyncing] = useState(false);
  const [xeroMsg, setXeroMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Form state
  const today = new Date().toISOString().split('T')[0];
  const [title, setTitle] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Payment due within 14 days of invoice date.');
  const [lines, setLines] = useState<LineItem[]>([newLine(0)]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [jobId, setJobId] = useState<number | null>(jobIdFromQuery);
  const [jobs, setJobs] = useState<Array<{ id: number; name: string; job_number: string | null }>>([]);

  // Totals
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;
  const amountPaid = invoice ? parseFloat(invoice.amount_paid ?? '0') : 0;
  const balanceDue = Math.round((total - amountPaid) * 100) / 100;

  // Load jobs for selector
  useEffect(() => {
    fetch('/api/jobs', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => {});
  }, []);

  // Load existing invoice
  useEffect(() => {
    if (isNew) {
      setLoading(false);
      // If coming from estimate, load estimate lines
      if (fromEstimateId) {
        fetch(`/api/estimates/${fromEstimateId}`, { credentials: 'include' })
          .then((r) => r.json())
          .then((d) => {
            const est = d.estimate;
            if (!est) return;
            setTitle(est.title ?? '');
            setJobId(est.job_id ?? null);
            const estLines: LineItem[] = (d.lines ?? []).map((l: Record<string, string>, i: number) => ({
              _key: `est-${i}`,
              description: l.description ?? '',
              quantity: l.quantity ?? '1',
              unit: l.unit ?? '',
              rate: l.rate ?? '0',
              amount: calcAmount(l.quantity ?? '1', l.rate ?? '0'),
            }));
            if (estLines.length > 0) setLines(estLines);
          })
          .catch(() => {});
      }
      return;
    }
    setLoading(true);
    fetchInvoice(Number(id))
      .then((inv) => {
        setInvoice(inv);
        setTitle(inv.title);
        setInvoiceNumber(inv.invoice_number);
        setStatus(inv.status);
        setIssueDate(inv.issue_date?.split('T')[0] ?? today);
        setDueDate(inv.due_date?.split('T')[0] ?? '');
        setNotes(inv.notes ?? '');
        setTerms(inv.terms ?? '');
        setJobId(inv.job_id);
        if (inv.customer_id) {
          setSelectedCustomer({
            id: inv.customer_id,
            name: inv.customer_name ?? '',
          } as Customer);
        }
        const invLines: LineItem[] = (inv.lines ?? []).map((l) => ({
          _key: `${l.id}`,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit ?? '',
          rate: l.rate,
          amount: parseFloat(l.amount) || 0,
        }));
        setLines(invLines.length > 0 ? invLines : [newLine(0)]);
        setDirty(false);
      })
      .catch(() => setError('Invoice not found or failed to load.'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function markDirty() { setDirty(true); setSaveError(''); }

  function updateLine(key: string, field: keyof LineItem, val: string) {
    setLines((prev) => prev.map((l) => {
      if (l._key !== key) return l;
      const updated = { ...l, [field]: val };
      if (field === 'quantity' || field === 'rate') {
        updated.amount = calcAmount(
          field === 'quantity' ? val : l.quantity,
          field === 'rate' ? val : l.rate,
        );
      }
      return updated;
    }));
    markDirty();
  }

  function addLine() {
    setLines((prev) => [...prev, newLine(prev.length)]);
    markDirty();
  }

  function deleteLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
    markDirty();
  }

  function copyLine(key: string) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._key === key);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], _key: `${Date.now()}` };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    markDirty();
  }

  function moveLine(key: string, dir: 'up' | 'down') {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
    markDirty();
  }

  function buildPayload() {
    return {
      job_id: jobId,
      customer_id: selectedCustomer?.id ?? null,
      invoice_number: invoiceNumber || undefined,
      title,
      status,
      issue_date: issueDate || null,
      due_date: dueDate || null,
      notes: notes || null,
      terms: terms || null,
      lines: lines.map((l, i) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit || null,
        rate: l.rate,
        sort_order: i,
      })),
    };
  }

  async function handleXeroSync() {
    if (!invoice) return;
    // Save first if dirty
    if (dirty) await handleSave(false);
    setXeroSyncing(true); setXeroMsg(null);
    try {
      const res = await fetch(`/api/integrations/xero/sync-invoice/${invoice.id}`, {
        method: 'POST', credentials: 'include',
      });
      const d = await res.json() as { ok?: boolean; message?: string; error?: string; xeroInvoiceId?: string };
      if (!res.ok) {
        setXeroMsg({ type: 'error', text: d.error ?? 'Xero sync failed' });
      } else {
        setXeroMsg({ type: 'ok', text: d.message ?? 'Synced to Xero' });
        // Refresh invoice to get updated accounting fields
        const updated = await fetch(`/api/invoices/${invoice.id}`, { credentials: 'include' });
        if (updated.ok) {
          const ud = await updated.json() as { invoice: Invoice };
          setInvoice(ud.invoice);
        }
      }
    } catch {
      setXeroMsg({ type: 'error', text: 'Network error syncing to Xero' });
    } finally {
      setXeroSyncing(false);
    }
  }

  async function handleSave(andNavigate = false) {
    if (!title.trim()) { setSaveError('Invoice title is required'); return; }
    setSaving(true); setSaveError('');
    try {
      const payload = buildPayload();
      let saved: Invoice;
      if (isNew) {
        saved = await createInvoice(payload);
      } else {
        saved = await updateInvoice(Number(id), payload);
      }
      setInvoice(saved);
      setInvoiceNumber(saved.invoice_number);
      setStatus(saved.status);
      setDirty(false);
      if (andNavigate || isNew) navigate(`/invoices/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  function handleMarkSent() {
    if (!invoice) return;
    setConfirmDialog({
      title: 'Mark as Sent?',
      message: 'This will update the invoice status to Sent and notify your records.',
      danger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        setSaving(true);
        try {
          const updated = await markInvoiceSent(invoice.id);
          setInvoice(updated); setStatus(updated.status);
        } catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed'); }
        finally { setSaving(false); }
      },
    });
  }

  async function handleDuplicate() {
    if (!invoice) return;
    setSaving(true);
    try {
      const dup = await duplicateInvoice(invoice.id);
      navigate(`/invoices/${dup.id}`);
    } catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  function handleVoid() {
    if (!invoice) return;
    setConfirmDialog({
      title: 'Void this invoice?',
      message: 'This cannot be undone. The invoice will be permanently marked as void.',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        setSaving(true);
        try {
          const updated = await voidInvoice(invoice.id);
          setInvoice(updated); setStatus(updated.status);
        } catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed'); }
        finally { setSaving(false); }
      },
    });
  }

  function handleRecall() {
    if (!invoice) return;
    setConfirmDialog({
      title: 'Recall to Draft?',
      message: 'This will return the invoice to draft status and unlock the source estimate so it can be adjusted and re-converted.',
      danger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        setSaving(true);
        setSaveError('');
        try {
          const res = await fetch(`/api/invoices/${invoice.id}/unlock`, {
            method: 'PATCH',
            credentials: 'include',
          });
          const data = await res.json() as { invoice?: Record<string, unknown>; estimate_unlocked?: boolean; error?: string };
          if (!res.ok) throw new Error(data.error ?? 'Failed to recall invoice');
          const refreshed = await fetchInvoice(invoice.id);
          setInvoice(refreshed);
          setStatus(refreshed.status);
          setLines((refreshed.lines ?? []).map((l: InvoiceLine, i: number) => ({
            _key: `${Date.now()}-${i}`,
            description: l.description ?? '',
            quantity: String(l.quantity ?? '1'),
            unit: String(l.unit ?? ''),
            rate: String(l.rate ?? '0'),
            amount: parseFloat(String(l.amount ?? '0')),
          })));
          setDirty(false);
        } catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed to recall'); }
        finally { setSaving(false); }
      },
    });
  }

  function handleDelete() {
    if (!invoice) return;
    setConfirmDialog({
      title: 'Delete this invoice?',
      message: 'This will permanently remove the invoice and all its lines. This cannot be undone.',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        setSaving(true);
        try {
          await deleteInvoice(invoice.id);
          navigate('/invoices');
        } catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed'); }
        finally { setSaving(false); }
      },
    });
  }

  async function handleExportPdf() {
    // Kept for legacy callers — opens the preview modal instead
    setShowPrintModal(true);
  }

  const s = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  const isVoid = status === 'void';
  const isPaid = status === 'paid';
  const isSent = status === 'sent';
  const isDraft = status === 'draft';
  const canEdit = !isVoid && !isSent;
  const sourceEstimateId = (invoice as (typeof invoice & { source_estimate_id?: number }) | null)?.source_estimate_id;

  const inp = 'w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white disabled:bg-slate-50 disabled:text-muted-foreground';
  const lbl = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';



  if (!permLoading && !canInvoices) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">No invoice permission.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{isNew ? 'New Invoice' : `Invoice ${invoiceNumber}`} — IWILLBUILD Portal</title>
        <meta name="description" content={isNew ? 'Create a new invoice.' : `Edit invoice ${invoiceNumber}.`} />
        <link rel="canonical" href={`https://iwillbuild.com/invoices/${isNew ? 'new' : id}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Standalone top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Home</span>
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => navigate('/invoices')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Invoices
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-sm font-semibold text-gray-800 truncate">
          {isNew ? 'New Invoice' : invoiceNumber ? `Invoice ${invoiceNumber}` : 'Invoice'}
        </span>
      </div>

      <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            <AlertCircle size={16} className="shrink-0" />{error}
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-5">

            {/* Sent banner */}
            {!isNew && isSent && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <Lock size={15} className="text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-800">Invoice sent — locked for editing</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {(invoice as (typeof invoice & { sent_at?: string }) | null)?.sent_at
                      ? `Sent on ${new Date((invoice as (typeof invoice & { sent_at?: string }))!.sent_at!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : 'Sent to client'}
                    {sourceEstimateId ? ' · Linked to estimate' : ''}
                  </p>
                </div>
                <button
                  onClick={handleRecall}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                >
                  <RotateCcw size={12} />Recall to Draft
                </button>
              </div>
            )}
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-50 rounded-lg"><Receipt size={18} className="text-primary" /></div>
                  <div>
                    <h1 className="font-heading font-black text-lg text-foreground">
                      {isNew ? 'New Invoice' : invoiceNumber}
                    </h1>
                    {!isNew && (
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border} mt-0.5`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {!isNew && canEdit && (
                    <button onClick={() => setShowPrintModal(true)} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                      <FileText size={13} />Preview / PDF
                    </button>
                  )}
                  {/* Send via Email */}
                  {!isNew && invoice && (
                    <button
                      onClick={() => setShowEmailModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Mail size={13} />
                      <span className="hidden sm:inline">Send Email</span>
                      <span className="sm:hidden">Email</span>
                    </button>
                  )}
                  {!isNew && (
                    <button
                      onClick={() => setShowShare(true)}
                      className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      title="Share link"
                    >
                      <Share2 size={13} />
                      Share
                    </button>
                  )}
                  {!isNew && canEdit && status === 'draft' && (
                    <button onClick={handleMarkSent} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50">
                      <Send size={13} />Send Invoice
                    </button>
                  )}
                  {/* Recall button — only on sent invoices */}
                  {!isNew && isSent && (
                    <button
                      onClick={handleRecall}
                      disabled={saving}
                      title="Recall to draft — unlocks source estimate for adjustment"
                      className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 bg-amber-50 rounded-lg text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={13} />Recall to Draft
                    </button>
                  )}
                  {!isNew && canEdit && !isPaid && !isVoid && (
                    <button onClick={() => setShowPaymentModal(true)} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50">
                      <DollarSign size={13} />Record Payment
                    </button>
                  )}
                  {/* Xero sync button */}
                  {!isNew && canEdit && (
                    <button
                      onClick={handleXeroSync}
                      disabled={xeroSyncing || saving}
                      title={invoice?.accounting_invoice_id ? `Synced to Xero (${invoice.accounting_invoice_id})` : 'Push to Xero'}
                      className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                        invoice?.accounting_sync_status === 'synced'
                          ? 'border-[#13B5EA]/30 bg-[#13B5EA]/5 text-[#0fa0d4] hover:bg-[#13B5EA]/10'
                          : invoice?.accounting_sync_status === 'error'
                          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {xeroSyncing ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : invoice?.accounting_sync_status === 'synced' ? (
                        <CheckCircle2 size={13} />
                      ) : invoice?.accounting_sync_status === 'error' ? (
                        <XCircle size={13} />
                      ) : (
                        <span className="font-black text-xs">X</span>
                      )}
                      {invoice?.accounting_invoice_id ? 'Re-sync Xero' : 'Sync to Xero'}
                    </button>
                  )}
                  {!isNew && (
                    <button onClick={handleDuplicate} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
                      <Copy size={13} />Duplicate
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleSave(false)}
                      disabled={saving || !dirty}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      {isNew ? 'Create' : 'Save'}
                    </button>
                  )}
                </div>
              </div>

              {saveError && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-4">
                  <AlertCircle size={13} className="shrink-0" />{saveError}
                </div>
              )}

              {xeroMsg && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm mb-4 ${
                  xeroMsg.type === 'ok'
                    ? 'bg-[#13B5EA]/10 border border-[#13B5EA]/30 text-[#0a7fa0]'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {xeroMsg.type === 'ok' ? <CheckCircle2 size={13} className="shrink-0" /> : <AlertCircle size={13} className="shrink-0" />}
                  {xeroMsg.text}
                  <button onClick={() => setXeroMsg(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={12} /></button>
                </div>
              )}

              {/* Header fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={lbl}>Invoice Title <span className="text-red-500">*</span></label>
                  <input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} disabled={!canEdit} placeholder="e.g. Progress Claim #1 — Bathroom Renovation" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Invoice Number</label>
                  <input value={invoiceNumber} onChange={(e) => { setInvoiceNumber(e.target.value); markDirty(); }} disabled={!canEdit} placeholder="Auto-generated" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Status</label>
                  <select value={status} onChange={(e) => { setStatus(e.target.value as InvoiceStatus); markDirty(); }} disabled={!canEdit} className={inp}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Issue Date</label>
                  <input type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); markDirty(); }} disabled={!canEdit} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Due Date</label>
                  <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); markDirty(); }} disabled={!canEdit} className={inp} />
                </div>
              </div>
            </div>

            {/* Job + Customer */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">Job &amp; Customer</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Linked Job</label>
                  <select
                    value={jobId ?? ''}
                    onChange={(e) => { setJobId(e.target.value ? Number(e.target.value) : null); markDirty(); }}
                    disabled={!canEdit}
                    className={inp}
                  >
                    <option value="">No job linked</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.job_number ? `${j.job_number} — ` : ''}{j.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Customer</label>
                  <CustomerSelector
                    value={selectedCustomer}
                    onChange={(c) => { setSelectedCustomer(c); markDirty(); }}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">Line Items</h2>

              {/* Column headers */}
              <div className="hidden sm:flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                <div className="w-8 shrink-0" />
                <div className="flex-1">Description</div>
                <div className="w-16 shrink-0 text-center">Qty</div>
                <div className="w-20 shrink-0 text-center">Unit</div>
                {seeDollars && <div className="w-24 shrink-0 text-right">Rate</div>}
                {seeDollars && <div className="w-24 shrink-0 text-right">Amount</div>}
                <div className="w-12 shrink-0" />
              </div>

              <div className="flex flex-col">
                {lines.map((line, idx) => (
                  <LineRow
                    key={line._key}
                    line={line}
                    idx={idx}
                    total={lines.length}
                    onChange={updateLine}
                    onDelete={deleteLine}
                    onMoveUp={(k) => moveLine(k, 'up')}
                    onMoveDown={(k) => moveLine(k, 'down')}
                    onCopy={copyLine}
                    seeDollars={seeDollars}
                  />
                ))}
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={addLine}
                  className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary hover:text-orange-600 transition-colors"
                >
                  <Plus size={14} />Add Line
                </button>
              )}

              {/* Totals */}
              {seeDollars && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-8 text-sm">
                    <span className="text-muted-foreground font-medium">Subtotal</span>
                    <span className="font-semibold text-foreground w-28 text-right">{fmtMoney(subtotal)}</span>
                  </div>
                  <div className="flex items-center gap-8 text-sm">
                    <span className="text-muted-foreground font-medium">GST (10%)</span>
                    <span className="font-semibold text-foreground w-28 text-right">{fmtMoney(gst)}</span>
                  </div>
                  <div className="flex items-center gap-8 text-base border-t border-slate-200 pt-2 mt-1">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-black text-foreground w-28 text-right">{fmtMoney(total)}</span>
                  </div>
                  {amountPaid > 0 && (
                    <>
                      <div className="flex items-center gap-8 text-sm text-emerald-700">
                        <span className="font-medium">Paid</span>
                        <span className="font-semibold w-28 text-right">−{fmtMoney(amountPaid)}</span>
                      </div>
                      <div className="flex items-center gap-8 text-base">
                        <span className="font-bold text-foreground">Balance Due</span>
                        <span className={`font-black w-28 text-right ${balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtMoney(balanceDue)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Notes + Terms */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">Notes &amp; Terms</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <label className={lbl}>Notes <span className="text-muted-foreground font-normal normal-case">(internal — not shown on customer PDF unless selected)</span></label>
                  <textarea value={notes} onChange={(e) => { setNotes(e.target.value); markDirty(); }} disabled={!canEdit} rows={3} placeholder="Internal notes about this invoice…" className={`${inp} resize-y`} />
                </div>
                <div>
                  <label className={lbl}>Payment Terms</label>
                  <textarea value={terms} onChange={(e) => { setTerms(e.target.value); markDirty(); }} disabled={!canEdit} rows={2} placeholder="e.g. Payment due within 14 days of invoice date." className={`${inp} resize-y`} />
                </div>
              </div>
            </div>

            {/* Payment history */}
            {!isNew && invoice?.payments && invoice.payments.length > 0 && seeDollars && (
              <div className="bg-white border border-border rounded-xl p-5">
                <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">Payment History</h2>
                <div className="flex flex-col gap-2">
                  {invoice.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0">
                      <div>
                        <span className="font-semibold text-foreground">{new Date(p.payment_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {p.method && <span className="text-muted-foreground ml-2">· {p.method}</span>}
                        {p.reference && <span className="text-muted-foreground ml-2">· {p.reference}</span>}
                      </div>
                      <span className="font-bold text-emerald-700">{fmtMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Danger zone */}
            {!isNew && (
              <div className="bg-white border border-red-100 rounded-xl p-5">
                <h2 className="font-heading font-bold text-sm text-red-500 uppercase tracking-wider mb-3">Danger Zone</h2>
                <div className="flex flex-wrap gap-3">
                  {!isVoid && (
                    <button onClick={handleVoid} disabled={saving} className="flex items-center gap-2 px-4 py-2 border border-amber-200 bg-amber-50 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50">
                      <Ban size={14} />Void Invoice
                    </button>
                  )}
                  {(status === 'draft' || status === 'void') && (
                    <button onClick={handleDelete} disabled={saving} className="flex items-center gap-2 px-4 py-2 border border-red-200 bg-red-50 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-50">
                      <Trash2 size={14} />Delete Invoice
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Accounting integrations */}
            {!isNew && (
              <div className="bg-white border border-border rounded-xl p-5">
                <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider mb-3">Accounting Integration</h2>
                {invoice?.accounting_provider === 'xero' && invoice?.accounting_invoice_id ? (
                  <div className="flex items-center gap-3 p-3 bg-[#13B5EA]/5 border border-[#13B5EA]/20 rounded-lg">
                    <div className="w-8 h-8 rounded-lg bg-[#13B5EA]/10 flex items-center justify-center shrink-0">
                      <span className="text-[#13B5EA] font-black text-sm">X</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Synced to Xero</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">ID: {invoice.accounting_invoice_id}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full border ${
                      invoice.accounting_sync_status === 'synced'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : invoice.accounting_sync_status === 'error'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {invoice.accounting_sync_status === 'synced' ? 'Synced' : invoice.accounting_sync_status === 'error' ? 'Error' : invoice.accounting_sync_status ?? 'Unknown'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                      <Building2 size={14} className="text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">Not synced</p>
                      <p className="text-xs text-muted-foreground">Use the "Sync to Xero" button above, or connect Xero in Settings → Accounting.</p>
                    </div>
                  </div>
                )}
                {invoice?.accounting_sync_error && (
                  <div className="mt-2 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" />
                    <span className="break-all">{invoice.accounting_sync_error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showPaymentModal && invoice && (
          <RecordPaymentModal
            invoiceId={invoice.id}
            balanceDue={balanceDue}
            onClose={() => setShowPaymentModal(false)}
            onSaved={(updated) => {
              setInvoice(updated);
              setStatus(updated.status);
              setShowPaymentModal(false);
            }}
          />
        )}
        {showPrintModal && invoice && (
          <InvoicePreviewModal
            invoice={{ ...invoice, lines: lines.map((l, i) => ({ id: i, invoice_id: invoice.id, description: l.description, quantity: l.quantity, unit: l.unit || null, rate: l.rate, amount: String(l.amount), sort_order: i })), subtotal: String(subtotal), gst_amount: String(gst), total: String(total) }}
            onClose={() => setShowPrintModal(false)}
          />
        )}
      </AnimatePresence>
      {showEmailModal && invoice && (
        <SendInvoiceEmailModal
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoice_number ?? `#${invoice.id}`}
          defaultEmail={''}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showShare && invoice && (
        <ShareLinkModal
          open={showShare}
          onClose={() => setShowShare(false)}
          targetType="invoice"
          targetId={String(invoice.id)}
          title={invoice.title ?? `Invoice #${invoice.invoiceNumber ?? invoice.id}`}
        />
      )}
      <JobContextTab />

      {/* ── Custom confirm dialog ─────────────────────────────────────── */}
      <AnimatePresence>
        {confirmDialog && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDialog(null)} />
            <motion.div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              {/* Icon */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${confirmDialog.danger ? 'bg-red-100' : 'bg-amber-100'}`}>
                <AlertTriangle size={24} className={confirmDialog.danger ? 'text-red-600' : 'text-amber-600'} />
              </div>
              {/* Title */}
              <h2 className={`text-center text-xl font-bold ${confirmDialog.danger ? 'text-red-700' : 'text-gray-900'}`}>
                {confirmDialog.title}
              </h2>
              {/* Message */}
              <p className="text-center text-sm text-gray-600 leading-relaxed">
                {confirmDialog.message}
              </p>
              {/* Buttons */}
              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-colors ${
                    confirmDialog.danger
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-orange-500 hover:bg-orange-600'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
