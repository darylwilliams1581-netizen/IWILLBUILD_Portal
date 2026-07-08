import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, Plus, Search, Loader2, X, Check, AlertCircle,
  Phone, Mail, MapPin, Building2, Archive, ArchiveRestore,
  ChevronRight, User, FileText, Briefcase, Tag,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PortalSidebar, { MobileMenuButton } from '@/components/PortalSidebar';
import { useViewOnly } from '@/components/ViewOnlyGuard';
import { useTerminology } from '@/lib/useTerminology';
import {
  fetchCustomers, createCustomer, updateCustomer, archiveCustomer,
  type Customer,
} from '@/lib/customers-api';

// ── Customer form modal ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', contactPerson: '', email: '', phone: '', mobile: '',
  address: '', billingAddress: '', abn: '', notes: '',
  stakeholderType: 'Customer' as string,
};

function CustomerFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Customer | null;
  onClose: () => void;
  onSaved: (c: Customer) => void;
}) {
  const [form, setForm] = useState(() => initial ? {
    name: initial.name,
    contactPerson: initial.contact_person ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    mobile: initial.mobile ?? '',
    address: initial.address ?? '',
    billingAddress: initial.billing_address ?? '',
    abn: initial.abn ?? '',
    notes: initial.notes ?? '',
    stakeholderType: (initial as Customer & { stakeholder_type?: string }).stakeholder_type ?? 'Customer',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Stakeholder name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
        address: form.address.trim() || undefined,
        billingAddress: form.billingAddress.trim() || undefined,
        abn: form.abn.trim() || undefined,
        notes: form.notes.trim() || undefined,
        stakeholderType: form.stakeholderType || 'Customer',
      };
      const saved = initial
        ? await updateCustomer(initial.id, { ...payload, status: initial.status })
        : await createCustomer(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const lbl = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';
  const inp = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-orange-50 rounded-md"><Users size={16} className="text-primary" /></div>
            <h2 className="font-heading font-bold text-base">{initial ? 'Edit Stakeholder' : 'New Stakeholder'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {/* Stakeholder type */}
          <div>
            <label className={lbl}>Stakeholder Type <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {['Customer', 'Client', 'Subcontractor', 'Supplier', 'Employee', 'Support', 'Other'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, stakeholderType: t }))}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    form.stakeholderType === t
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                  }`}
                >
                  <Tag size={10} />
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Business name */}
          <div>
            <label className={lbl}>Business / Name <span className="text-red-500">*</span></label>
            <input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Thompson Constructions" className={inp} />
          </div>

          {/* Contact + ABN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Contact Person</label>
              <input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} placeholder="e.g. Mark Thompson" className={inp} />
            </div>
            <div>
              <label className={lbl}>ABN</label>
              <input value={form.abn} onChange={(e) => set('abn', e.target.value)} placeholder="12 345 678 901" className={inp} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={lbl}>Email</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="mark@example.com" className={inp} />
          </div>

          {/* Phone + Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="07 3000 0000" className={inp} />
            </div>
            <div>
              <label className={lbl}>Mobile</label>
              <input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="0400 000 000" className={inp} />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={lbl}>Address</label>
            <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St, Brisbane QLD 4000" className={inp} />
          </div>

          {/* Billing address */}
          <div>
            <label className={lbl}>Billing Address <span className="text-slate-400 font-normal normal-case">(if different)</span></label>
            <input value={form.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} placeholder="PO Box 123, Brisbane QLD 4000" className={inp} />
          </div>

          {/* Notes */}
          <div>
            <label className={lbl}>Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Any relevant notes about this customer…" className={`${inp} resize-y`} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {initial ? 'Save Changes' : 'Create Stakeholder'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Customer card ─────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  onEdit,
  onArchive,
  workPlural,
}: {
  customer: Customer;
  onEdit: () => void;
  onArchive: () => void;
  workPlural: string;
}) {
  const isArchived = customer.status === 'archived';

  return (
    <div className={`bg-white border rounded-xl p-4 flex items-start justify-between gap-3 transition-colors ${isArchived ? 'border-slate-200 opacity-60' : 'border-slate-200 hover:border-primary/30 hover:shadow-sm'}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-primary font-black text-sm">{customer.name[0].toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-bold text-sm text-slate-800 truncate">{customer.name}</h3>
            {(customer as Customer & { stakeholder_type?: string }).stakeholder_type && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                {(customer as Customer & { stakeholder_type?: string }).stakeholder_type}
              </span>
            )}
            {isArchived && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Archived</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {customer.contact_person && (
              <span className="flex items-center gap-1 text-xs text-slate-500"><User size={10} />{customer.contact_person}</span>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary transition-colors">
                <Mail size={10} />{customer.email}
              </a>
            )}
            {(customer.phone || customer.mobile) && (
              <a href={`tel:${customer.phone || customer.mobile}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary transition-colors">
                <Phone size={10} />{customer.phone || customer.mobile}
              </a>
            )}
            {customer.address && (
              <span className="flex items-center gap-1 text-xs text-slate-400 truncate max-w-xs"><MapPin size={10} />{customer.address}</span>
            )}
            {customer.abn && (
              <span className="flex items-center gap-1 text-xs text-slate-400"><FileText size={10} />ABN {customer.abn}</span>
            )}
          </div>
          {typeof customer.job_count === 'number' && customer.job_count > 0 && (
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                <Briefcase size={9} />{customer.job_count} {customer.job_count === 1 ? workPlural.replace(/s$/, '') : workPlural}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Link
          to={`/customers/${customer.id}`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"
          title="View details"
        >
          <ChevronRight size={15} />
        </Link>
        <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
          <Building2 size={14} />
        </button>
        <button
          onClick={onArchive}
          className={`p-1.5 rounded-lg transition-colors ${isArchived ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
          title={isArchived ? 'Unarchive' : 'Archive'}
        >
          {isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { workPlural } = useTerminology();
  const { isViewOnly } = useViewOnly();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    fetchCustomers('all')
      .then(setCustomers)
      .catch(() => setError('Failed to load customers. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter((c) => {
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      (c.contact_person ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.mobile ?? '').toLowerCase().includes(q) ||
      (c.abn ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const activeCount = customers.filter((c) => c.status === 'active').length;
  const archivedCount = customers.filter((c) => c.status === 'archived').length;

  async function handleArchive(c: Customer) {
    const isArchived = c.status === 'archived';
    const action = isArchived ? 'unarchive' : 'archive';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${c.name}"?`)) return;
    try {
      if (isArchived) {
        const updated = await updateCustomer(c.id, { ...c, status: 'active' });
        setCustomers((prev) => prev.map((x) => x.id === c.id ? updated : x));
      } else {
        await archiveCustomer(c.id);
        setCustomers((prev) => prev.map((x) => x.id === c.id ? { ...x, status: 'archived' } : x));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  }

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>Customers — IWILLBUILD Portal</title>
        <meta name="description" content="Manage your customer and stakeholder register — contacts, companies and linked jobs." />
        <link rel="canonical" href="https://iwillbuild.com/customers" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Customers — IWILLBUILD Portal" />
        <meta property="og:description" content="Manage your customer and stakeholder register — contacts, companies and linked jobs." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/customers" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Customers — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Manage your customer and stakeholder register — contacts, companies and linked jobs." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-content">
        {/* Page header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={openMobileMenu} />
            <div>
              <h1 className="font-heading font-black text-xl text-foreground">Stakeholders</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {activeCount} active{archivedCount > 0 ? ` · ${archivedCount} archived` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            disabled={isViewOnly}
            title={isViewOnly ? 'Subscribe to continue' : undefined}
            className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">+ New Stakeholder</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stakeholders, contacts, email…"
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
          <div className="flex gap-1.5">
            {(['active', 'archived', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                  statusFilter === f
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground border-border hover:border-primary hover:text-primary'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'active' && activeCount > 0 && ` (${activeCount})`}
                {f === 'archived' && archivedCount > 0 && ` (${archivedCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            <AlertCircle size={16} className="shrink-0" />{error}
            <button onClick={load} className="ml-auto font-semibold underline">Retry</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && customers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
              <Users size={26} className="text-primary" />
            </div>
            <p className="font-heading font-bold text-base text-foreground mb-1">No stakeholders yet</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Add your first stakeholder to link them to projects and track work history.
            </p>
            <button
              onClick={() => !isViewOnly && setShowModal(true)}
              disabled={isViewOnly}
              className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <Plus size={15} />+ New Stakeholder
            </button>
          </div>
        )}

        {/* No results */}
        {!loading && !error && customers.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No stakeholders match your search or filter.
          </div>
        )}

        {/* Customer list */}
        {!loading && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-2"
          >
            {filtered.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                workPlural={workPlural}
                onEdit={() => { setEditing(c); setShowModal(true); }}
                onArchive={() => handleArchive(c)}
              />
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <CustomerFormModal
            initial={editing}
            onClose={() => { setShowModal(false); setEditing(null); }}
            onSaved={(saved) => {
              setCustomers((prev) =>
                editing
                  ? prev.map((x) => x.id === saved.id ? saved : x)
                  : [saved, ...prev]
              );
              setShowModal(false);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
