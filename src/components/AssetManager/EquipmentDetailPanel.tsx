/**
 * EquipmentDetailPanel
 * Full-screen detail view for a single equipment/tool/plant/hire item.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Loader2, AlertCircle, Edit2, Check, X,
  MapPin, Wrench, Package, Briefcase, FileText, DollarSign,
  Image, Link2, Tag, Truck, User, Container, Car,
  ChevronDown,
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
  created_at: string;
  updated_at: string | null;
}

type Tab = 'overview' | 'inspections' | 'defects' | 'service' | 'documents' | 'photos' | 'jobs' | 'costs' | 'notes';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',    label: 'Overview',     icon: Package },
  { id: 'inspections', label: 'Inspections',  icon: FileText },
  { id: 'defects',     label: 'Defects',      icon: FileText },
  { id: 'service',     label: 'Service',      icon: Wrench },
  { id: 'documents',   label: 'Documents',    icon: FileText },
  { id: 'photos',      label: 'Photos',       icon: Image },
  { id: 'jobs',        label: 'Linked Jobs',  icon: Link2 },
  { id: 'costs',       label: 'Costs',        icon: DollarSign },
  { id: 'notes',       label: 'Notes',        icon: FileText },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(d: string | null) {
  return !!d && new Date(d) < new Date();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active:        'bg-emerald-100 text-emerald-700',
    'in-use':      'bg-blue-100 text-blue-700',
    'under-repair':'bg-amber-100 text-amber-700',
    retired:       'bg-slate-100 text-slate-500',
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

// ── Info row ──────────────────────────────────────────────────────────────────

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 shrink-0 w-36">{label}</span>
      <span className={`text-xs font-medium text-right ${warn ? 'text-red-500' : 'text-slate-700'}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ── Assign modal ──────────────────────────────────────────────────────────────

const ASSIGN_TYPES = [
  { id: 'container', label: 'Container', icon: Container,  color: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200' },
  { id: 'car',       label: 'Car',       icon: Car,        color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200' },
  { id: 'truck',     label: 'Truck',     icon: Truck,      color: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200' },
  { id: 'person',    label: 'Person',    icon: User,       color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' },
  { id: 'job',       label: 'Job',       icon: Briefcase,  color: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200' },
];

function AssignModal({ assetId, current, onClose, onSaved }: {
  assetId: number;
  current: { person?: string | null; jobId?: number | null };
  onClose: () => void;
  onSaved: () => void;
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Assign to</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-5 gap-2">
          {ASSIGN_TYPES.map(({ id, label, icon: Icon, color }) => (
            <button key={id} onClick={() => { setType(id); setValue(''); }}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all ${
                type === id ? 'ring-2 ring-orange-500 ring-offset-1 ' + color : color
              }`}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Value input */}
        {type && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500">
              {type === 'person' ? 'Person name' :
               type === 'job'    ? 'Job number or name' :
               `${type.charAt(0).toUpperCase() + type.slice(1)} name / ID`}
            </label>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={
                type === 'person' ? 'e.g. John Smith' :
                type === 'job'    ? 'e.g. 1042' :
                type === 'car'    ? 'e.g. ABC-123' :
                type === 'truck'  ? 'e.g. Truck 4 / 1TRK456' :
                'e.g. Container C3'
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
            />
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={!type || !value.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit field ────────────────────────────────────────────────────────────────

function EditableField({ label, value, field, onSave }: {
  label: string; value: string; field: string; onSave: (f: string, v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(field, val);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 py-2 border-b border-slate-100">
        <span className="text-xs text-slate-400 shrink-0 w-36">{label}</span>
        <input value={val} onChange={(e) => setVal(e.target.value)} autoFocus
          className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400" />
        <button onClick={save} disabled={saving}
          className="p-1 text-emerald-600 hover:text-emerald-700">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button onClick={() => { setEditing(false); setVal(value); }}
          className="p-1 text-slate-400 hover:text-slate-600"><X size={12} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 last:border-0 group">
      <span className="text-xs text-slate-400 shrink-0 w-36">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-slate-700">{value || '—'}</span>
        <button onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-orange-500 transition-all">
          <Edit2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Placeholder tab ───────────────────────────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Package size={28} className="mb-2 opacity-40" />
      <p className="text-sm">{label} — coming soon</p>
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
  const [tab, setTab] = useState<Tab>('overview');
  const [showAssign, setShowAssign] = useState(false);

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

  async function patch(field: string, value: string) {
    await fetch(`/api/asset-manager/assets/${assetId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    });
    load();
  }

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
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Back bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors">
          <ChevronLeft size={14} /> Equipment
        </button>
      </div>

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            <TypeIcon size={20} className="text-orange-500" />
          </div>          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-slate-900">{eq.name}</h1>
              {eq.asset_number && (
                <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                  {eq.asset_number}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <TypeBadge type={eq.asset_type} />
              <StatusBadge status={eq.status} />
              {eq.purchase_or_hire === 'hire' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                  <Tag size={10} /> Hire
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-400">
              {eq.current_location && (
                <span className="flex items-center gap-1"><MapPin size={11} />{eq.current_location}</span>
              )}
              {eq.assigned_person_name && (
                <span className="flex items-center gap-1">👤 {eq.assigned_person_name}</span>
              )}
              {eq.assigned_job_id && (
                <span className="flex items-center gap-1"><Briefcase size={11} />Job #{eq.assigned_job_id}</span>
              )}
            </div>
          </div>

          {/* Assign button */}
          <button
            onClick={() => setShowAssign(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors shrink-0 self-start"
          >
            <ChevronDown size={13} className="-rotate-90" />
            Assign
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-0.5 px-4 border-b border-slate-200 bg-white overflow-x-auto shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              tab === id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && <OverviewTab eq={eq} onPatch={patch} />}
        {tab === 'inspections' && <PlaceholderTab label="Inspections" />}
        {tab === 'defects'     && <PlaceholderTab label="Defects" />}
        {tab === 'service'     && <ServiceTab eq={eq} onPatch={patch} />}
        {tab === 'documents'   && <PlaceholderTab label="Documents" />}
        {tab === 'photos'      && <PlaceholderTab label="Photos" />}
        {tab === 'jobs'        && <PlaceholderTab label="Linked Jobs" />}
        {tab === 'costs'       && <PlaceholderTab label="Costs" />}
        {tab === 'notes'       && <PlaceholderTab label="Notes" />}
      </div>

      {/* ── Assign modal ── */}
      {showAssign && (
        <AssignModal
          assetId={assetId}
          current={{ person: eq.assigned_person_name, jobId: eq.assigned_job_id }}
          onClose={() => setShowAssign(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ eq, onPatch }: { eq: Equipment; onPatch: (f: string, v: string) => Promise<void> }) {
  return (
    <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* Overview card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Overview</h3>
        <EditableField label="Make"         value={eq.make ?? ''}          field="make"         onSave={onPatch} />
        <EditableField label="Model"        value={eq.model ?? ''}         field="model"        onSave={onPatch} />
        <EditableField label="Serial No."   value={eq.serial_number ?? ''} field="serial_number" onSave={onPatch} />
        <Row label="Owned / Hire"  value={eq.purchase_or_hire === 'hire' ? `Hire${eq.hire_company ? ` — ${eq.hire_company}` : ''}` : 'Owned'} />
        {eq.purchase_or_hire === 'hire' && (
          <>
            <Row label="Hire start" value={fmt(eq.hire_start_date)} />
            <Row label="Hire end"   value={fmt(eq.hire_end_date)} warn={isOverdue(eq.hire_end_date)} />
          </>
        )}
        <EditableField label="Condition"    value={eq.condition_rating ?? ''} field="condition_rating" onSave={onPatch} />
        <Row label="Created"    value={fmt(eq.created_at)} />
        <Row label="Updated"    value={fmt(eq.updated_at)} />
      </div>

      {/* Compliance card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Compliance</h3>
        <Row label="Last inspection"  value={fmt(eq.last_inspection_date)} />
        <Row label="Next inspection"  value={fmt(eq.next_inspection_due)}  warn={isOverdue(eq.next_inspection_due)} />
        <Row label="Calibration due"  value={fmt(eq.calibration_due)}      warn={isOverdue(eq.calibration_due)} />
        <Row label="Certificate exp." value={fmt(eq.certificate_expiry)}   warn={isOverdue(eq.certificate_expiry)} />
        <Row label="Open defects"     value="—" />
      </div>

    </div>
  );
}

// ── Service tab ───────────────────────────────────────────────────────────────

function ServiceTab({ eq, onPatch }: { eq: Equipment; onPatch: (f: string, v: string) => Promise<void> }) {
  return (
    <div className="p-4 md:p-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-lg">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Service</h3>
        <Row label="Last service"    value={fmt(eq.last_service_date)} />
        <Row label="Next service"    value={fmt(eq.next_service_date)} warn={isOverdue(eq.next_service_date)} />
        <Row label="Interval (days)" value={eq.service_interval_days ? String(eq.service_interval_days) : null} />
        <EditableField label="Service notes" value={eq.service_notes ?? ''} field="service_notes" onSave={onPatch} />
      </div>
    </div>
  );
}
