/**
 * JobInvoices — Invoices tab inside Job detail.
 * Shows summary stats, invoice list, and actions to create new or from estimate.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from "react-router";
import { Receipt, Plus, Loader2, AlertCircle, ChevronRight, FileText, Send, Clock, CheckCircle2, AlertTriangle, XCircle, DollarSign, Lock, ExternalLink } from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import { fetchInvoices, fmtMoney, STATUS_LABELS, STATUS_COLORS, type Invoice, type InvoiceStatus } from '@/lib/invoices-api';
import type { Job } from '@/lib/jobs-api';
const STATUS_ICONS: Record<string, React.ElementType> = {
  draft: FileText,
  sent: Send,
  partially_paid: Clock,
  paid: CheckCircle2,
  overdue: AlertTriangle,
  void: XCircle
};
interface Props {
  jobId: number;
  job: Job;
}
export default function JobInvoices({
  jobId,
  job
}: Props) {
  const navigate = useNavigate();
  const {
    can,
    isAdmin,
    isOwner,
    loading: permLoading
  } = usePermissions();
  const canInvoices = !permLoading && (isAdmin || isOwner || can('invoices'));
  const seeDollars = !permLoading && (isAdmin || isOwner || can('seeDollars'));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!canInvoices) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    fetchInvoices({
      jobId
    }).then(setInvoices).catch(() => setError('Failed to load invoices.')).finally(() => setLoading(false));
  }, [jobId, canInvoices]);
  useEffect(() => {
    if (!permLoading) load();
  }, [permLoading, load]);

  // Summary
  const totalInvoiced = invoices.reduce((s, i) => s + parseFloat(i.total ?? '0'), 0);
  const totalPaid = invoices.reduce((s, i) => s + parseFloat(i.amount_paid ?? '0'), 0);
  const balanceDue = invoices.reduce((s, i) => s + parseFloat(i.balance_due ?? '0'), 0);
  const draftCount = invoices.filter(i => i.status === 'draft').length;
  const sentCount = invoices.filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status)).length;
  const paidCount = invoices.filter(i => i.status === 'paid').length;
  if (!permLoading && !canInvoices) {
    return <div className="bg-white border border-border rounded-xl p-8 text-center">
        <Receipt size={28} className="text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">You don't have permission to view invoices.</p>
      </div>;
  }
  return <div className="flex flex-col gap-4">
      {/* Summary + actions header */}
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Invoices</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/invoices/new?jobId=${jobId}`)} className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-violet-700 text-white rounded-lg text-xs font-bold transition-colors">
              <Plus size={12} />New Invoice
            </button>
          </div>
        </div>

        {/* Hint — convert from estimate */}
        {invoices.length === 0 && <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 mb-3">
            <FileText size={13} className="text-blue-600 shrink-0" />
            <p className="text-xs text-blue-700">
              To convert an approved estimate to an invoice, go to the <strong>Estimates</strong> tab and tap <strong>Invoice</strong> on any approved estimate.
            </p>
          </div>}

        {/* Stats */}
        {seeDollars && invoices.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[{
          label: 'Total Invoiced',
          value: fmtMoney(totalInvoiced),
          color: 'text-slate-700'
        }, {
          label: 'Paid',
          value: fmtMoney(totalPaid),
          color: 'text-emerald-600'
        }, {
          label: 'Balance Due',
          value: fmtMoney(balanceDue),
          color: balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'
        }, {
          label: 'Invoices',
          value: `${invoices.length} total`,
          color: 'text-slate-700'
        }].map(s => <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>)}
          </div>}

        {!seeDollars && invoices.length > 0 && <div className="flex gap-3 flex-wrap">
            {[{
          label: 'Draft',
          count: draftCount,
          color: 'text-slate-600'
        }, {
          label: 'Sent / Unpaid',
          count: sentCount,
          color: 'text-blue-600'
        }, {
          label: 'Paid',
          count: paidCount,
          color: 'text-emerald-600'
        }].map(s => <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center">
                <p className={`text-lg font-black ${s.color}`}>{s.count}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>)}
          </div>}
      </div>

      {/* Invoice list */}
      {loading && <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>}

      {error && <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />{error}
          <button onClick={load} className="ml-auto font-semibold underline">Retry</button>
        </div>}

      {!loading && !error && invoices.length === 0 && <div className="bg-white border border-border rounded-xl p-8 text-center">
          <Receipt size={28} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No invoices yet</p>
          <p className="text-xs text-muted-foreground mb-4">Create an invoice from scratch or from an approved estimate.</p>
          <button onClick={() => navigate(`/invoices/new?jobId=${jobId}`)} className="inline-flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={13} />New Invoice
          </button>
        </div>}

      {!loading && invoices.length > 0 && <div className="flex flex-col gap-2">
          {invoices.map(inv => {
        const s = STATUS_COLORS[inv.status as InvoiceStatus] ?? STATUS_COLORS.draft;
        const StatusIcon = STATUS_ICONS[inv.status] ?? FileText;
        const fromEstimate = !!(inv as Invoice & {
          source_estimate_id?: number;
        }).source_estimate_id;
        return <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all group">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.bg} ${s.border} border`}>
                  <StatusIcon size={14} className={s.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{inv.invoice_number}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {STATUS_LABELS[inv.status as InvoiceStatus] ?? inv.status}
                    </span>
                    {fromEstimate && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                        <Lock size={8} />From estimate
                      </span>}
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{inv.title}</p>
                  {inv.due_date && <p className="text-xs text-muted-foreground mt-0.5">
                      Due {new Date(inv.due_date).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
                    </p>}
                </div>
                {seeDollars && <div className="text-right shrink-0">
                    <p className="text-sm font-black text-foreground">{fmtMoney(inv.total)}</p>
                    {parseFloat(inv.balance_due) > 0 && inv.status !== 'paid' && <p className="text-[10px] text-amber-600 font-semibold">Bal {fmtMoney(inv.balance_due)}</p>}
                  </div>}
                <button onClick={e => {
            e.preventDefault();
            window.open(`/view/invoice/${inv.id}`, '_blank', 'noopener,noreferrer');
          }} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-violet-50 transition-colors shrink-0 opacity-0 group-hover:opacity-100" title="Open in new tab">
                  <ExternalLink size={13} />
                </button>
                <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </Link>;
      })}
        </div>}
    </div>;
}
