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
} from 'lucide-react';

interface BackupConfig {
  provider: 'sharepoint' | 'onedrive' | '';
  connectionUrl: string;
  folderPath: string;
  schedule: 'daily' | 'weekly' | 'monthly' | 'manual';
  scheduleTime: string;
  scheduleDay: string;
  dataJobs: boolean;
  dataFleet: boolean;
  dataForms: boolean;
  dataFiles: boolean;
  dataEstimates: boolean;
  dataTeam: boolean;
  enabled: boolean;
}

const DEFAULT_CONFIG: BackupConfig = {
  provider: '',
  connectionUrl: '',
  folderPath: '',
  schedule: 'weekly',
  scheduleTime: '02:00',
  scheduleDay: 'sunday',
  dataJobs: true,
  dataFleet: true,
  dataForms: true,
  dataFiles: true,
  dataEstimates: true,
  dataTeam: false,
  enabled: false,
};

const DATA_OPTIONS = [
  { key: 'dataJobs',      label: 'Jobs & Progress',    icon: ClipboardList, desc: 'Job records, notes, to-dos, progress updates' },
  { key: 'dataFleet',     label: 'Fleet & Prestarts',  icon: Truck,         desc: 'Asset records, daily prestart logs' },
  { key: 'dataForms',     label: 'Form Submissions',   icon: FileText,      desc: 'Completed form responses and signatures' },
  { key: 'dataFiles',     label: 'Files & Photos',     icon: Image,         desc: 'Uploaded documents and job photos' },
  { key: 'dataEstimates', label: 'Estimates',          icon: Database,      desc: 'Estimate records and line items' },
  { key: 'dataTeam',      label: 'Team & Permissions', icon: Users,         desc: 'User list and permission settings' },
] as const;

export default function DataBackupTab({ isAdmin }: { isAdmin: boolean }) {
  const [config, setConfig] = useState<BackupConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);

  useEffect(() => {
    fetch('/api/settings/backup')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.config) setConfig({ ...DEFAULT_CONFIG, ...data.config });
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

  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      const res = await fetch('/api/settings/backup/run', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setLastBackup(new Date().toISOString());
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(data.error ?? 'Backup failed');
      }
    } catch {
      setError('Backup failed. Check your connection settings.');
    } finally {
      setRunningNow(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-orange-500" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Data & Backup</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Schedule automated exports of your IWILLBUILD data to your own SharePoint or OneDrive storage.
          </p>
        </div>
        {lastBackup && (
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-400">Last backup</p>
            <p className="text-xs font-medium text-slate-600">
              {new Date(lastBackup).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          Your IWILLBUILD data always stays in the IWILLBUILD database. Backups are <strong>copies</strong> sent to your storage — they don't affect your live portal data.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">Enable Automated Backups</p>
            <p className="text-sm text-slate-500 mt-0.5">Turn on to schedule regular exports to your storage</p>
          </div>
          <button
            disabled={!isAdmin}
            onClick={() => set('enabled', !config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? 'bg-orange-500' : 'bg-slate-200'
            } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Destination */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Cloud size={16} className="text-orange-500" />
          <h3 className="font-medium text-slate-800">Backup Destination</h3>
        </div>

        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Storage Provider</label>
          <div className="grid grid-cols-2 gap-3">
            {(['sharepoint', 'onedrive'] as const).map(p => (
              <button
                key={p}
                disabled={!isAdmin}
                onClick={() => set('provider', p)}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                  config.provider === p
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-slate-200 hover:border-slate-300'
                } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <HardDrive size={18} className={config.provider === p ? 'text-orange-500' : 'text-slate-400'} />
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {p === 'sharepoint' ? 'SharePoint' : 'OneDrive'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p === 'sharepoint' ? 'Team / company site' : 'Personal / business drive'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Connection URL */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {config.provider === 'sharepoint' ? 'SharePoint Site URL' : 'OneDrive Folder URL'}
          </label>
          <input
            type="url"
            disabled={!isAdmin}
            value={config.connectionUrl}
            onChange={e => set('connectionUrl', e.target.value)}
            placeholder={
              config.provider === 'sharepoint'
                ? 'https://yourcompany.sharepoint.com/sites/YourSite'
                : 'https://onedrive.live.com/...'
            }
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:bg-slate-50"
          />
          <p className="text-xs text-slate-400 mt-1">Paste the link to your SharePoint site or OneDrive folder</p>
        </div>

        {/* Folder path */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <span className="flex items-center gap-1.5"><FolderOpen size={13} /> Target Folder / Library</span>
          </label>
          <input
            type="text"
            disabled={!isAdmin}
            value={config.folderPath}
            onChange={e => set('folderPath', e.target.value)}
            placeholder="e.g. Documents/IWILLBUILD Backups"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:bg-slate-50"
          />
          <p className="text-xs text-slate-400 mt-1">Folder path within your site or drive. Leave blank to use the root.</p>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} className="text-orange-500" />
          <h3 className="font-medium text-slate-800">Backup Schedule</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
            <select
              disabled={!isAdmin}
              value={config.schedule}
              onChange={e => set('schedule', e.target.value as BackupConfig['schedule'])}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:bg-slate-50"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="manual">Manual only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Time (AEST)</label>
            <input
              type="time"
              disabled={!isAdmin}
              value={config.scheduleTime}
              onChange={e => set('scheduleTime', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:bg-slate-50"
            />
          </div>

          {config.schedule === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Day of Week</label>
              <select
                disabled={!isAdmin}
                value={config.scheduleDay}
                onChange={e => set('scheduleDay', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:bg-slate-50"
              >
                {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                  <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
            </div>
          )}

          {config.schedule === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Day of Month</label>
              <select
                disabled={!isAdmin}
                value={config.scheduleDay}
                onChange={e => set('scheduleDay', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:bg-slate-50"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={String(d)}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* What to back up */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database size={16} className="text-orange-500" />
          <h3 className="font-medium text-slate-800">What to Back Up</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DATA_OPTIONS.map(({ key, label, icon: Icon, desc }) => (
            <label
              key={key}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                config[key] ? 'border-orange-300 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
              } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={config[key]}
                onChange={e => set(key, e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon size={13} className="text-slate-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-800">{label}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            onClick={handleRunNow}
            disabled={runningNow || !config.connectionUrl}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {runningNow ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
            Run Backup Now
          </button>

          <div className="flex items-center gap-3">
            {error && (
              <div className="flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            {saved && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 size={14} /> Saved
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
