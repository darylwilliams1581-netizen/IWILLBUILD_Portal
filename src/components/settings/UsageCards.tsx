/**
 * UsageCards — Plan usage overview component.
 * Shows used/limit, percentage bar, warning at 80%, blocked at 100%.
 * Used in Settings → Data & Backup and Dashboard.
 */
import { useEffect, useState } from 'react';
import {
  Users, Briefcase, Image, HardDrive, BookOpen,
  ClipboardList, Truck, Loader2, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageItem {
  key: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
  pct: number;
  warning: boolean;
  blocked: boolean;
}

interface UsageData {
  plan: string;
  usage: {
    users: number;
    activeJobs: number;
    archivedJobs: number;
    totalPhotos: number;
    photoStorageBytes: number;
    fileCount: number;
    fileStorageBytes: number;
    totalStorageBytes: number;
    costGuideItems: number;
    formTemplates: number;
    fleetAssets: number;
    completedForms: number;
  };
  items: UsageItem[];
  warnings: string[];
  hasWarnings: boolean;
  hasBlocked: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtUsed(item: UsageItem): string {
  if (item.unit === 'bytes') return fmtBytes(item.used);
  return item.used.toLocaleString();
}

function fmtLimit(item: UsageItem): string {
  if (item.unit === 'bytes') return fmtBytes(item.limit);
  return item.limit.toLocaleString();
}

const ICONS: Record<string, React.ElementType> = {
  users:          Users,
  activeJobs:     Briefcase,
  totalPhotos:    Image,
  storage:        HardDrive,
  costGuideItems: BookOpen,
  formTemplates:  ClipboardList,
  fleetAssets:    Truck,
};

function barColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 80)  return 'bg-amber-500';
  return 'bg-emerald-500';
}

function cardBorder(item: UsageItem): string {
  if (item.blocked) return 'border-red-200 bg-red-50/30';
  if (item.warning) return 'border-amber-200 bg-amber-50/20';
  return 'border-slate-200 bg-white';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UsageCards({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/usage', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load usage');
      setData(await res.json() as UsageData);
    } catch {
      setError('Could not load usage data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={22} className="animate-spin text-violet-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="shrink-0" />
        {error || 'No usage data available.'}
      </div>
    );
  }

  const planLabel = (p: string) => {
    const m: Record<string, string> = { trial: 'Free Trial', solo: 'Solo', team: 'Team', business: 'Business', pro: 'Business', enterprise: 'Enterprise', owner: 'Platform Developer' };
    return m[p] ?? p;
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Plan Usage</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Current plan: <span className="font-semibold text-slate-700">{planLabel(data.plan)}</span>
            {' · '}
            {data.usage.archivedJobs} archived job{data.usage.archivedJobs !== 1 ? 's' : ''}
            {' · '}
            {data.usage.completedForms} completed form{data.usage.completedForms !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={load}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors"
          title="Refresh usage"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Warning / blocked banners */}
      {data.hasBlocked && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">Plan limit reached</p>
            <p className="text-xs text-red-700 mt-0.5">
              One or more limits are at 100%. New items cannot be created until you upgrade or remove existing ones.
            </p>
          </div>
        </div>
      )}
      {!data.hasBlocked && data.hasWarnings && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Usage above 80%</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {data.warnings.join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Usage grid */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
        {data.items.map((item) => {
          const Icon = ICONS[item.key] ?? CheckCircle2;
          return (
            <div
              key={item.key}
              className={`rounded-xl border p-4 ${cardBorder(item)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={13} className={item.blocked ? 'text-red-500' : item.warning ? 'text-amber-500' : 'text-slate-400'} />
                  <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                </div>
                {item.blocked && <XCircle size={12} className="text-red-500 shrink-0" />}
                {!item.blocked && item.warning && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
              </div>

              {/* Bar */}
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor(item.pct)}`}
                  style={{ width: `${Math.min(100, item.pct)}%` }}
                />
              </div>

              <div className="flex items-baseline justify-between">
                <span className={`text-sm font-bold ${item.blocked ? 'text-red-700' : item.warning ? 'text-amber-700' : 'text-slate-800'}`}>
                  {fmtUsed(item)}
                </span>
                <span className="text-xs text-slate-400">
                  / {fmtLimit(item)} · {item.pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Storage breakdown */}
      {!compact && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Storage Breakdown</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Photo Storage', value: fmtBytes(data.usage.photoStorageBytes) },
              { label: 'File Storage', value: fmtBytes(data.usage.fileStorageBytes) },
              { label: 'Total Storage', value: fmtBytes(data.usage.totalStorageBytes) },
              { label: 'Files Uploaded', value: data.usage.fileCount.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
