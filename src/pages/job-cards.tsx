/**
 * /job-cards — Desktop Job Cards register
 *
 * Office-first: compact rows, status badges, quick filters, create modal.
 * Reuses the PortalSidebar layout pattern (same as /jobs, /invoices, etc.)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import PortalSidebar from '@/components/PortalSidebar';
import {
  Zap, Plus, Search, X, ChevronRight, RefreshCw,
  CheckCircle2, Clock, AlertCircle, Receipt,
  ArrowRightLeft, Camera,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';

// ── Types ─────────────────────────────────────────────────────────────────────
interface JobCard {
  id: number;
  card_number: string;
  status: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_name_override: string | null;
  site_address: string | null;
  service_date: string | null;
  assigned_name: string | null;
  work_description: string;
  labour_amount: number | null;
  materials_total: number | null;
  photo_count: number;
  invoice_id: number | null;
  converted_job_id: number | null;
  created_at: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600',    icon: Clock },
  complete:  { label: 'Complete',  cls: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  invoiced:  { label: 'Invoiced',  cls: 'bg-blue-100 text-blue-700',    icon: Receipt },
  converted: { label: 'Converted', cls: 'bg-violet-100 text-violet-700',icon: ArrowRightLeft },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500', icon: AlertCircle };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cls}`}>
      <Icon size={10} />
      {meta.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtCurrency(n: number | null) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Create modal ──────────────────────────────────────────────────────────────
interface Customer { id: number; name: string; }
interface TeamMember { id: string; name: string; }

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}

function CreateModal({ open, onClose, onCreated }: CreateModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customerId: '',
    customerNameOverride: '',
    siteAddress: '',
    serviceDate: new Date().toISOString().slice(0, 10),
    assignedUserId: '',
    workDescription: '',
  });

  useEffect(() => {
    if (!open) return;
    fetch('/api/customers?status=active', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { customers?: Customer[] } | null) => setCustomers(d?.customers ?? []))
      .catch(() => {});
    fetch('/api/team/members', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { members?: TeamMember[] } | null) => setTeam(d?.members ?? []))
      .catch(() => {});
  }, [open]);

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workDescription.trim()) { setError('Work description is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        workDescription: form.workDescription,
        siteAddress: form.siteAddress || undefined,
        serviceDate: form.serviceDate || undefined,
        status: 'draft',
      };
      if (form.customerId) body.customerId = Number(form.customerId);
      else if (form.customerNameOverride) body.customerNameOverride = form.customerNameOverride;
      if (form.assignedUserId) {
        body.assignedUserId = form.assignedUserId;
        const m = team.find(t => t.id === form.assignedUserId);
        if (m) body.assignedName = m.name;
      }

      const res = await fetch('/api/job-cards', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { jobCard?: { id: number }; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create');
      onCreated(data.jobCard!.id);
      onClose();
      setForm({ customerId: '', customerNameOverride: '', siteAddress: '', serviceDate: new Date().toISOString().slice(0, 10), assignedUserId: '', workDescription: '' });
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: 'min(90vh, 760px)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
            <Zap size={16} className="text-yellow-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-gray-900">New Job Card</h2>
            <p className="text-[11px] text-gray-400">Quick work record — reactive / call-out</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body — lean create: customer + site + work + worker. Labour/materials added after in edit. */}
        <form id="create-jc-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Customer — prefer existing record */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer</label>
            <select
              value={form.customerId}
              onChange={e => set('customerId', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            >
              <option value="">— Select customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!form.customerId && (
              <input
                type="text"
                value={form.customerNameOverride}
                onChange={e => set('customerNameOverride', e.target.value)}
                placeholder="Or type a one-off customer name…"
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            )}
          </div>

          {/* Site + Service date */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Site address</label>
              <input
                type="text"
                value={form.siteAddress}
                onChange={e => set('siteAddress', e.target.value)}
                placeholder="123 Main St"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Service date</label>
              <input
                type="date"
                value={form.serviceDate}
                onChange={e => set('serviceDate', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Work description */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Work description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.workDescription}
              onChange={e => set('workDescription', e.target.value)}
              rows={3}
              placeholder="Describe the work to be done…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
            />
          </div>

          {/* Assigned worker */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assigned worker</label>
            <select
              value={form.assignedUserId}
              onChange={e => set('assignedUserId', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            >
              <option value="">— Unassigned —</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <p className="text-[11px] text-gray-400 -mt-1">Labour, materials, PO number and completion details can be added after creation.</p>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-jc-form"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 hover:bg-yellow-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Job Card
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JobCardsPage() {
  const navigate = useNavigate();

  const [cards, setCards] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  const searchRef = useRef<HTMLInputElement>(null);

  const fetchCards = useCallback(async (opts?: { reset?: boolean }) => {
    setLoading(true);
    try {
      const offset = opts?.reset ? 0 : page * LIMIT;
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(offset),
        status: statusFilter,
        invoiceStatus: invoiceFilter,
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/job-cards?${params}`, { credentials: 'include' });
      const data = await res.json() as { jobCards?: JobCard[]; total?: number };
      setCards(data.jobCards ?? []);
      setTotal(data.total ?? 0);
      if (opts?.reset) setPage(0);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, invoiceFilter, search]);

  useEffect(() => { void fetchCards(); }, [fetchCards]);

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void fetchCards({ reset: true }), 350);
  }

  function handleCreated(id: number) {
    void fetchCards({ reset: true });
    navigate(`/job-cards/${id}`);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex h-screen bg-[#f5f6f8] overflow-hidden">
      <Helmet>
        <title>Job Cards — IWILLBUILD</title>
        <meta name="description" content="Job Card register — reactive and call-out work records." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/job-cards" />
      </Helmet>

      <PortalSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── Page header ── */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0">
                <Zap size={16} className="text-yellow-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[17px] font-bold text-gray-900 leading-tight">Job Cards</h1>
                <p className="text-[11px] text-gray-400">Reactive &amp; call-out work records</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => void fetchCards()}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold transition-colors"
              >
                <Plus size={15} />
                New Job Card
              </button>
            </div>
          </div>

          {/* ── Filters row ── */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search cards…"
                className="w-full pl-8 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white"
              />
              {search && (
                <button onClick={() => { setSearch(''); void fetchCards({ reset: true }); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['all', 'draft', 'complete', 'invoiced', 'converted'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); void fetchCards({ reset: true }); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s === 'all' ? 'All' : STATUS_META[s]?.label ?? s}
                </button>
              ))}
            </div>

            {/* Invoice filter */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {([['all', 'All'], ['not_invoiced', 'Uninvoiced'], ['invoiced', 'Invoiced']] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => { setInvoiceFilter(v); void fetchCards({ reset: true }); }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    invoiceFilter === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <span className="ml-auto text-[11px] text-gray-400 shrink-0">
              {total} card{total !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-auto">
          {loading && cards.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <RefreshCw size={20} className="animate-spin text-gray-300" />
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <Zap size={32} className="mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-500">No job cards found</p>
              <p className="text-xs text-gray-400 mt-1">
                {search || statusFilter !== 'all' || invoiceFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first Job Card to get started'}
              </p>
              {!search && statusFilter === 'all' && invoiceFilter === 'all' && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold transition-colors"
                >
                  <Plus size={14} />
                  New Job Card
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">Card #</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Site</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Service date</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide hidden xl:table-cell">Worker</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide hidden md:table-cell">Total</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide hidden lg:table-cell w-12">Photos</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {cards.map((card, i) => {
                  const customerLabel = card.customer_name ?? card.customer_name_override ?? '—';
                  const labour = Number(card.labour_amount ?? 0);
                  const mats = Number(card.materials_total ?? 0);
                  const total = labour + mats;

                  return (
                    <tr
                      key={card.id}
                      onClick={() => navigate(`/job-cards/${card.id}`)}
                      className={`border-b border-gray-50 hover:bg-yellow-50/40 cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-[12px] font-bold text-gray-700">{card.card_number}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{customerLabel}</p>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{card.work_description}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-[12px] text-gray-500 truncate max-w-[160px] block">{card.site_address ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                        <span className="text-[12px] text-gray-500">{fmtDate(card.service_date)}</span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-[12px] text-gray-500">{card.assigned_name ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={card.status} />
                          {card.invoice_id && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600">
                              <Receipt size={9} />
                              Invoiced
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell whitespace-nowrap">
                        <span className="text-[13px] font-semibold text-gray-700">
                          {total > 0 ? fmtCurrency(total) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center hidden lg:table-cell">
                        {card.photo_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <Camera size={11} />
                            {card.photo_count}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        <ChevronRight size={14} className="text-gray-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-between shrink-0">
            <span className="text-[12px] text-gray-400">
              Page {page + 1} of {totalPages} · {total} total
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </div>
  );
}
