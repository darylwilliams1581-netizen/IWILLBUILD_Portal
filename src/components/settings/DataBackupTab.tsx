import { useState, useEffect } from 'react';
import {
  Cloud,
  FolderOpen,
  Clock,
  Database,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FileText,
  Users,
  Truck,
  ClipboardList,
  Image,
  Info,
  Download,
  Play,
  Wifi,
  WifiOff,
  ChevronRight,
  Settings2,
  Mail,
  StickyNote,
  FolderTree,
  Shield,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DestinationType = '' | 'sharepoint_onedrive' | 'manual';
type ScheduleType = 'manual' | 'daily' | 'weekly' | 'monthly';

interface BackupConfig {
  // Section 1 – destination
  destinationType: DestinationType;

  // Section 2 – SharePoint / OneDrive connection
  siteUrl: string;
  libraryName: string;
  rootFolder: string;
  folderPath: string;
  contactEmail: string;
  notes: string;

  // Section 4 – content
  dataJobs: boolean;
  dataEstimates: boolean;
  dataForms: boolean;
  dataCompletedPdfs: boolean;
  dataFiles: boolean;
  dataPhotos: boolean;
  dataFleet: boolean;
  dataUsers: boolean;
  dataCompanySettings: boolean;

  // Section 5 – schedule
  schedule: ScheduleType;
  scheduleTime: string;
  scheduleDay: string;
}

const DEFAULT: BackupConfig = {
  destinationType: '',
  siteUrl: '',
  libraryName: 'Documents',
  rootFolder: 'IWILLBUILD - Documents',
  folderPath: '',
  contactEmail: '',
  notes: '',
  dataJobs: true,
  dataEstimates: true,
  dataForms: true,
  dataCompletedPdfs: true,
  dataFiles: true,
  dataPhotos: true,
  dataFleet: true,
  dataUsers: false,
  dataCompanySettings: false,
  schedule: 'weekly',
  scheduleTime: '02:00',
  scheduleDay: 'sunday',
};

// ─── Folder structure preview ─────────────────────────────────────────────────

const FOLDER_TREE = [
  { name: 'IWILLBUILD - Documents', depth: 0, isRoot: true },
  { name: 'Backups', depth: 1 },
  { name: 'Company', depth: 2 },
  { name: 'Fleet', depth: 2 },
  { name: 'Form Packs', depth: 2 },
  { name: 'Jobs', depth: 2 },
  { name: 'Photos', depth: 2 },
  { name: 'Reports', depth: 2 },
  { name: 'Templates', depth: 2 },
  { name: 'Users', depth: 2 },
];

// ─── Content options ──────────────────────────────────────────────────────────

const CONTENT_OPTIONS: {
  key: keyof BackupConfig;
  label: string;
  desc: string;
  icon: React.ElementType;
  folder: string;
}[] = [
  { key: 'dataJobs',            label: 'Jobs',                  desc: 'Job records, notes, to-dos, progress updates',    icon: ClipboardList, folder: 'Jobs' },
  { key: 'dataEstimates',       label: 'Estimates',             desc: 'Estimate records and line items',                 icon: FileText,      folder: 'Reports' },
  { key: 'dataForms',           label: 'Forms',                 desc: 'Completed form responses and signatures',         icon: Database,      folder: 'Form Packs' },
  { key: 'dataCompletedPdfs',   label: 'Completed PDFs',        desc: 'Generated PDF documents from forms and reports',  icon: FileText,      folder: 'Reports' },
  { key: 'dataFiles',           label: 'Files',                 desc: 'Uploaded documents and attachments',              icon: FolderOpen,    folder: 'Company' },
  { key: 'dataPhotos',          label: 'Photos',                desc: 'Job site photos and images',                      icon: Image,         folder: 'Photos' },
  { key: 'dataFleet',           label: 'Fleet',                 desc: 'Asset records and daily prestart logs',           icon: Truck,         folder: 'Fleet' },
  { key: 'dataUsers',           label: 'Users & Permissions',   desc: 'Team member list and permission settings',        icon: Users,         folder: 'Users' },
  { key: 'dataCompanySettings', label: 'Company Settings',      desc: 'Company configuration and preferences',           icon: Settings2,     folder: 'Company' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <Icon size={15} className="text-orange-500 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = (disabled: boolean) =>
  `w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 ${
    disabled ? 'opacity-50 bg-slate-50 cursor-not-allowed' : 'bg-white'
  }`;

// ─── Main component ───────────────────────────────────────────────────────────

export default function DataBackupTab({ isAdmin }: { isAdmin: boolean }) {
  const [config, setConfig] = useState<BackupConfig>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  useEffect(() => {
    fetch('/api/settings/backup')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.config) setConfig({ ...DEFAULT, ...data.config });
        if (data?.lastBackup) setLastBackup(data.lastBackup);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof BackupConfig>(key: K, val: BackupConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadJson = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/settings/backup/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iwillbuild-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setTestResult(null);
    // Placeholder — real Microsoft Graph OAuth not yet wired
    await new Promise(r => setTimeout(r, 1500));
    setTestResult('fail');
    setTestingConn(false);
  };

  const handleExportNow = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/settings/backup/run', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setLastBackup(new Date().toISOString());
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(data.error ?? 'Export failed');
      }
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const nextBackupLabel = () => {
    if (config.schedule === 'manual') return 'Manual only';
    const now = new Date();
    if (config.schedule === 'daily') {
      const [h, m] = config.scheduleTime.split(':').map(Number);
      const next = new Date(now);
      next.setHours(h, m, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
    }
    return `Next ${config.schedule} run at ${config.scheduleTime} AEST`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-orange-500" size={28} />
      </div>
    );
  }

  const isSharePoint = config.destinationType === 'sharepoint_onedrive';

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Data & Backup</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Connect your own storage destination and schedule exports of your company data.
        </p>
      </div>

      {/* ── Security banner ── */}
      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <Shield size={15} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700 leading-relaxed">
          <strong>Backups are exported to your company's own storage destination.</strong>{' '}
          IWILLBUILD live data remains securely stored in the portal. Each company's backup settings and exported files are completely isolated — no other company can access your data.
        </p>
      </div>

      {/* ── Section 1: Backup Destination ── */}
      <SectionCard icon={Cloud} title="1. Backup Destination">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              id: '' as DestinationType,
              label: 'Not configured',
              sub: 'No backup destination set',
              icon: WifiOff,
            },
            {
              id: 'sharepoint_onedrive' as DestinationType,
              label: 'SharePoint / OneDrive',
              sub: 'Microsoft 365 storage',
              icon: Cloud,
            },
            {
              id: 'manual' as DestinationType,
              label: 'Manual export only',
              sub: 'Download JSON on demand',
              icon: Download,
            },
          ].map(opt => {
            const Icon = opt.icon;
            const active = config.destinationType === opt.id;
            return (
              <button
                key={opt.id}
                disabled={!isAdmin}
                onClick={() => set('destinationType', opt.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                  active ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon size={18} className={active ? 'text-orange-500 mt-0.5 shrink-0' : 'text-slate-400 mt-0.5 shrink-0'} />
                <div>
                  <p className={`text-sm font-semibold ${active ? 'text-orange-700' : 'text-slate-800'}`}>{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.sub}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Future options note */}
        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
          <Info size={11} />
          Coming soon: Supabase Storage, Amazon S3, Google Drive
        </p>
      </SectionCard>

      {/* ── Section 2: SharePoint / OneDrive Connection ── */}
      {isSharePoint && (
        <SectionCard icon={HardDrive} title="2. SharePoint / OneDrive Connection">
          <div className="space-y-4">
            <Field
              label="SharePoint Site URL or OneDrive Folder Link"
              hint="e.g. https://yourcompany.sharepoint.com/sites/YourSite"
            >
              <input
                type="url"
                disabled={!isAdmin}
                value={config.siteUrl}
                onChange={e => set('siteUrl', e.target.value)}
                placeholder="https://yourcompany.sharepoint.com/sites/YourSite"
                className={inputCls(!isAdmin)}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Documents Library Name" hint="Usually 'Documents'">
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={config.libraryName}
                  onChange={e => set('libraryName', e.target.value)}
                  placeholder="Documents"
                  className={inputCls(!isAdmin)}
                />
              </Field>
              <Field label="Root Folder Name" hint="Top-level folder inside the library">
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={config.rootFolder}
                  onChange={e => set('rootFolder', e.target.value)}
                  placeholder="IWILLBUILD - Documents"
                  className={inputCls(!isAdmin)}
                />
              </Field>
            </div>

            <Field label="Folder Path (optional)" hint="Sub-path within the root folder, e.g. Backups/2026">
              <input
                type="text"
                disabled={!isAdmin}
                value={config.folderPath}
                onChange={e => set('folderPath', e.target.value)}
                placeholder="Backups"
                className={inputCls(!isAdmin)}
              />
            </Field>

            <Field label="Backup Contact Email" hint="Who to notify if a backup fails">
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  disabled={!isAdmin}
                  value={config.contactEmail}
                  onChange={e => set('contactEmail', e.target.value)}
                  placeholder="admin@yourcompany.com.au"
                  className={`${inputCls(!isAdmin)} pl-8`}
                />
              </div>
            </Field>

            <Field label="Notes (optional)">
              <div className="relative">
                <StickyNote size={14} className="absolute left-3 top-3 text-slate-400" />
                <textarea
                  disabled={!isAdmin}
                  value={config.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={2}
                  placeholder="Any notes about this backup destination..."
                  className={`${inputCls(!isAdmin)} pl-8 resize-none`}
                />
              </div>
            </Field>

            {/* Microsoft Graph notice */}
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Microsoft Graph connection is a placeholder.</strong> Automated push to SharePoint/OneDrive requires Microsoft Azure app registration and OAuth setup. Manual JSON export is available now.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Section 3: Folder Structure Preview ── */}
      {isSharePoint && (
        <SectionCard icon={FolderTree} title="3. Suggested Folder Structure">
          <p className="text-xs text-slate-500 mb-3">
            IWILLBUILD will create this folder structure inside your{' '}
            <span className="font-medium text-slate-700">{config.libraryName || 'Documents'}</span> library:
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-xs text-slate-700 space-y-1">
            {FOLDER_TREE.map((item, i) => (
              <div key={i} className="flex items-center gap-1" style={{ paddingLeft: `${item.depth * 16}px` }}>
                {item.depth > 0 && (
                  <ChevronRight size={11} className="text-slate-400 shrink-0" />
                )}
                <FolderOpen
                  size={12}
                  className={item.isRoot ? 'text-orange-400 shrink-0' : 'text-slate-400 shrink-0'}
                />
                <span className={item.isRoot ? 'font-semibold text-orange-700' : ''}>
                  {item.depth === 0 ? (config.rootFolder || item.name) : item.name}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Section 4: Backup Content ── */}
      <SectionCard icon={Database} title={isSharePoint ? '4. Backup Content' : '2. Backup Content'}>
        <p className="text-xs text-slate-500 mb-3">Select which data to include in exports.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {CONTENT_OPTIONS.map(({ key, label, desc, icon: Icon, folder }) => {
            const checked = config[key] as boolean;
            return (
              <label
                key={key}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none ${
                  checked ? 'border-orange-300 bg-orange-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={checked}
                  onChange={e => set(key, e.target.checked as BackupConfig[typeof key])}
                  className="mt-0.5 accent-orange-500 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon size={12} className="text-slate-500 shrink-0" />
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                    {isSharePoint && (
                      <span className="text-xs text-slate-400 ml-auto">→ {folder}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Section 5: Backup Schedule ── */}
      <SectionCard icon={Clock} title={isSharePoint ? '5. Backup Schedule' : '3. Backup Schedule'}>
        <div className="space-y-4">
          {/* Frequency pills */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Frequency</label>
            <div className="flex flex-wrap gap-2">
              {(['manual', 'daily', 'weekly', 'monthly'] as ScheduleType[]).map(s => (
                <button
                  key={s}
                  disabled={!isAdmin}
                  onClick={() => set('schedule', s)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    config.schedule === s
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {config.schedule !== 'manual' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Backup Time (AEST)">
                <input
                  type="time"
                  disabled={!isAdmin}
                  value={config.scheduleTime}
                  onChange={e => set('scheduleTime', e.target.value)}
                  className={inputCls(!isAdmin)}
                />
              </Field>

              {config.schedule === 'weekly' && (
                <Field label="Day of Week">
                  <select
                    disabled={!isAdmin}
                    value={config.scheduleDay}
                    onChange={e => set('scheduleDay', e.target.value)}
                    className={inputCls(!isAdmin)}
                  >
                    {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                      <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </Field>
              )}

              {config.schedule === 'monthly' && (
                <Field label="Day of Month">
                  <select
                    disabled={!isAdmin}
                    value={config.scheduleDay}
                    onChange={e => set('scheduleDay', e.target.value)}
                    className={inputCls(!isAdmin)}
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}

          {/* Last / Next backup */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-0.5">Last backup</p>
              <p className="text-sm font-medium text-slate-700">
                {lastBackup
                  ? new Date(lastBackup).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
                  : 'Never'}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-0.5">Next backup</p>
              <p className="text-sm font-medium text-slate-700">{nextBackupLabel()}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Section 6: Actions ── */}
      <SectionCard icon={Play} title={isSharePoint ? '6. Actions' : '4. Actions'}>
        <div className="space-y-3">

          {/* Save */}
          {isAdmin && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Test connection — SharePoint only */}
                {isSharePoint && (
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConn || !config.siteUrl}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testingConn
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Wifi size={14} />}
                    Test Connection
                  </button>
                )}

                {/* Download JSON */}
                <button
                  onClick={handleDownloadJson}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Download Backup JSON
                </button>

                {/* Export now — SharePoint only */}
                {isSharePoint && (
                  <button
                    onClick={handleExportNow}
                    disabled={exporting || !config.siteUrl}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {exporting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    Export Company Data Now
                  </button>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Backup Settings
              </button>
            </div>
          )}

          {/* Test connection result */}
          {testResult === 'fail' && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />
              Microsoft Graph connection requires Azure app registration. Save your settings and contact support to complete setup.
            </div>
          )}
          {testResult === 'ok' && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} className="shrink-0" />
              Connection successful.
            </div>
          )}

          {/* Feedback */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} className="shrink-0" /> Settings saved.
            </div>
          )}
        </div>
      </SectionCard>

    </div>
  );
}
