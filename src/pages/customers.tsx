import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, Search, Loader2, X, Check, AlertCircle, Phone, Mail, MapPin, Building2, ChevronRight, FileText, Briefcase, Tag, MessageSquare, Send, ArrowLeft } from 'lucide-react';
import { Link } from "react-router";
// ── SMS compose modal (desktop) ───────────────────────────────────────────────
function SmsModal({
  to,
  name,
  onClose
}: {
  to: string;
  name: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/stakeholders/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          to,
          message
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{
      opacity: 0,
      y: 40
    }} animate={{
      opacity: 1,
      y: 0
    }} exit={{
      opacity: 0,
      y: 40
    }} transition={{
      duration: 0.2,
      ease: 'easeOut' as const
    }} className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-50 rounded-md"><MessageSquare size={15} className="text-violet-600" /></div>
            <div>
              <h2 className="font-bold text-sm text-slate-800">Send SMS</h2>
              <p className="text-xs text-slate-400">{name} · {to}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>
        <form onSubmit={handleSend} className="p-5 flex flex-col gap-4">
          {sent ? <div className="flex items-center justify-center gap-2 py-6 text-emerald-600 font-semibold text-sm">
              <Check size={18} /> Message sent!
            </div> : <>
              <textarea autoFocus value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder={`Type your message to ${name}…`} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors" />
              <p className="text-xs text-slate-400 -mt-2 text-right">{message.length} chars</p>
              {error && <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                  <AlertCircle size={13} className="shrink-0" />{error}
                </div>}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={sending || !message.trim()} className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send SMS
                </button>
              </div>
            </>}
        </form>
      </motion.div>
    </div>;
}
import PortalSidebar from '@/components/PortalSidebar';
import { useViewOnly } from '@/components/ViewOnlyGuard';
import { useTerminology } from '@/lib/useTerminology';
import { fetchCustomers, createCustomer, updateCustomer, archiveCustomer, type Customer } from '@/lib/customers-api';

// ── Customer form modal ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  mobile: '',
  address: '',
  billingAddress: '',
  abn: '',
  notes: '',
  stakeholderType: 'Customer' as string
};
function CustomerFormModal({
  initial,
  onClose,
  onSaved
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
    stakeholderType: (initial as Customer & {
      stakeholder_type?: string;
    }).stakeholder_type ?? 'Customer'
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({
    ...f,
    [k]: v
  }));
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Contact name is required');
      return;
    }
    setSaving(true);
    setError('');
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
        stakeholderType: form.stakeholderType || 'Customer'
      };
      const saved = initial ? await updateCustomer(initial.id, {
        ...payload,
        status: initial.status
      }) : await createCustomer(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }
  const lbl = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';
  const inp = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{
      opacity: 0,
      y: 40
    }} animate={{
      opacity: 1,
      y: 0
    }} exit={{
      opacity: 0,
      y: 40
    }} transition={{
      duration: 0.2,
      ease: 'easeOut' as const
    }} className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-50 rounded-md"><Users size={16} className="text-primary" /></div>
            <h2 className="font-heading font-bold text-base">{initial ? 'Edit Contact' : 'New Contact'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {/* Contact type */}
          <div>
            <label className={lbl}>Contact Type <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {['Customer', 'Supplier', 'Contractor', 'Other'].map(t => <button key={t} type="button" onClick={() => setForm(f => ({
              ...f,
              stakeholderType: t
            }))} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${form.stakeholderType === t ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'}`}>
                  <Tag size={10} />
                  {t}
                </button>)}
            </div>
          </div>

          {/* Business name */}
          <div>
            <label className={lbl}>Business / Name <span className="text-red-500">*</span></label>
            <input autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Thompson Constructions" className={inp} />
          </div>

          {/* Contact + ABN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Contact Person</label>
              <input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="e.g. Mark Thompson" className={inp} />
            </div>
            <div>
              <label className={lbl}>ABN</label>
              <input value={form.abn} onChange={e => set('abn', e.target.value)} placeholder="12 345 678 901" className={inp} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={lbl}>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="mark@example.com" className={inp} />
          </div>

          {/* Phone + Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="07 3000 0000" className={inp} />
            </div>
            <div>
              <label className={lbl}>Mobile</label>
              <input value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="0400 000 000" className={inp} />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={lbl}>Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, Brisbane QLD 4000" className={inp} />
          </div>

          {/* Billing address */}
          <div>
            <label className={lbl}>Billing Address <span className="text-slate-400 font-normal normal-case">(if different)</span></label>
            <input value={form.billingAddress} onChange={e => set('billingAddress', e.target.value)} placeholder="PO Box 123, Brisbane QLD 4000" className={inp} />
          </div>

          {/* Notes */}
          <div>
            <label className={lbl}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any relevant notes about this customer…" className={`${inp} resize-y`} />
          </div>

          {error && <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {initial ? 'Save Changes' : 'Create Contact'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>;
}

// ── Customer card ─────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  onEdit,
  onArchive,
  workPlural
}: {
  customer: Customer;
  onEdit: () => void;
  onArchive: () => void;
  workPlural: string;
}) {
  const isArchived = customer.status === 'archived';
  const phone = customer.mobile || customer.phone;
  const email = customer.email;
  const [smsOpen, setSmsOpen] = useState(false);
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  function handleSms(e: React.MouseEvent) {
    e.stopPropagation();
    if (isMobile) {
      window.location.href = `sms:${phone}`;
    } else {
      setSmsOpen(true);
    }
  }

  // Avatar colour — deterministic from first char
  const avatarColors: Record<string, string> = {
    A: 'bg-rose-100 text-rose-600', B: 'bg-orange-100 text-orange-600',
    C: 'bg-amber-100 text-amber-600', D: 'bg-teal-100 text-teal-700',
    E: 'bg-cyan-100 text-cyan-700', F: 'bg-sky-100 text-sky-700',
    G: 'bg-blue-100 text-blue-700', H: 'bg-indigo-100 text-indigo-700',
    I: 'bg-violet-100 text-violet-700', J: 'bg-purple-100 text-purple-700',
    K: 'bg-fuchsia-100 text-fuchsia-700', L: 'bg-pink-100 text-pink-700',
    M: 'bg-red-100 text-red-600', N: 'bg-emerald-100 text-emerald-700',
    O: 'bg-green-100 text-green-700', P: 'bg-lime-100 text-lime-700',
    Q: 'bg-yellow-100 text-yellow-700', R: 'bg-orange-100 text-orange-700',
    S: 'bg-teal-100 text-teal-600', T: 'bg-rose-100 text-rose-500',
    U: 'bg-sky-100 text-sky-600', V: 'bg-violet-100 text-violet-600',
    W: 'bg-indigo-100 text-indigo-600', X: 'bg-purple-100 text-purple-600',
    Y: 'bg-cyan-100 text-cyan-600', Z: 'bg-emerald-100 text-emerald-600',
  };
  const initial = customer.name[0].toUpperCase();
  const avatarCls = avatarColors[initial] ?? 'bg-primary/10 text-primary';

  return <>
    <div className={`bg-white border rounded-xl transition-colors ${isArchived ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
      {/* ── Main row ── */}
      <div className="flex items-center gap-3 px-3 py-3">

        {/* Avatar */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-black text-sm ${avatarCls}`}>
          {initial}
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-slate-800 truncate block leading-tight">{customer.name}</span>
          <span className="text-[11px] text-slate-400 truncate block leading-tight">
            {customer.contact_person || (customer as Customer & { stakeholder_type?: string }).stakeholder_type || '\u00a0'}
          </span>
        </div>

        {/* Quick-action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={e => e.stopPropagation()}
              aria-label={`Call ${customer.name}`}
              className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 flex items-center justify-center text-white transition-colors"
            >
              <Phone size={15} strokeWidth={2.2} />
            </a>
          )}
          {phone && (
            <button
              onClick={handleSms}
              aria-label={`SMS ${customer.name}`}
              className="w-9 h-9 rounded-xl bg-violet-500 hover:bg-violet-600 active:bg-violet-700 flex items-center justify-center text-white transition-colors"
            >
              <MessageSquare size={15} strokeWidth={2.2} />
            </button>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              onClick={e => e.stopPropagation()}
              aria-label={`Email ${customer.name}`}
              className="w-9 h-9 rounded-xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 flex items-center justify-center text-white transition-colors"
            >
              <Mail size={15} strokeWidth={2.2} />
            </a>
          )}
          {/* Chevron → detail page */}
          <Link
            to={`/customers/${customer.id}`}
            onClick={e => e.stopPropagation()}
            aria-label={`View ${customer.name}`}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
          >
            <ChevronRight size={15} strokeWidth={2.2} />
          </Link>
        </div>
      </div>

      {/* ── Edit / Archive row — subtle, below the main row ── */}
      <div className="flex gap-0 border-t border-slate-100">
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className="flex-1 text-[11px] text-slate-400 hover:text-primary font-semibold py-1.5 transition-colors"
        >
          Edit
        </button>
        {typeof (customer as Customer & { job_count?: number }).job_count === 'number' && (customer as Customer & { job_count?: number }).job_count! > 0 && (
          <span className="text-[11px] text-slate-300 flex items-center gap-1 px-2">
            <Briefcase size={10} />
            {(customer as Customer & { job_count?: number }).job_count} {workPlural}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onArchive(); }}
          className={`flex-1 text-[11px] font-semibold py-1.5 transition-colors ${isArchived ? 'text-slate-400 hover:text-emerald-600' : 'text-slate-400 hover:text-amber-600'}`}
        >
          {isArchived ? 'Unarchive' : 'Archive'}
        </button>
      </div>
    </div>

    <AnimatePresence>
      {smsOpen && phone && <SmsModal to={phone} name={customer.name} onClose={() => setSmsOpen(false)} />}
    </AnimatePresence>
  </>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const {
    workPlural
  } = useTerminology();
  const {
    isViewOnly
  } = useViewOnly();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetchCustomers('all').then(setCustomers).catch(() => setError('Failed to load customers. Please refresh.')).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const filtered = customers.filter(c => {
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.contact_person ?? '').toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q) || (c.mobile ?? '').toLowerCase().includes(q) || (c.abn ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });
  const activeCount = customers.filter(c => c.status === 'active').length;
  const archivedCount = customers.filter(c => c.status === 'archived').length;
  async function handleArchive(c: Customer) {
    const isArchived = c.status === 'archived';
    const action = isArchived ? 'unarchive' : 'archive';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${c.name}"?`)) return;
    try {
      if (isArchived) {
        const updated = await updateCustomer(c.id, {
          ...c,
          status: 'active'
        });
        setCustomers(prev => prev.map(x => x.id === c.id ? updated : x));
      } else {
        await archiveCustomer(c.id);
        setCustomers(prev => prev.map(x => x.id === c.id ? {
          ...x,
          status: 'archived'
        } : x));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  }
  return <div className="portal-page">
      <Helmet>
        <title>Contacts — IWIllBUIlD Portal</title>
        <meta name="description" content="Manage your contacts register — customers, suppliers, contractors and linked jobs." />
        <link rel="canonical" href="https://iwillbuild.com/customers" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Contacts — IWIllBUIlD Portal" />
        <meta property="og:description" content="Manage your contacts register — customers, suppliers, contractors and linked jobs." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/customers" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Contacts — IWIllBUIlD Portal" />
        <meta name="twitter:description" content="Manage your contacts register — customers, suppliers, contractors and linked jobs." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-content">
        {/* Page header */}
        <div className="op-page-header flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Link to="/home" className="flex items-center justify-center w-7 h-7 rounded hover:bg-slate-100 text-slate-500 transition-colors" aria-label="Back to home">
              <ArrowLeft size={15} />
            </Link>
            <Users size={14} className="text-primary shrink-0" />
            <div>
              <h1 className="op-page-title">Contacts</h1>
              <p className="op-page-subtitle hidden sm:block">
                {activeCount} active{archivedCount > 0 ? ` · ${archivedCount} archived` : ''}
              </p>
            </div>
          </div>
          <button onClick={() => {
          setEditing(null);
          setShowModal(true);
        }} disabled={isViewOnly} title={isViewOnly ? 'Subscribe to continue' : undefined} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus size={14} />
            <span className="hidden sm:inline">New Contact</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts, email, phone…" className="w-full pl-9 pr-4 py-2.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
          </div>
          <div className="flex gap-1.5">
            {(['active', 'archived', 'all'] as const).map(f => <button key={f} onClick={() => setStatusFilter(f)} className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${statusFilter === f ? 'bg-primary text-white border-primary' : 'bg-white text-muted-foreground border-border hover:border-primary hover:text-primary'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'active' && activeCount > 0 && ` (${activeCount})`}
                {f === 'archived' && archivedCount > 0 && ` (${archivedCount})`}
              </button>)}
          </div>
        </div>

        {/* Loading */}
        {loading && <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>}

        {/* Error */}
        {error && <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            <AlertCircle size={16} className="shrink-0" />{error}
            <button onClick={load} className="ml-auto font-semibold underline">Retry</button>
          </div>}

        {/* Empty state */}
        {!loading && !error && customers.length === 0 && <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
              <Users size={26} className="text-primary" />
            </div>
            <p className="font-heading font-bold text-base text-foreground mb-1">No contacts yet</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Add your first contact to link them to projects and track work history.
            </p>
            <button onClick={() => !isViewOnly && setShowModal(true)} disabled={isViewOnly} className="inline-flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
              <Plus size={15} />+ New Contact
            </button>
          </div>}

        {/* No results */}
        {!loading && !error && customers.length > 0 && filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">
            No stakeholders match your search or filter.
          </div>}

        {/* Customer list */}
        {!loading && filtered.length > 0 && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        duration: 0.2
      }} className="flex flex-col gap-2">
            {filtered.map(c => <CustomerCard key={c.id} customer={c} workPlural={workPlural} onEdit={() => {
          setEditing(c);
          setShowModal(true);
        }} onArchive={() => handleArchive(c)} />)}
          </motion.div>}
      </div>

      <AnimatePresence>
        {showModal && <CustomerFormModal initial={editing} onClose={() => {
        setShowModal(false);
        setEditing(null);
      }} onSaved={saved => {
        setCustomers(prev => editing ? prev.map(x => x.id === saved.id ? saved : x) : [saved, ...prev]);
        setShowModal(false);
        setEditing(null);
      }} />}
      </AnimatePresence>
    </div>;
}
