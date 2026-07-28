/**
 * /job-cards/:id — Desktop Job Card detail + edit
 *
 * Office-first: structured detail view, inline edit, invoice generation,
 * convert to Full Job, materials table, completion summary, signature display.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import PortalSidebar from '@/components/PortalSidebar';
import {
  Zap, ChevronLeft, Edit2, Save, X, Plus, Trash2,
  RefreshCw, AlertCircle, CheckCircle2, Receipt, ArrowRightLeft,
  Clock, FileText, Camera, User, MapPin, Phone, Hash,
  CalendarDays, Wrench, DollarSign, StickyNote, ClipboardCheck,
  ExternalLink, AlertTriangle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Material { id?: number; description: string; cost: number; }
interface Photo { id: number; file_path: string; file_name: string; caption: string | null; }

interface JobCard {
  id: number;
  card_number: string;
  status: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_name_override: string | null;
  site_address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  po_number: string | null;
  service_date: string | null;
  assigned_user_id: string | null;
  assigned_name: string | null;
  work_description: string;
  labour_hours: number | null;
  labour_rate: number | null;
  labour_amount: number | null;
  notes: string | null;
  internal_notes: string | null;
  completion_summary: string | null;
  authorised_by: string | null;
  signature_data: string | null;
  approval_date: string | null;
  invoice_id: number | null;
  converted_job_id: number | null;
  created_at: string;
  updated_at: string;
  materials: Material[];
  photos: Photo[];
}

interface Customer { id: number; name: string; }
interface TeamMember { id: string; name: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${meta.cls}`}>
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, className = '' }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
        <Icon size={14} className="text-gray-400 shrink-0" />
        <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-[13px] text-gray-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

// ── Invoice modal ─────────────────────────────────────────────────────────────
function InvoiceModal({ card, open, onClose, onDone }: {
  card: JobCard;
  open: boolean;
  onClose: () => void;
  onDone: (invoiceId: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [includeGst, setIncludeGst] = useState(true);

  const labour = Number(card.labour_amount ?? 0);
  const mats = card.materials.reduce((s, m) => s + Number(m.cost ?? 0), 0);
  const subtotal = labour + mats;
  const gst = includeGst ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = subtotal + gst;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/job-cards/${card.id}/invoice`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueDate, dueDate: dueDate || undefined, notes: notes || undefined, includeGst }),
      });
      const data = await res.json() as { invoiceId?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onDone(data.invoiceId!);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <Receipt size={15} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-gray-900">Generate Invoice</h2>
            <p className="text-[11px] text-gray-400">From {card.card_number}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Labour</span>
              <span className="font-medium text-gray-700">{fmtCurrency(labour)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Materials ({card.materials.length} items)</span>
              <span className="font-medium text-gray-700">{fmtCurrency(mats)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium text-gray-700">{fmtCurrency(subtotal)}</span>
            </div>
            {includeGst && (
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">GST (10%)</span>
                <span className="font-medium text-gray-700">{fmtCurrency(gst)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200 mt-1">
              <span className="font-bold text-gray-800">Total</span>
              <span className="font-bold text-gray-900">{fmtCurrency(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Issue date</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Additional invoice notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeGst} onChange={e => setIncludeGst(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400" />
            <span className="text-sm text-gray-700">Include GST (10%)</span>
          </label>
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={e => { void handleSubmit(e as unknown as React.FormEvent); }}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Receipt size={14} />}
            Generate Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Convert modal ─────────────────────────────────────────────────────────────
function ConvertModal({ card, open, onClose, onDone }: {
  card: JobCard;
  open: boolean;
  onClose: () => void;
  onDone: (jobId: number, jobNumber: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [jobName, setJobName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/job-cards/${card.id}/convert`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName: jobName || undefined }),
      });
      const data = await res.json() as { jobId?: number; jobNumber?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onDone(data.jobId!, data.jobNumber!);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <ArrowRightLeft size={15} className="text-violet-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-gray-900">Convert to Full Job</h2>
            <p className="text-[11px] text-gray-400">This Job Card becomes the source record</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="bg-violet-50 rounded-lg p-3 text-sm text-violet-700">
            A new Full Job will be created from this Job Card. The Job Card is preserved as the original source record and will be marked as Converted.
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Job title (optional)</label>
            <input
              type="text"
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              placeholder={card.work_description.slice(0, 60) || 'Auto-generated from work description'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
            />
            <p className="text-[11px] text-gray-400 mt-1">Leave blank to use the work description as the job title.</p>
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={e => { void handleSubmit(e as unknown as React.FormEvent); }}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
            Convert to Full Job
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────────
interface EditPanelProps {
  card: JobCard;
  customers: Customer[];
  team: TeamMember[];
  onSave: (updated: JobCard) => void;
  onCancel: () => void;
}

function EditPanel({ card, customers, team, onSave, onCancel }: EditPanelProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState<Material[]>(card.materials.map(m => ({ ...m })));

  const [form, setForm] = useState({
    customerId: String(card.customer_id ?? ''),
    customerNameOverride: card.customer_name_override ?? '',
    siteAddress: card.site_address ?? '',
    contactPerson: card.contact_person ?? '',
    contactPhone: card.contact_phone ?? '',
    poNumber: card.po_number ?? '',
    serviceDate: card.service_date ? card.service_date.slice(0, 10) : '',
    assignedUserId: card.assigned_user_id ?? '',
    workDescription: card.work_description,
    labourHours: card.labour_hours != null ? String(card.labour_hours) : '',
    labourRate: card.labour_rate != null ? String(card.labour_rate) : '',
    labourAmount: card.labour_amount != null ? String(card.labour_amount) : '',
    notes: card.notes ?? '',
    internalNotes: card.internal_notes ?? '',
    completionSummary: card.completion_summary ?? '',
    authorisedBy: card.authorised_by ?? '',
    approvalDate: card.approval_date ? card.approval_date.slice(0, 10) : '',
    status: card.status,
  });

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function addMaterial() { setMaterials(m => [...m, { description: '', cost: 0 }]); }
  function removeMaterial(i: number) { setMaterials(m => m.filter((_, idx) => idx !== i)); }
  function updateMaterial(i: number, k: keyof Material, v: string | number) {
    setMaterials(m => m.map((item, idx) => idx === i ? { ...item, [k]: v } : item));
  }

  async function handleSave() {
    if (!form.workDescription.trim()) { setError('Work description is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        workDescription: form.workDescription,
        siteAddress: form.siteAddress || null,
        contactPerson: form.contactPerson || null,
        contactPhone: form.contactPhone || null,
        poNumber: form.poNumber || null,
        serviceDate: form.serviceDate || null,
        notes: form.notes || null,
        internalNotes: form.internalNotes || null,
        completionSummary: form.completionSummary || null,
        authorisedBy: form.authorisedBy || null,
        approvalDate: form.approvalDate || null,
        status: form.status,
        materials: materials.filter(m => m.description.trim()).map(m => ({
          description: m.description,
          cost: Number(m.cost ?? 0),
        })),
      };
      if (form.customerId) body.customerId = Number(form.customerId);
      else body.customerNameOverride = form.customerNameOverride || null;
      if (form.assignedUserId) {
        body.assignedUserId = form.assignedUserId;
        const m = team.find(t => t.id === form.assignedUserId);
        if (m) body.assignedName = m.name;
      } else {
        body.assignedUserId = null;
        body.assignedName = null;
      }
      if (form.labourHours) body.labourHours = Number(form.labourHours);
      if (form.labourRate) body.labourRate = Number(form.labourRate);
      if (form.labourAmount) body.labourAmount = Number(form.labourAmount);

      const res = await fetch(`/api/job-cards/${card.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { jobCard?: JobCard; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      onSave({ ...data.jobCard!, materials: data.jobCard?.materials ?? [] });
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  const labourTotal = form.labourAmount
    ? Number(form.labourAmount)
    : (Number(form.labourHours) * Number(form.labourRate)) || 0;
  const matsTotal = materials.reduce((s, m) => s + Number(m.cost ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Status */}
      <Section title="Status" icon={CheckCircle2}>
        <select value={form.status} onChange={e => set('status', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
          <option value="draft">Draft</option>
          <option value="complete">Complete</option>
          <option value="invoiced" disabled>Invoiced (set automatically)</option>
          <option value="converted" disabled>Converted (set automatically)</option>
        </select>
      </Section>

      {/* Customer */}
      <Section title="Customer" icon={User}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Customer record</label>
            <select value={form.customerId} onChange={e => set('customerId', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
              <option value="">— None —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Or free-text name</label>
            <input type="text" value={form.customerNameOverride} onChange={e => set('customerNameOverride', e.target.value)}
              disabled={!!form.customerId} placeholder="Free-text name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent disabled:opacity-40" />
          </div>
        </div>
      </Section>

      {/* Site */}
      <Section title="Site & Contact" icon={MapPin}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Site address</label>
            <input type="text" value={form.siteAddress} onChange={e => set('siteAddress', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Contact person</label>
            <input type="text" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Contact phone</label>
            <input type="tel" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">PO number</label>
            <input type="text" value={form.poNumber} onChange={e => set('poNumber', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
          </div>
        </div>
      </Section>

      {/* Work */}
      <Section title="Work" icon={Wrench}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Service date</label>
              <input type="date" value={form.serviceDate} onChange={e => set('serviceDate', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Assigned worker</label>
              <select value={form.assignedUserId} onChange={e => set('assignedUserId', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
                <option value="">— Unassigned —</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Work description <span className="text-red-500">*</span></label>
            <textarea value={form.workDescription} onChange={e => set('workDescription', e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none" />
          </div>
        </div>
      </Section>

      {/* Labour */}
      <Section title="Labour" icon={DollarSign}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Hours</label>
            <input type="number" min="0" step="0.25" value={form.labourHours} onChange={e => set('labourHours', e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Rate ($/hr)</label>
            <input type="number" min="0" step="0.01" value={form.labourRate} onChange={e => set('labourRate', e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Override amount</label>
            <input type="number" min="0" step="0.01" value={form.labourAmount} onChange={e => set('labourAmount', e.target.value)}
              placeholder={labourTotal > 0 ? String(labourTotal) : '0.00'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Labour total: <strong>{fmtCurrency(labourTotal)}</strong></p>
      </Section>

      {/* Materials */}
      <Section title="Materials" icon={Wrench}>
        <div className="flex flex-col gap-2">
          {materials.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={m.description}
                onChange={e => updateMaterial(i, 'description', e.target.value)}
                placeholder="Description"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
              <div className="relative w-28 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={m.cost}
                  onChange={e => updateMaterial(i, 'cost', Number(e.target.value))}
                  className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                />
              </div>
              <button onClick={() => removeMaterial(i)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={addMaterial}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-yellow-600 hover:text-yellow-700 transition-colors mt-1"
          >
            <Plus size={13} />
            Add material
          </button>
          {materials.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">Materials total: <strong>{fmtCurrency(matsTotal)}</strong></p>
          )}
        </div>
      </Section>

      {/* Completion */}
      <Section title="Completion" icon={ClipboardCheck}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Completion summary / report</label>
            <textarea value={form.completionSummary} onChange={e => set('completionSummary', e.target.value)} rows={3}
              placeholder="Summary of work completed…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Authorised by</label>
              <input type="text" value={form.authorisedBy} onChange={e => set('authorisedBy', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Approval date</label>
              <input type="date" value={form.approvalDate} onChange={e => set('approvalDate', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
            </div>
          </div>
        </div>
      </Section>

      {/* Notes */}
      <Section title="Notes" icon={StickyNote}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Notes (visible on invoice)</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 mb-1">Internal notes</label>
            <textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none" />
          </div>
        </div>
      </Section>

      {/* Save / Cancel */}
      <div className="flex items-center justify-end gap-2 pt-2 pb-6">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 hover:bg-yellow-600 text-white transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [card, setCard] = useState<JobCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  const fetchCard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/job-cards/${id}`, { credentials: 'include' });
      if (!res.ok) { setError('Job card not found'); return; }
      const data = await res.json() as { jobCard?: JobCard };
      setCard(data.jobCard ?? null);
    } catch {
      setError('Failed to load job card');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchCard(); }, [fetchCard]);

  useEffect(() => {
    fetch('/api/customers?status=active', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { customers?: Customer[] } | null) => setCustomers(d?.customers ?? []))
      .catch(() => {});
    fetch('/api/team/members', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { members?: TeamMember[] } | null) => setTeam(d?.members ?? []))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen bg-[#f5f6f8]">
        <PortalSidebar />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="flex h-screen bg-[#f5f6f8]">
        <PortalSidebar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <AlertCircle size={28} className="text-red-400" />
          <p className="text-gray-600 font-medium">{error || 'Job card not found'}</p>
          <Link to="/job-cards" className="text-sm text-yellow-600 hover:underline">← Back to Job Cards</Link>
        </div>
      </div>
    );
  }

  const customerLabel = card.customer_name ?? card.customer_name_override ?? '—';
  const labour = Number(card.labour_amount ?? 0);
  const mats = card.materials.reduce((s, m) => s + Number(m.cost ?? 0), 0);
  const subtotal = labour + mats;
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + gst;

  const canInvoice = card.status !== 'invoiced' && card.status !== 'converted';
  const canConvert = card.status !== 'converted';

  return (
    <div className="flex h-screen bg-[#f5f6f8] overflow-hidden">
      <Helmet>
        <title>{card.card_number} — Job Card — IWILLBUILD</title>
        <meta name="description" content={`Job Card ${card.card_number} — ${card.work_description.slice(0, 120)}`} />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`https://iwillbuild.com/job-cards/${card.id}`} />
      </Helmet>

      <PortalSidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Link to="/job-cards" className="mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0">
                <ChevronLeft size={16} />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[13px] font-bold text-gray-500">{card.card_number}</span>
                  <StatusBadge status={card.status} />
                  {card.invoice_id && (
                    <Link to={`/invoices/${card.invoice_id}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                      <Receipt size={9} />
                      Invoice #{card.invoice_id}
                      <ExternalLink size={9} />
                    </Link>
                  )}
                  {card.converted_job_id && (
                    <Link to={`/jobs/${card.converted_job_id}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors">
                      <ArrowRightLeft size={9} />
                      Full Job #{card.converted_job_id}
                      <ExternalLink size={9} />
                    </Link>
                  )}
                </div>
                <h1 className="text-[17px] font-bold text-gray-900 mt-1 leading-tight truncate max-w-lg">
                  {customerLabel}
                </h1>
                <p className="text-[12px] text-gray-400 mt-0.5 truncate max-w-lg">{card.work_description}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {!editing && (
                <>
                  {canConvert && (
                    <button
                      onClick={() => setConvertOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-50 transition-colors"
                    >
                      <ArrowRightLeft size={14} />
                      Convert
                    </button>
                  )}
                  {canInvoice && (
                    <button
                      onClick={() => setInvoiceOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors"
                    >
                      <Receipt size={14} />
                      Invoice
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold transition-colors"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {editing ? (
            <EditPanel
              card={card}
              customers={customers}
              team={team}
              onSave={(updated) => { setCard(updated); setEditing(false); showToast('Job Card saved'); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {/* Summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Labour', value: fmtCurrency(labour), icon: DollarSign, cls: 'text-emerald-600' },
                  { label: 'Materials', value: fmtCurrency(mats), icon: Wrench, cls: 'text-orange-500' },
                  { label: 'Subtotal', value: fmtCurrency(subtotal), icon: FileText, cls: 'text-gray-600' },
                  { label: 'Total (inc. GST)', value: fmtCurrency(total), icon: Receipt, cls: 'text-blue-600' },
                ].map(({ label, value, icon: Icon, cls }) => (
                  <div key={label} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} className={cls} />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
                    </div>
                    <p className="text-[15px] font-bold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {/* Details */}
              <Section title="Details" icon={FileText}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                  <Field label="Card number" value={card.card_number} mono />
                  <Field label="Service date" value={fmtDate(card.service_date)} />
                  <Field label="Created" value={fmtDate(card.created_at)} />
                  <Field label="Customer" value={customerLabel} />
                  <Field label="Site address" value={card.site_address} />
                  <Field label="Contact person" value={card.contact_person} />
                  <Field label="Contact phone" value={card.contact_phone} />
                  <Field label="PO number" value={card.po_number} />
                  <Field label="Assigned worker" value={card.assigned_name} />
                </div>
              </Section>

              {/* Work description */}
              <Section title="Work description" icon={Wrench}>
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{card.work_description}</p>
              </Section>

              {/* Labour */}
              <Section title="Labour" icon={DollarSign}>
                <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                  <Field label="Hours" value={card.labour_hours != null ? `${card.labour_hours} hrs` : null} />
                  <Field label="Rate" value={card.labour_rate != null ? fmtCurrency(card.labour_rate) + '/hr' : null} />
                  <Field label="Labour total" value={fmtCurrency(card.labour_amount)} />
                </div>
              </Section>

              {/* Materials */}
              {card.materials.length > 0 && (
                <Section title="Materials" icon={Wrench}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Description</th>
                        <th className="text-right py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.materials.map((m, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 text-[13px] text-gray-700">{m.description}</td>
                          <td className="py-2 text-right text-[13px] font-semibold text-gray-700">{fmtCurrency(m.cost)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="pt-2 text-[12px] font-bold text-gray-500">Total</td>
                        <td className="pt-2 text-right text-[13px] font-bold text-gray-800">{fmtCurrency(mats)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Section>
              )}

              {/* Completion */}
              {(card.completion_summary || card.authorised_by || card.approval_date || card.signature_data) && (
                <Section title="Completion" icon={ClipboardCheck}>
                  <div className="flex flex-col gap-3">
                    {card.completion_summary && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Completion summary</p>
                        <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{card.completion_summary}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <Field label="Authorised by" value={card.authorised_by} />
                      <Field label="Approval date" value={fmtDate(card.approval_date)} />
                    </div>
                    {card.signature_data && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Signature</p>
                        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50 inline-block">
                          <img src={card.signature_data} alt="Customer signature" className="max-h-24 max-w-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Notes */}
              {(card.notes || card.internal_notes) && (
                <Section title="Notes" icon={StickyNote}>
                  <div className="flex flex-col gap-3">
                    {card.notes && <Field label="Notes" value={card.notes} />}
                    {card.internal_notes && <Field label="Internal notes" value={card.internal_notes} />}
                  </div>
                </Section>
              )}

              {/* Photos */}
              {card.photos.length > 0 && (
                <Section title={`Photos (${card.photos.length})`} icon={Camera}>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {card.photos.map(p => (
                      <a key={p.id} href={p.file_path} target="_blank" rel="noopener noreferrer"
                        className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity">
                        <img src={p.file_path} alt={p.caption ?? p.file_name} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <InvoiceModal
        card={card}
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        onDone={(invId) => {
          setInvoiceOpen(false);
          showToast('Invoice created');
          void fetchCard();
          navigate(`/invoices/${invId}`);
        }}
      />

      <ConvertModal
        card={card}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        onDone={(jobId, jobNumber) => {
          setConvertOpen(false);
          showToast(`Converted to Full Job ${jobNumber}`);
          void fetchCard();
          navigate(`/jobs/${jobId}`);
        }}
      />
    </div>
  );
}
