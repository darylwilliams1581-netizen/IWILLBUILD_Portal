/**
 * OwnerUsageTab — Platform owner view of all company usage.
 * Shows per-company: plan, users, jobs, photos, storage, fleet.
 * Highlights warnings (>80%) and blocked (100%) in red/amber.
 * Allows setting custom limits per company.
 */
import { useState, useEffect } from 'react';
import {
  Loader2, RefreshCw, AlertTriangle, XCircle, CheckCircle2,
  Settings2, Save, X, Users, Briefcase, Image, HardDrive,
  Truck, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyUsage {
  id: number;
  name: string;
  plan: string;
  subscriptionStatus: string;
  users: number;
  usersLimit: number;
  activeJobs: number;
  activeJobsLimit: number;
  photos: number;
  photosLimit: number;
  files: number;
  fileBytes: number;
  storageLimitBytes: number;
  fleet: number;
  fleetLimit: number;
  formTemplates: number;
  costGuide: number;
  lastLogin: string | null;
  usagePcts: Record<string, number>;
  hasWarning: boolean;
  hasBlocked: boolean;
  createdAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function planLabel(p: string): string {
  const m: Record<string, string> = { trial: 'Trial', solo: 'Solo', team: 'Team', business: 'Business', pro: 'Business', enterprise: 'Enterprise', owner: 'Owner' };
  return m[p] ?? p;
}

function PctBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

// ── Custom limits modal ───────────────────────────────────────────────────────

const GB = 1024 * 1024 * 1024;

function CustomLimitsModal({
  company,
  onClose,
  onSaved,
}: {
  company: CompanyUsage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [limits, setLimits] = useState({
    users:          company.usersLimit,
    activeJobs:     company.activeJobsLimit,
    totalPhotos:    company.photosLimit,
    storageBytes:   company.storageLimitBytes,
    fleetAssets:    company.fleetLimit,
    formTemplates:  company.formTemplates,
    costGuideItems: company.costGuide,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/owner-console/companies/${company.id}/limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ limits }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? 'Save failed'); return; }
      onSaved();
      onClose();
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const storageGB = (limits.storageBytes / GB).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-heading font-black text-base text-slate-900">Custom Limits</h3>
            <p className="text-xs text-slate-500 mt-0.5">{company.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {[
            { key: 'users' as const,          label: 'Users',            icon: Users },
            { key: 'activeJobs' as const,      label: 'Active Jobs',      icon: Briefcase },
            { key: 'totalPhotos' as const,     label: 'Total Photos',     icon: Image },
            { key: 'fleetAssets' as const,     label: 'Fleet Assets',     icon: Truck },
          ].map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3">
              <Icon size={14} className="text-slate-400 shrink-0" />
              <label className="text-sm font-medium text-slate-700 w-32 shrink-0">{label}</label>
              <input
                type="number"
                min={0}
                value={limits[key]}
                onChange={e => setLimits(l => ({ ...l, [key]: Number(e.target.value) }))}
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          ))}

          {/* Storage in GB */}
          <div className="flex items-center gap-3">
            <HardDrive size={14} className="text-slate-400 shrink-0" />
            <label className="text-sm font-medium text-slate-700 w-32 shrink-0">Storage (GB)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={parseFloat(storageGB)}
              onChange={e => setLimits(l => ({ ...l, storageBytes: Math.round(Number(e.target.value) * GB) }))}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-orange-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Limits
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OwnerUsageTab() {
  const [companies, setCompanies] = useState<CompanyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCompany, setEditingCompany] = useState<CompanyUsage | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/owner-console/companies/usage', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { companies: CompanyUsage[] };
      setCompanies(data.companies ?? []);
    } catch {
      setError('Could not load company usage data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="shrink-0" /> {error}
      </div>
    );
  }

  const warnings = companies.filter(c => c.hasWarning || c.hasBlocked);

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">Company Usage</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {companies.length} {companies.length === 1 ? 'company' : 'companies'}
            {warnings.length > 0 && ` · ${warnings.length} with warnings`}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Warning summary */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-amber-800 mb-1">
            {warnings.filter(c => c.hasBlocked).length} blocked · {warnings.filter(c => c.hasWarning && !c.hasBlocked).length} near limit
          </p>
          <p className="text-xs text-amber-700">
            {warnings.map(c => c.name).join(', ')}
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Plan</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Users</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jobs</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Photos</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Storage</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fleet</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Last Login</th>
                <th className="text-right px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => {
                const isExpanded = expandedId === c.id;
                return (
                  <>
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50 transition-colors ${c.hasBlocked ? 'bg-red-50/30' : c.hasWarning ? 'bg-amber-50/20' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {c.hasBlocked
                            ? <XCircle size={13} className="text-red-500 shrink-0" />
                            : c.hasWarning
                            ? <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                            : <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                          }
                          <span className="font-semibold text-slate-800">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {planLabel(c.plan)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold ${(c.usagePcts.users ?? 0) >= 100 ? 'text-red-600' : (c.usagePcts.users ?? 0) >= 80 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {c.users}/{c.usersLimit}
                          </span>
                          <PctBar pct={c.usagePcts.users ?? 0} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold ${(c.usagePcts.jobs ?? 0) >= 100 ? 'text-red-600' : (c.usagePcts.jobs ?? 0) >= 80 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {c.activeJobs}/{c.activeJobsLimit}
                          </span>
                          <PctBar pct={c.usagePcts.jobs ?? 0} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold ${(c.usagePcts.photos ?? 0) >= 100 ? 'text-red-600' : (c.usagePcts.photos ?? 0) >= 80 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {c.photos.toLocaleString()}/{c.photosLimit.toLocaleString()}
                          </span>
                          <PctBar pct={c.usagePcts.photos ?? 0} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold ${(c.usagePcts.storage ?? 0) >= 100 ? 'text-red-600' : (c.usagePcts.storage ?? 0) >= 80 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {fmtBytes(c.fileBytes)}
                          </span>
                          <PctBar pct={c.usagePcts.storage ?? 0} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold ${(c.usagePcts.fleet ?? 0) >= 100 ? 'text-red-600' : (c.usagePcts.fleet ?? 0) >= 80 ? 'text-amber-600' : 'text-slate-700'}`}>
                            {c.fleet}/{c.fleetLimit}
                          </span>
                          <PctBar pct={c.usagePcts.fleet ?? 0} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{fmtDate(c.lastLogin)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingCompany(c)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                            title="Set custom limits"
                          >
                            <Settings2 size={11} /> Limits
                          </button>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : c.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${c.id}-expanded`} className="bg-slate-50/50">
                        <td colSpan={9} className="px-5 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div><span className="text-slate-400">Files:</span> <span className="font-semibold text-slate-700">{c.files}</span></div>
                            <div><span className="text-slate-400">Form Templates:</span> <span className="font-semibold text-slate-700">{c.formTemplates}</span></div>
                            <div><span className="text-slate-400">Cost Guide Items:</span> <span className="font-semibold text-slate-700">{c.costGuide}</span></div>
                            <div><span className="text-slate-400">Subscription:</span> <span className="font-semibold text-slate-700 capitalize">{c.subscriptionStatus}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom limits modal */}
      {editingCompany && (
        <CustomLimitsModal
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
