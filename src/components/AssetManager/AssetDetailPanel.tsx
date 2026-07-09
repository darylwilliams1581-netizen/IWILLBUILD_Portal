/**
 * AssetDetailPanel
 *
 * Full-screen detail view for a single asset — mirrors the Jobs detail pattern.
 * Tabs: Overview | Inspections | Defects | Tenders | Documents
 *
 * Opened by clicking an asset row in AMAssetsTab.
 * Receives assetId as a prop; fetches its own data.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Building2, ChevronLeft, ClipboardCheck, AlertTriangle,
  FileText, Edit2, Check, X, Loader2, AlertCircle,
  Calendar, MapPin, Tag, Activity, Plus, Paperclip, Download,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Asset {
  id: number; name: string; acronym: string | null; address: string | null;
  asset_type: string; status: string; created_at: string; updated_at: string | null;
  archived_at: string | null;
}

interface Inspection {
  id: number;
  report_title: string | null;
  report_no: string | null;
  inspection_date: string | null;
  overall_status: string;
  notes: string | null;
  asset_name: string;
  asset_acronym: string | null;
  created_at: string;
}

interface Defect {
  id: number; title: string; severity: string; status: string;
  description: string | null; location: string | null;
  inspection_id: number | null; due_date: string | null;
  created_at: string; archived_at: string | null;
}

interface Tender {
  id: number;
  code: string | null;
  contractor_name: string | null;
  award_status: string;
  quote_requested_at: string | null;
  quote_due_at: string | null;
  quote_amount: number | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    substation: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    building: 'bg-blue-100 text-blue-700 border-blue-200',
    facility: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    vehicle: 'bg-orange-100 text-orange-700 border-orange-200',
    equipment: 'bg-purple-100 text-purple-700 border-purple-200',
    infrastructure: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  const cls = colors[type] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>{type}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    inactive: 'bg-slate-100 text-slate-500 border-slate-200',
    decommissioned: 'bg-red-100 text-red-600 border-red-200',
    open: 'bg-red-100 text-red-600 border-red-200',
    'in-progress': 'bg-amber-100 text-amber-700 border-amber-200',
    resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    closed: 'bg-slate-100 text-slate-500 border-slate-200',
    draft: 'bg-slate-100 text-slate-500 border-slate-200',
    submitted: 'bg-blue-100 text-blue-700 border-blue-200',
    awarded: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    cancelled: 'bg-red-100 text-red-600 border-red-200',
    scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
    passed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    failed: 'bg-red-100 text-red-600 border-red-200',
  };
  const cls = colors[status] ?? 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls} capitalize`}>{status}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  const cls = colors[severity] ?? 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls} capitalize`}>{severity}</span>;
}

function fmt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  asset, onEdit,
}: {
  asset: Asset;
  onEdit: () => void;
}) {
  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      {/* Details card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Asset Details</h3>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Edit2 size={12} />
            Edit
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="px-5 py-4 flex flex-col gap-4">
            <DetailRow icon={<Tag size={13} />} label="Asset Type">
              <TypeBadge type={asset.asset_type} />
            </DetailRow>
            <DetailRow icon={<Activity size={13} />} label="Status">
              <StatusBadge status={asset.status} />
            </DetailRow>
            {asset.acronym && (
              <DetailRow icon={<Tag size={13} />} label="Acronym">
                <span className="text-sm font-mono text-slate-700">{asset.acronym}</span>
              </DetailRow>
            )}
          </div>
          <div className="px-5 py-4 flex flex-col gap-4">
            {asset.address && (
              <DetailRow icon={<MapPin size={13} />} label="Address / Location">
                <span className="text-sm text-slate-700">{asset.address}</span>
              </DetailRow>
            )}
            <DetailRow icon={<Calendar size={13} />} label="Created">
              <span className="text-sm text-slate-700">{fmt(asset.created_at)}</span>
            </DetailRow>
            {asset.updated_at && (
              <DetailRow icon={<Calendar size={13} />} label="Last Updated">
                <span className="text-sm text-slate-700">{fmt(asset.updated_at)}</span>
              </DetailRow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-5 h-5 rounded flex items-center justify-center text-slate-400 shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

const ASSET_TYPES = ['substation', 'building', 'facility', 'vehicle', 'equipment', 'infrastructure', 'other'];
const STATUS_OPTS = ['active', 'inactive', 'decommissioned'];

function EditForm({ asset, onSave, onCancel }: {
  asset: Asset;
  onSave: (data: Partial<Asset>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: asset.name,
    acronym: asset.acronym ?? '',
    address: asset.address ?? '',
    asset_type: asset.asset_type,
    status: asset.status,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-bold text-slate-800">Edit Asset</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
            <input value={form.name} onChange={set('name')}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Acronym</label>
            <input value={form.acronym} onChange={set('acronym')}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Address / Location</label>
            <input value={form.address} onChange={set('address')}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Asset Type</label>
            <select value={form.asset_type} onChange={set('asset_type')}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30">
              {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
            <select value={form.status} onChange={set('status')}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30">
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end pt-1">
          <button onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
          <button onClick={() => void submit()} disabled={saving || !form.name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inspections tab ───────────────────────────────────────────────────────────

function InspectionsTab({ assetId }: { assetId: number }) {
  const [items, setItems] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/asset-manager/inspections?assetId=${assetId}&status=active`, { credentials: 'include' })
      .then(r => r.json() as Promise<{ inspections?: Inspection[] }>)
      .then(d => setItems(d.inspections ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return <TabLoader />;

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">{items.length} Inspection{items.length !== 1 ? 's' : ''}</h3>
        <a
          href={`/studio/asset-manager?tab=inspections&assetId=${assetId}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Plus size={12} />
          New Inspection
        </a>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={28} />} label="No inspections yet" sub="Create an inspection from the Inspections tab" />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(insp => (
            <div key={insp.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 hover:border-orange-200 hover:shadow-sm transition-all">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <ClipboardCheck size={14} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800">
                    {insp.report_title || insp.report_no || `Inspection #${insp.id}`}
                  </span>
                  <StatusBadge status={insp.overall_status} />
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {insp.report_no && <span className="text-xs font-mono text-slate-400">{insp.report_no}</span>}
                  {insp.inspection_date && <span className="text-xs text-slate-400">{fmt(insp.inspection_date)}</span>}
                  {insp.notes && <span className="text-xs text-slate-400 italic truncate max-w-[200px]">{insp.notes}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Defects tab ───────────────────────────────────────────────────────────────

function DefectsTab({ assetId }: { assetId: number }) {
  const [items, setItems] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/asset-manager/defects?assetId=${assetId}`, { credentials: 'include' })
      .then(r => r.json() as Promise<{ defects?: Defect[] }>)
      .then(d => setItems(d.defects ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return <TabLoader />;

  const open = items.filter(d => d.status === 'open' || d.status === 'in_progress');

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-bold text-slate-700">{items.length} Defect{items.length !== 1 ? 's' : ''}</h3>
        {open.length > 0 && (
          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full border border-red-200">
            {open.length} open
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={28} />} label="No defects recorded" sub="Defects are created during inspections" />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(defect => (
            <div key={defect.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 hover:border-orange-200 hover:shadow-sm transition-all">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                defect.status === 'open' ? 'bg-red-50 border border-red-100' :
                defect.status === 'in_progress' ? 'bg-amber-50 border border-amber-100' :
                'bg-emerald-50 border border-emerald-100'
              }`}>
                <AlertTriangle size={14} className={
                  defect.status === 'open' ? 'text-red-500' :
                  defect.status === 'in_progress' ? 'text-amber-500' :
                  'text-emerald-500'
                } />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800">{defect.title}</span>
                  <SeverityBadge severity={defect.severity} />
                  <StatusBadge status={defect.status} />
                </div>
                {defect.description && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{defect.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {defect.location && <span className="text-xs text-slate-400">📍 {defect.location}</span>}
                  {defect.due_date && <span className="text-xs text-amber-600">Due {fmt(defect.due_date)}</span>}
                  <span className="text-xs text-slate-400">Logged {fmt(defect.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Attachment mini-list (read-only, used in AssetDetailPanel TendersTab) ─────

interface AttachmentItem {
  id: number; original_name: string; stored_name: string;
  mime_type: string | null; size_bytes: number; created_at: string;
  url: string; sizeLabel: string;
}

function AttachmentMiniList({ tenderId }: { tenderId: number }) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/asset-manager/tenders/${tenderId}/attachments`, { credentials: 'include' })
      .then(r => r.json() as Promise<{ attachments?: AttachmentItem[] }>)
      .then(d => setItems(d.attachments ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tenderId]);

  if (loading) return (
    <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-2 text-xs text-slate-400">
      <Loader2 size={11} className="animate-spin" />Loading files…
    </div>
  );

  if (!items.length) return null;

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 flex flex-col gap-1">
      {items.map(att => (
        <div key={att.id} className="flex items-center gap-2">
          <Paperclip size={11} className="text-slate-400 shrink-0" />
          <span className="text-xs text-slate-600 truncate flex-1">{att.original_name}</span>
          <span className="text-[10px] text-slate-400">{att.sizeLabel}</span>
          <a
            href={att.url}
            download={att.original_name}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-orange-500 transition-colors"
            title="Download"
          >
            <Download size={12} />
          </a>
        </div>
      ))}
    </div>
  );
}

// ── Tenders tab ───────────────────────────────────────────────────────────────

function TendersTab({ assetId }: { assetId: number }) {
  const [items, setItems] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [attachCounts, setAttachCounts] = useState<Record<number, number>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/asset-manager/tenders?assetId=${assetId}`, { credentials: 'include' })
      .then(r => r.json() as Promise<{ tenders?: Tender[] }>)
      .then(d => setItems(d.tenders ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [assetId]);

  // Fetch attachment counts for each tender once list loads
  useEffect(() => {
    if (!items.length) return;
    const counts: Record<number, number> = {};
    Promise.all(
      items.map(t =>
        fetch(`/api/asset-manager/tenders/${t.id}/attachments`, { credentials: 'include' })
          .then(r => r.json() as Promise<{ attachments?: unknown[] }>)
          .then(d => { counts[t.id] = (d.attachments ?? []).length; })
          .catch(() => { counts[t.id] = 0; })
      )
    ).then(() => setAttachCounts({ ...counts }));
  }, [items]);

  if (loading) return <TabLoader />;

  const AWARD_COLORS: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    requested: 'bg-blue-100 text-blue-700 border-blue-200',
    submitted: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    awarded: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    lost: 'bg-red-100 text-red-700 border-red-200',
    withdrawn: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return (
    <div className="p-6 flex flex-col gap-4">
      <h3 className="text-sm font-bold text-slate-700">{items.length} Tender{items.length !== 1 ? 's' : ''}</h3>

      {items.length === 0 ? (
        <EmptyState icon={<FileText size={28} />} label="No tenders yet" sub="Tenders are created from the Tenders tab" />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(tender => (
            <div key={tender.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-orange-200 hover:shadow-sm transition-all">
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {tender.code && <span className="text-xs font-mono text-slate-400">{tender.code}</span>}
                    <span className="text-sm font-semibold text-slate-800">
                      {tender.contractor_name || 'No contractor assigned'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${AWARD_COLORS[tender.award_status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {tender.award_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {tender.quote_amount != null && (
                      <span className="text-xs text-slate-500 font-semibold">
                        ${Number(tender.quote_amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    {tender.quote_due_at && (
                      <span className="text-xs text-slate-400">Due {fmt(tender.quote_due_at)}</span>
                    )}
                    {tender.award_status === 'awarded' && tender.contractor_name && (
                      <span className="text-xs text-emerald-600 font-medium">Awarded to {tender.contractor_name}</span>
                    )}
                    {/* Attachment count badge */}
                    {(attachCounts[tender.id] ?? 0) > 0 && (
                      <button
                        onClick={() => setExpandedId(prev => prev === tender.id ? null : tender.id)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-500 transition-colors"
                      >
                        <Paperclip size={11} />
                        {attachCounts[tender.id]} file{attachCounts[tender.id] !== 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {/* Inline attachment list when expanded */}
              {expandedId === tender.id && (
                <AttachmentMiniList tenderId={tender.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function TabLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-slate-400" />
    </div>
  );
}

function EmptyState({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-slate-300 mb-3">{icon}</div>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'inspections' | 'defects' | 'tenders';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',    label: 'Overview',    icon: <Building2 size={13} /> },
  { id: 'inspections', label: 'Inspections', icon: <ClipboardCheck size={13} /> },
  { id: 'defects',     label: 'Defects',     icon: <AlertTriangle size={13} /> },
  { id: 'tenders',     label: 'Tenders',     icon: <FileText size={13} /> },
];

interface Props {
  assetId: number;
  onBack: () => void;
  onAssetUpdated?: (asset: Asset) => void;
}

export default function AssetDetailPanel({ assetId, onBack, onAssetUpdated }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);

  const loadAsset = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Not found');
      const d = await r.json() as { asset: Asset };
      setAsset(d.asset);
    } catch {
      setError('Failed to load asset');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { void loadAsset(); }, [loadAsset]);

  async function handleSave(data: Partial<Asset>) {
    const r = await fetch(`/api/asset-manager/assets/${assetId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (r.ok) {
      const d = await r.json() as { asset: Asset };
      setAsset(d.asset);
      onAssetUpdated?.(d.asset);
      setEditing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm font-semibold text-slate-600">{error || 'Asset not found'}</p>
        <button onClick={onBack} className="text-xs text-orange-500 hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ChevronLeft size={14} />
            Assets
          </button>
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Building2 size={18} className="text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 leading-tight">{asset.name}</h2>
              {asset.acronym && <span className="text-sm text-slate-400 font-mono">({asset.acronym})</span>}
              <TypeBadge type={asset.asset_type} />
              <StatusBadge status={asset.status} />
            </div>
            {asset.address && (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <MapPin size={10} />
                {asset.address}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 flex items-center gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setEditing(false); }}
            className={[
              'flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
              tab === t.id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto bg-[#F4F5F7]">
        {tab === 'overview' && !editing && (
          <OverviewTab asset={asset} onEdit={() => setEditing(true)} />
        )}
        {tab === 'overview' && editing && (
          <EditForm asset={asset} onSave={handleSave} onCancel={() => setEditing(false)} />
        )}
        {tab === 'inspections' && <InspectionsTab assetId={assetId} />}
        {tab === 'defects'     && <DefectsTab assetId={assetId} />}
        {tab === 'tenders'     && <TendersTab assetId={assetId} />}
      </div>
    </div>
  );
}
