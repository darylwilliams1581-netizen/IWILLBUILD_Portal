import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Receipt, Plus, Search, Loader2, AlertCircle, Filter,
  ChevronRight, Calendar, Building2, FileText, DollarSign,
  Clock, CheckCircle2, XCircle, Send, AlertTriangle,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PortalSidebar, { MobileMenuButton } from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';
import {
  fetchInvoices, fmtMoney, STATUS_LABELS, STATUS_COLORS,
  type Invoice, type InvoiceStatus,
} from '@/lib/invoices-api';

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'partially_paid', label: 'Part Paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
];

const STATUS_ICONS: Record<string, React.ElementType> = {
  draft: FileText,
  sent: Send,
  partially_paid: Clock,
  paid: CheckCircle2,
  overdue: AlertTriangle,
  void: XCircle,
};

function InvoiceRow({ invoice, seeDollars }: { invoice: Invoice; seeDollars: boolean }) {
  const s = STATUS_COLORS[invoice.status as InvoiceStatus] ?? STATUS_COLORS.draft;
  const StatusIcon = STATUS_ICONS[invoice.status] ?? FileText;

  return (
    <Link
      to={`/invoices/${invoice.id}`}
      className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3.5 hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.bg} ${s.border} border`}>
        <StatusIcon size={14} className={s.text} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-xs font-mono text-muted-foreground">{invoice.invoice_number}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {STATUS_LABELS[invoice.status as InvoiceStatus] ?? invoice.status}
          </span>
        </div>
        <p className="text-sm font-semibold text-foreground truncate">{invoice.title}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
          {invoice.job_name && (
            <span className="flex items-center gap-1 truncate"><Building2 size={10} />{invoice.job_name}</span>
          )}
          {invoice.customer_name && (
            <span className="flex items-center gap-1 truncate"><FileText size={10} />{invoice.customer_name}</span>
          )}
          {invoice.due_date && (
            <span className="flex items-center gap-1 shrink-0">
              <Calendar size={10} />Due {new Date(invoice.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      {seeDollars && (
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-foreground">{fmtMoney(invoice.total)}</p>
          {parseFloat(invoice.balance_due) > 0 && parseFloat(invoice.balance_due) < parseFloat(invoice.total) && (
            <p className="text-[10px] text-amber-600 font-semibold">Bal {fmtMoney(invoice.balance_due)}</p>
          )}
          {parseFloat(invoice.balance_due) <= 0 && invoice.status === 'paid' && (
            <p className="text-[10px] text-emerald-600 font-semibold">Paid in full</p>
          )}
        </div>
      )}
      <ChevronRight size={15} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </Link>
  );
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { can, isAdmin, isOwner, loading: permLoading } = usePermissions();
  const canInvoices = !permLoading && (isAdmin || isOwner || can('invoices'));
  const seeDollars = !permLoading && (isAdmin || isOwner || can('seeDollars'));

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true); setError('');
    fetchInvoices()
      .then(setInvoices)
      .catch(() => setError('Failed to load invoices.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!permLoading && canInvoices) load(); }, [permLoading, canInvoices, load]);

  const filtered = invoices.filter((inv) => {
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.title.toLowerCase().includes(q) ||
      (inv.job_name ?? '').toLowerCase().includes(q) ||
      (inv.customer_name ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // Summary stats
  const unpaid = invoices.filter((i) => ['sent', 'partially_paid', 'overdue'].includes(i.status));
  const overdue = invoices.filter((i) => i.status === 'overdue');
  const totalUnpaid = unpaid.reduce((s, i) => s + parseFloat(i.balance_due ?? '0'), 0);

  function openMobileMenu() { window.dispatchEvent(new Event('portal:open-menu')); }

  if (!permLoading && !canInvoices) {
    return (
      <div className="portal-page">
        <PortalSidebar />
        <div className="portal-content flex items-center justify-center py-20">
          <div className="text-center">
            <Receipt size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="font-bold text-foreground mb-1">No Invoice Access</p>
            <p className="text-sm text-muted-foreground">You don't have permission to view invoices.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>Invoices — IWILLBUILD Portal</title>
        <meta name="description" content="Create, manage and track invoices linked to jobs. Export to Xero and QuickBooks." />
        <link rel="canonical" href="https://iwillbuild.com/invoices" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Invoices — IWILLBUILD Portal" />
        <meta property="og:description" content="Create, manage and track invoices linked to jobs. Export to Xero and QuickBooks." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/invoices" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Invoices — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Create, manage and track invoices linked to jobs. Export to Xero and QuickBooks." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-content">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={openMobileMenu} />
            <div>
              <h1 className="font-heading font-black text-xl text-foreground">Ledger</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{invoices.length} total</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/invoices/new')}
            className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New Invoice</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>

        {/* Summary cards (seeDollars only) */}
        {seeDollars && !loading && invoices.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Unpaid', value: fmtMoney(totalUnpaid), count: unpaid.length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'Overdue', value: overdue.length, count: null, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
              { label: 'Total Invoices', value: invoices.length, count: null, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
                <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoices, jobs, customers…"
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                  statusFilter === f.key
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground border-border hover:border-primary hover:text-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            <AlertCircle size={16} className="shrink-0" />{error}
            <button onClick={load} className="ml-auto font-semibold underline">Retry</button>
          </div>
        )}

        {!loading && !error && invoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
              <Receipt size={26} className="text-primary" />
            </div>
            <p className="font-heading font-bold text-base text-foreground mb-1">No invoices yet</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Create your first invoice from scratch or from an approved estimate on a job.
            </p>
            <button
              onClick={() => navigate('/invoices/new')}
              className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors"
            >
              <Plus size={15} />New Invoice
            </button>
          </div>
        )}

        {!loading && invoices.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No invoices match your search or filter.</div>
        )}

        {!loading && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-2"
          >
            {filtered.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} seeDollars={seeDollars} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
