/**
 * SystemStorageTab — Platform-wide storage monitoring for the Owner Console.
 *
 * Shows:
 *  - Platform summary cards (total storage, files, photos, companies)
 *  - Storage breakdown donut-style bar
 *  - Per-company table with status indicators
 *  - Top 10 companies by storage
 *  - Top 10 largest files
 *  - Top 10 jobs by storage
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, RefreshCw, AlertTriangle, XCircle, CheckCircle2,
  HardDrive, Image, FileText, Shield, Building2, ChevronDown,
  ChevronUp, Database, FolderOpen, Camera, Layers,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Platform {
  totalBytes: number;
  totalFiles: number;
  totalFileCount: number;
  totalPhotoCount: number;
  totalSafetyDocCount: number;
  totalSafePosterCount: number;
  totalCompanies: number;
  companiesWithStorage: number;
  warningCount: number;
  overCount: number;
  blockedCount: number;
  breakdown: {
    fileBytes: number;
    photoBytes: number;
    safetyDocBytes: number;
    safetyPosterBytes: number;
  };
}

interface CompanyStorage {
  id: number;
  name: string;
  plan: string;
  fileBytes: number;
  fileCount: number;
  photoBytes: number;
  photoCount: number;
  safetyBytes: number;
  totalBytes: number;
  totalFiles: number;
  storageLimitBytes: number;
  pct: number;
  status: 'ok' | 'warning' | 'over' | 'blocked';
  lastUpload: string | null;
}

interface TopFile {
  id: number;
  company_id: number;
  company_name: string;
  original_name: string;
  size_bytes: number;
  mime_type: string;
  file_category: string | null;
  created_at: string;
  source: 'file' | 'photo';
}

interface TopJob {
  job_id: number;
  job_name: string;
  job_number: string | null;
  company_id: number;
  company_name: string;
  photo_bytes: number;
  file_bytes: number;
  photo_count: number;
  file_count: number;
  totalBytes: number;
  totalFiles: number;
}

interface StorageData {
  platform: Platform;
  companies: CompanyStorage[];
  topByStorage: CompanyStorage[];
  topFiles: TopFile[];
  topJobsByStorage: TopJob[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function planLabel(p: string): string {
  const m: Record<string, string> = {
    trial: 'Trial', solo: 'Solo', team: 'Team',
    business: 'Business', pro: 'Business', enterprise: 'Enterprise', owner: 'Owner',
  };
  return m[p] ?? p;
}

const STATUS_CONFIG = {
  ok:      { label: 'OK',       color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: CheckCircle2, bar: 'bg-emerald-500' },
  warning: { label: 'Warning',  color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   icon: AlertTriangle, bar: 'bg-amber-500' },
  over:    { label: 'Over 90%', color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200',  icon: AlertTriangle, bar: 'bg-orange-500' },
  blocked: { label: 'Blocked',  color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',     icon: XCircle,       bar: 'bg-red-500' },
};

function StatusBadge({ status }: { status: CompanyStorage['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

function PctBar({ pct, status }: { pct: number; status: CompanyStorage['status'] }) {
  const bar = STATUS_CONFIG[status].bar;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-[11px] font-bold tabular-nums ${STATUS_CONFIG[status].color}`}>{pct}%</span>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent ?? 'bg-slate-100'}`}>
        <Icon size={18} className={accent ? 'text-white' : 'text-slate-500'} />
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={15} className="text-orange-500 shrink-0" />
      <h3 className="font-heading font-black text-sm text-slate-800">{title}</h3>
      {count !== undefined && (
        <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

// ── Breakdown bar ─────────────────────────────────────────────────────────────

function BreakdownBar({ platform }: { platform: Platform }) {
  const total = platform.totalBytes || 1;
  const segments = [
    { label: 'Job Files',      bytes: platform.breakdown.fileBytes,        color: 'bg-blue-500' },
    { label: 'Job Photos',     bytes: platform.breakdown.photoBytes,       color: 'bg-orange-500' },
    { label: 'Safety Docs',    bytes: platform.breakdown.safetyDocBytes,   color: 'bg-purple-500' },
    { label: 'Safety Posters', bytes: platform.breakdown.safetyPosterBytes, color: 'bg-teal-500' },
  ].filter(s => s.bytes > 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <SectionHeading icon={Layers} title="Storage Breakdown" />
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
        {segments.map(s => (
          <div
            key={s.label}
            className={`${s.color} transition-all`}
            style={{ width: `${(s.bytes / total) * 100}%` }}
            title={`${s.label}: ${fmtBytes(s.bytes)}`}
          />
        ))}
        {segments.length === 0 && <div className="bg-slate-100 w-full" />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${s.color}`} />
            <span className="text-xs text-slate-600">{s.label}</span>
            <span className="text-xs font-bold text-slate-800">{fmtBytes(s.bytes)}</span>
          </div>
        ))}
        {segments.length === 0 && (
          <span className="text-xs text-slate-400">No files uploaded yet</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SystemStorageTab() {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<'totalBytes' | 'pct' | 'name'>('totalBytes');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/owner-console/storage', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json() as StorageData;
      setData(json);
    } catch {
      setError('Could not load storage data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
        <button onClick={load} className="ml-auto text-xs font-bold underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const { platform, companies, topByStorage, topFiles, topJobsByStorage } = data;

  // Sort companies table
  const sortedCompanies = [...companies].sort((a, b) => {
    let diff = 0;
    if (sortKey === 'totalBytes') diff = a.totalBytes - b.totalBytes;
    else if (sortKey === 'pct') diff = a.pct - b.pct;
    else diff = a.name.localeCompare(b.name);
    return sortDir === 'desc' ? -diff : diff;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k
      ? (sortDir === 'desc' ? <ChevronDown size={11} /> : <ChevronUp size={11} />)
      : null;

  const alertCompanies = companies.filter(c => c.status !== 'ok');

  return (
    <div className="max-w-6xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-black text-slate-900">System Storage</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Platform-wide file storage across {platform.totalCompanies} {platform.totalCompanies === 1 ? 'company' : 'companies'}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── Alert banner ── */}
      {alertCompanies.length > 0 && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
          alertCompanies.some(c => c.status === 'blocked')
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <AlertTriangle size={15} className={alertCompanies.some(c => c.status === 'blocked') ? 'text-red-600 shrink-0 mt-0.5' : 'text-amber-600 shrink-0 mt-0.5'} />
          <div>
            <p className={`text-sm font-bold ${alertCompanies.some(c => c.status === 'blocked') ? 'text-red-800' : 'text-amber-800'}`}>
              {platform.blockedCount > 0 && `${platform.blockedCount} company${platform.blockedCount > 1 ? 'ies' : ''} over limit · `}
              {platform.overCount > 0 && `${platform.overCount} over 90% · `}
              {platform.warningCount > 0 && `${platform.warningCount} over 70%`}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {alertCompanies.map(c => c.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={HardDrive}
          label="Total Storage Used"
          value={fmtBytes(platform.totalBytes)}
          sub={`Across ${platform.companiesWithStorage} companies`}
          accent="bg-orange-500"
        />
        <SummaryCard
          icon={Database}
          label="Total Files"
          value={platform.totalFiles.toLocaleString()}
          sub={`${platform.totalFileCount} docs · ${platform.totalPhotoCount} photos`}
        />
        <SummaryCard
          icon={Building2}
          label="Companies"
          value={String(platform.totalCompanies)}
          sub={`${platform.companiesWithStorage} with files`}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Alerts"
          value={String(platform.blockedCount + platform.overCount + platform.warningCount)}
          sub={`${platform.blockedCount} blocked · ${platform.overCount} over 90% · ${platform.warningCount} warning`}
          accent={platform.blockedCount > 0 ? 'bg-red-500' : platform.overCount > 0 ? 'bg-orange-500' : 'bg-amber-500'}
        />
      </div>

      {/* ── Breakdown bar ── */}
      <BreakdownBar platform={platform} />

      {/* ── Top 10 by storage ── */}
      {topByStorage.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <SectionHeading icon={HardDrive} title="Top Companies by Storage" count={topByStorage.length} />
          <div className="space-y-2">
            {topByStorage.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-[11px] font-black text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-800 truncate">{c.name}</span>
                    <span className="text-xs font-bold text-slate-600 shrink-0">{fmtBytes(c.totalBytes)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_CONFIG[c.status].bar}`}
                      style={{ width: `${Math.min(100, c.pct)}%` }}
                    />
                  </div>
                </div>
                <span className={`text-[11px] font-bold w-8 text-right shrink-0 ${STATUS_CONFIG[c.status].color}`}>{c.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top 10 largest files ── */}
      {topFiles.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <SectionHeading icon={FileText} title="Top 10 Largest Files" count={topFiles.length} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">#</th>
                  <th className="text-left py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">File</th>
                  <th className="text-left py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company</th>
                  <th className="text-left py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="text-right py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Size</th>
                  <th className="text-right py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {topFiles.map((f, i) => (
                  <tr key={`${f.source}-${f.id}`} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 text-[11px] font-black text-slate-300">{i + 1}</td>
                    <td className="py-2.5 max-w-[200px]">
                      <div className="flex items-center gap-2">
                        {f.source === 'photo'
                          ? <Camera size={12} className="text-orange-400 shrink-0" />
                          : <FileText size={12} className="text-blue-400 shrink-0" />
                        }
                        <span className="text-xs text-slate-700 truncate">{f.original_name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-xs text-slate-500">{f.company_name}</td>
                    <td className="py-2.5">
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {f.source === 'photo' ? 'Photo' : (f.file_category ?? f.mime_type.split('/')[1] ?? 'file')}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-xs font-bold text-slate-700">{fmtBytes(f.size_bytes)}</td>
                    <td className="py-2.5 text-right text-xs text-slate-400">{fmtDate(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Top 10 jobs by storage ── */}
      {topJobsByStorage.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <SectionHeading icon={FolderOpen} title="Top Jobs by Storage" count={topJobsByStorage.length} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">#</th>
                  <th className="text-left py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Job</th>
                  <th className="text-left py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company</th>
                  <th className="text-center py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Photos</th>
                  <th className="text-center py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Files</th>
                  <th className="text-right py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {topJobsByStorage.map((j, i) => (
                  <tr key={j.job_id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 text-[11px] font-black text-slate-300">{i + 1}</td>
                    <td className="py-2.5">
                      <div className="text-xs font-semibold text-slate-800">{j.job_name}</div>
                      {j.job_number && <div className="text-[11px] text-slate-400">{j.job_number}</div>}
                    </td>
                    <td className="py-2.5 text-xs text-slate-500">{j.company_name}</td>
                    <td className="py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Image size={11} className="text-orange-400" />
                        <span className="text-xs font-semibold text-slate-700">{j.photo_count}</span>
                        <span className="text-[11px] text-slate-400">({fmtBytes(j.photo_bytes)})</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <FileText size={11} className="text-blue-400" />
                        <span className="text-xs font-semibold text-slate-700">{j.file_count}</span>
                        <span className="text-[11px] text-slate-400">({fmtBytes(j.file_bytes)})</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-xs font-black text-slate-800">{fmtBytes(j.totalBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Full company table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <SectionHeading icon={Building2} title="All Companies" count={companies.length} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th
                  className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none"
                  onClick={() => toggleSort('name')}
                >
                  <span className="flex items-center gap-1">Company <SortIcon k="name" /></span>
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Plan</th>
                <th
                  className="text-right px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none"
                  onClick={() => toggleSort('totalBytes')}
                >
                  <span className="flex items-center justify-end gap-1">Storage Used <SortIcon k="totalBytes" /></span>
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Limit</th>
                <th
                  className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 select-none"
                  onClick={() => toggleSort('pct')}
                >
                  <span className="flex items-center justify-center gap-1">Usage <SortIcon k="pct" /></span>
                </th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Files</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Last Upload</th>
                <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedCompanies.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-400">
                    No companies found.
                  </td>
                </tr>
              )}
              {sortedCompanies.map((c) => {
                const isExpanded = expandedId === c.id;
                return (
                  <>
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        c.status === 'blocked' ? 'bg-red-50/30' :
                        c.status === 'over'    ? 'bg-orange-50/20' :
                        c.status === 'warning' ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5 font-semibold text-slate-800">{c.name}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {planLabel(c.plan)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs font-bold text-slate-700">{fmtBytes(c.totalBytes)}</td>
                      <td className="px-4 py-3.5 text-right text-xs text-slate-400">{fmtBytes(c.storageLimitBytes)}</td>
                      <td className="px-4 py-3.5">
                        <PctBar pct={c.pct} status={c.status} />
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs text-slate-600">
                        <div className="flex items-center justify-center gap-2">
                          <span title="Files">{c.fileCount} <span className="text-slate-300">f</span></span>
                          <span title="Photos">{c.photoCount} <span className="text-slate-300">p</span></span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{fmtDate(c.lastUpload)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${c.id}-exp`} className="bg-slate-50/60">
                        <td colSpan={9} className="px-5 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-slate-400">Job Files:</span>{' '}
                              <span className="font-semibold text-slate-700">{fmtBytes(c.fileBytes)} ({c.fileCount} files)</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Job Photos:</span>{' '}
                              <span className="font-semibold text-slate-700">{fmtBytes(c.photoBytes)} ({c.photoCount} photos)</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Safety Docs/Posters:</span>{' '}
                              <span className="font-semibold text-slate-700">{fmtBytes(c.safetyBytes)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Total Files:</span>{' '}
                              <span className="font-semibold text-slate-700">{c.totalFiles}</span>
                            </div>
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

      {/* ── Empty state ── */}
      {platform.totalBytes === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <HardDrive size={24} className="text-slate-400" />
          </div>
          <h3 className="font-heading font-black text-slate-700 mb-1">No files uploaded yet</h3>
          <p className="text-sm text-slate-400">Storage usage will appear here once companies start uploading files and photos.</p>
        </div>
      )}

    </div>
  );
}
