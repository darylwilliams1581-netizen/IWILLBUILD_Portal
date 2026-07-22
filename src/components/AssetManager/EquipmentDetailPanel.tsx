/**
 * EquipmentDetailPanel
 * Clean card view — no tabs. Edit button opens a full user form modal.
 * Assign button opens assign modal (container / car / truck / person / job).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Loader2, AlertCircle, Edit2, Check, X,
  MapPin, Package, Briefcase, Tag, Truck, User, Car,
  StickyNote, Calendar, Wrench, Hash,
} from 'lucide-react';
import { EQUIPMENT_TYPES } from './AMAssetsTab';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Equipment {
  id: number;
  name: string;
  asset_number: string | null;
  asset_type: string;
  status: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_or_hire: string;
  hire_company: string | null;
  hire_start_date: string | null;
  hire_end_date: string | null;
  condition_rating: string | null;
  current_location: string | null;
  assigned_job_id: number | null;
  assigned_person_name: string | null;
  last_inspection_date: string | null;
  next_inspection_due: string | null;
  calibration_due: string | null;
  certificate_expiry: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  service_interval_days: number | null;
  service_notes: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(d: string | null) {
  return !!d && new Date(d) < new Date();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active:          'bg-emerald-100 text-emerald-700',
    'in-use':        'bg-blue-100 text-blue-700',
    'under-repair':  'bg-amber-100 text-amber-700',
    retired:         'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const t = EQUIPMENT_TYPES.find((x) => x.value === type);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${t?.color ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {t?.label ?? type}
    </span>
  );
}

// ── Info chip ─────────────────────────────────────────────────────────────────

function Chip({ icon: Icon, label, warn }: { icon: React.ElementType; label: string; warn?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${warn ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
      <Icon size={12} className="shrink-0" />
      <span>{label}</span>
    </div>
  );
}

// ── Assign modal ──────────────────────────────────────────────────────────────

const ASSIGN_TYPES = [
  { id: 'container', label: 'Container', icon: Package,  color: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200' },
  { id: 'car',       label: 'Car',       icon: Car,      color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' },
  { id: 'truck',     label: 'Truck',     icon: Truck,    color: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200' },
  { id: 'person',    label: 'Person',    icon: User,     color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
  { id: 'job',       label: 'Job',       icon: Briefcase,color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200' },
];

function AssignModal({ assetId, onClose, onSaved }: {
  assetId: number; onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!type || !value.trim()) return;
    setSaving(true);
    const body: Record<string, string | null> = {};
    if (type === 'person') body.assigned_person_name = value.trim();
    else if (type === 'job') body.assigned_job_id = value.trim();
    else body.current_location = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${value.trim()}`;
    await fetch(`/api/asset-manager/assets/${assetId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Assign to</h2>
          <button onClick={onClose} className="p-1 text-slate-600 hover:text-slate-800"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {ASSIGN_TYPES.map(({ id, label, icon: Icon, color }) => (
            <button key={id} onClick={() => { setType(id); setValue(''); }}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all ${type === id ? 'ring-2 ring-orange-500 ring-offset-1 ' + color : color}`}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </div>
        {type && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500">
              {type === 'person' ? 'Person name' : type === 'job' ? 'Job number or name' : `${type.charAt(0).toUpperCase() + type.slice(1)} name / ID`}
            </label>
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={type === 'person' ? 'e.g. John Smith' : type === 'job' ? 'e.g. 1042' : type === 'car' ? 'e.g. ABC-123' : type === 'truck' ? 'e.g. Truck 4' : 'e.g. Container C3'}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
          </div>
        )}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button onClick={save} disabled={!type || !value.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Assign
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit form modal ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['active', 'in-use', 'under-repair', 'retired'];
const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

function EditModal({ eq, onClose, onSaved }: {
  eq: Equipment; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name:                  eq.name,
    asset_number:          eq.asset_number ?? '',
    asset_type:            eq.asset_type,
    status:                eq.status,
    make:                  eq.make ?? '',
    model:                 eq.model ?? '',
    serial_number:         eq.serial_number ?? '',
    purchase_or_hire:      eq.purchase_or_hire ?? 'owned',
    hire_company:          eq.hire_company ?? '',
    hire_start_date:       eq.hire_start_date?.slice(0, 10) ?? '',
    hire_end_date:         eq.hire_end_date?.slice(0, 10) ?? '',
    condition_rating:      eq.condition_rating ?? '',
    current_location:      eq.current_location ?? '',
    last_inspection_date:  eq.last_inspection_date?.slice(0, 10) ?? '',
    next_inspection_due:   eq.next_inspection_due?.slice(0, 10) ?? '',
    calibration_due:       eq.calibration_due?.slice(0, 10) ?? '',
    certificate_expiry:    eq.certificate_expiry?.slice(0, 10) ?? '',
    last_service_date:     eq.last_service_date?.slice(0, 10) ?? '',
    next_service_date:     eq.next_service_date?.slice(0, 10) ?? '',
    service_interval_days: eq.service_interval_days ? String(eq.service_interval_days) : '',
    service_notes:         eq.service_notes ?? '',
    notes:                 eq.notes ?? '',
    purchase_date:         eq.purchase_date?.slice(0, 10) ?? '',
    purchase_price:        eq.purchase_price ? String(eq.purchase_price) : '',
  });
  const [saving, setSaving] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function save() {
    setSaving(true);
    const body: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(form)) {
      if (k === 'service_interval_days' || k === 'purchase_price') {
        body[k] = v ? Number(v) : null;
      } else {
        body[k] = v || null;
      }
    }
    await fetch(`/api/asset-manager/assets/${eq.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 bg-white';
  const lbl = 'block text-xs font-medium text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-bold text-slate-900">Edit Equipment</h2>
          <button onClick={onClose} className="p-1 text-slate-600 hover:text-slate-800"><X size={16} /></button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

          {/* Name */}
          <div className="sm:col-span-2">
            <label className={lbl}>Name *</label>
            <input value={form.name} onChange={set('name')} className={inp} placeholder="e.g. Angle Grinder 9&quot;" />
          </div>

          {/* Asset number */}
          <div>
            <label className={lbl}>Asset number</label>
            <input value={form.asset_number} onChange={set('asset_number')} className={inp} placeholder="e.g. EQ-001" />
          </div>

          {/* Type */}
          <div>
            <label className={lbl}>Type</label>
            <select value={form.asset_type} onChange={set('asset_type')} className={inp}>
              {EQUIPMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className={lbl}>Status</label>
            <select value={form.status} onChange={set('status')} className={inp}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Condition */}
          <div>
            <label className={lbl}>Condition</label>
            <select value={form.condition_rating} onChange={set('condition_rating')} className={inp}>
              <option value="">— select —</option>
              {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Make / Model / Serial */}
          <div>
            <label className={lbl}>Make</label>
            <input value={form.make} onChange={set('make')} className={inp} placeholder="e.g. Makita" />
          </div>
          <div>
            <label className={lbl}>Model</label>
            <input value={form.model} onChange={set('model')} className={inp} placeholder="e.g. GA9020" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Serial number</label>
            <input value={form.serial_number} onChange={set('serial_number')} className={inp} placeholder="e.g. SN123456" />
          </div>

          {/* Owned / Hire */}
          <div>
            <label className={lbl}>Owned / Hire</label>
            <select value={form.purchase_or_hire} onChange={set('purchase_or_hire')} className={inp}>
              <option value="owned">Owned</option>
              <option value="hire">Hire</option>
            </select>
          </div>
          {form.purchase_or_hire === 'hire' && (
            <>
              <div>
                <label className={lbl}>Hire company</label>
                <input value={form.hire_company} onChange={set('hire_company')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Hire start</label>
                <input type="date" value={form.hire_start_date} onChange={set('hire_start_date')} className={inp} />
              </div>
              <div>
                <label className={lbl}>Hire end</label>
                <input type="date" value={form.hire_end_date} onChange={set('hire_end_date')} className={inp} />
              </div>
            </>
          )}

          {/* Location */}
          <div className="sm:col-span-2">
            <label className={lbl}>Current location</label>
            <input value={form.current_location} onChange={set('current_location')} className={inp} placeholder="e.g. Site office, Truck 4" />
          </div>

          {/* Divider */}
          <div className="sm:col-span-2 border-t border-slate-100 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Compliance</p>
          </div>

          <div>
            <label className={lbl}>Last inspection</label>
            <input type="date" value={form.last_inspection_date} onChange={set('last_inspection_date')} className={inp} />
          </div>
          <div>
            <label className={lbl}>Next inspection due</label>
            <input type="date" value={form.next_inspection_due} onChange={set('next_inspection_due')} className={inp} />
          </div>
          <div>
            <label className={lbl}>Calibration due</label>
            <input type="date" value={form.calibration_due} onChange={set('calibration_due')} className={inp} />
          </div>
          <div>
            <label className={lbl}>Certificate expiry</label>
            <input type="date" value={form.certificate_expiry} onChange={set('certificate_expiry')} className={inp} />
          </div>

          {/* Divider */}
          <div className="sm:col-span-2 border-t border-slate-100 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Service</p>
          </div>

          <div>
            <label className={lbl}>Last service</label>
            <input type="date" value={form.last_service_date} onChange={set('last_service_date')} className={inp} />
          </div>
          <div>
            <label className={lbl}>Next service</label>
            <input type="date" value={form.next_service_date} onChange={set('next_service_date')} className={inp} />
          </div>
          <div>
            <label className={lbl}>Service interval (days)</label>
            <input type="number" value={form.service_interval_days} onChange={set('service_interval_days')} className={inp} placeholder="e.g. 90" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Service notes</label>
            <textarea value={form.service_notes} onChange={set('service_notes')} rows={2} className={inp + ' resize-none'} />
          </div>

          {/* Divider */}
          <div className="sm:col-span-2 border-t border-slate-100 pt-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Purchase</p>
          </div>

          <div>
            <label className={lbl}>Purchase date</label>
            <input type="date" value={form.purchase_date} onChange={set('purchase_date')} className={inp} />
          </div>
          <div>
            <label className={lbl}>Purchase price ($)</label>
            <input type="number" value={form.purchase_price} onChange={set('purchase_price')} className={inp} placeholder="0.00" />
          </div>

          {/* Notes */}
          <div className="sm:col-span-2 border-t border-slate-100 pt-2">
            <label className={lbl}>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} className={inp + ' resize-none'} placeholder="Any additional notes..." />
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
          <button onClick={save} disabled={!form.name.trim() || saving}
            className="flex items-center gap-1.5 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EquipmentDetailPanel({
  assetId, onBack,
}: { assetId: number; onBack: () => void }) {
  const [eq, setEq] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Not found');
      const d = await r.json();
      setEq(d.asset);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [assetId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-20 text-slate-400">
      <Loader2 size={22} className="animate-spin mr-2" /> Loading...
    </div>
  );

  if (error || !eq) return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
      <AlertCircle size={28} />
      <p className="text-sm">{error || 'Equipment not found'}</p>
      <button onClick={onBack} className="text-xs text-orange-500 hover:underline">Go back</button>
    </div>
  );

  const typeInfo = EQUIPMENT_TYPES.find((x) => x.value === eq.asset_type);
  const TypeIcon = typeInfo?.icon ?? Package;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50">

      {/* ── Back bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors">
          <ChevronLeft size={14} /> Equipment
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">

        {/* ── Identity card ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
              <TypeIcon size={26} className="text-orange-500" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">{eq.name}</h1>
                {eq.asset_number && (
                  <span className="text-xs text-slate-400 font-mono"># {eq.asset_number}</span>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <TypeBadge type={eq.asset_type} />
                <StatusBadge status={eq.status} />
                {eq.purchase_or_hire === 'hire' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                    <Tag size={10} /> Hire
                  </span>
                )}
                {eq.condition_rating && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    {eq.condition_rating}
                  </span>
                )}
              </div>

              {/* Location / assignment chips */}
              <div className="flex flex-wrap gap-2 mt-3">
                {eq.current_location && <Chip icon={MapPin} label={eq.current_location} />}
                {eq.assigned_person_name && <Chip icon={User} label={eq.assigned_person_name} />}
                {eq.assigned_job_id && <Chip icon={Briefcase} label={`Job #${eq.assigned_job_id}`} />}
              </div>
            </div>
          </div>

          {/* Make / Model / Serial row */}
          {(eq.make || eq.model || eq.serial_number) && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3">
              {eq.make && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Make</p>
                  <p className="text-xs font-semibold text-slate-700">{eq.make}</p>
                </div>
              )}
              {eq.model && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Model</p>
                  <p className="text-xs font-semibold text-slate-700">{eq.model}</p>
                </div>
              )}
              {eq.serial_number && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Serial</p>
                  <p className="text-xs font-mono text-slate-700">{eq.serial_number}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Compliance card ── */}
        {(eq.next_inspection_due || eq.calibration_due || eq.certificate_expiry || eq.last_inspection_date) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Compliance</h2>
            <div className="flex flex-wrap gap-2">
              {eq.last_inspection_date && <Chip icon={Calendar} label={`Last inspection: ${fmt(eq.last_inspection_date)}`} />}
              {eq.next_inspection_due && <Chip icon={Calendar} label={`Next inspection: ${fmt(eq.next_inspection_due)}`} warn={isOverdue(eq.next_inspection_due)} />}
              {eq.calibration_due && <Chip icon={Wrench} label={`Calibration: ${fmt(eq.calibration_due)}`} warn={isOverdue(eq.calibration_due)} />}
              {eq.certificate_expiry && <Chip icon={Hash} label={`Certificate: ${fmt(eq.certificate_expiry)}`} warn={isOverdue(eq.certificate_expiry)} />}
            </div>
          </div>
        )}

        {/* ── Service card ── */}
        {(eq.last_service_date || eq.next_service_date || eq.service_notes) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Service</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {eq.last_service_date && <Chip icon={Wrench} label={`Last: ${fmt(eq.last_service_date)}`} />}
              {eq.next_service_date && <Chip icon={Wrench} label={`Next: ${fmt(eq.next_service_date)}`} warn={isOverdue(eq.next_service_date)} />}
              {eq.service_interval_days && <Chip icon={Calendar} label={`Every ${eq.service_interval_days} days`} />}
            </div>
            {eq.service_notes && (
              <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{eq.service_notes}</p>
            )}
          </div>
        )}

        {/* ── Notes card ── */}
        {eq.notes && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <StickyNote size={12} /> Notes
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{eq.notes}</p>
          </div>
        )}

        {/* ── Hire card ── */}
        {eq.purchase_or_hire === 'hire' && (eq.hire_company || eq.hire_start_date || eq.hire_end_date) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Hire details</h2>
            <div className="flex flex-wrap gap-2">
              {eq.hire_company && <Chip icon={Briefcase} label={eq.hire_company} />}
              {eq.hire_start_date && <Chip icon={Calendar} label={`From: ${fmt(eq.hire_start_date)}`} />}
              {eq.hire_end_date && <Chip icon={Calendar} label={`Until: ${fmt(eq.hire_end_date)}`} warn={isOverdue(eq.hire_end_date)} />}
            </div>
          </div>
        )}

      </div>

      {/* ── Floating action bar ── */}
      <div className="shrink-0 px-4 py-3 bg-white border-t border-slate-200 flex items-center gap-3">
        <button onClick={() => setShowAssign(true)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors">
          <User size={14} /> Assign
        </button>
        <button onClick={() => setShowEdit(true)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
          <Edit2 size={14} /> Edit
        </button>
      </div>

      {/* ── Modals ── */}
      {showAssign && (
        <AssignModal assetId={assetId} onClose={() => setShowAssign(false)} onSaved={load} />
      )}
      {showEdit && eq && (
        <EditModal eq={eq} onClose={() => setShowEdit(false)} onSaved={load} />
      )}
    </div>
  );
}
