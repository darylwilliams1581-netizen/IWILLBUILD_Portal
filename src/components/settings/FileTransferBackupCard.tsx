import { useState, useEffect } from 'react';
import {
  FolderOpen, Save, Loader2, CheckCircle2, AlertCircle,
  Copy, ExternalLink, Info, Link2, Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DestType = 'sharepoint_onedrive' | 'google_drive' | 'dropbox' | 'local_sync' | 'other' | '';
type FreqType  = 'manual' | 'weekly' | 'monthly' | 'on_job_archive';

interface FTBSettings {
  name:      string;
  destType:  DestType;
  path:      string;
  notes:     string;
  frequency: FreqType;
  updatedAt?: string;
}

const DEFAULTS: FTBSettings = {
  name:      '',
  destType:  '',
  path:      '',
  notes:     '',
  frequency: 'manual',
};

const DEST_OPTIONS: { value: DestType; label: string }[] = [
  { value: 'sharepoint_onedrive', label: 'SharePoint / OneDrive' },
  { value: 'google_drive',        label: 'Google Drive'          },
  { value: 'dropbox',             label: 'Dropbox'               },
  { value: 'local_sync',          label: 'Local synced folder reference' },
  { value: 'other',               label: 'Other'                 },
];

const FREQ_OPTIONS: { value: FreqType; label: string }[] = [
  { value: 'manual',         label: 'Manual only'    },
  { value: 'weekly',         label: 'Weekly'         },
  { value: 'monthly',        label: 'Monthly'        },
  { value: 'on_job_archive', label: 'On job archive' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLocalPath(p: string) {
  return /^[a-zA-Z]:[\\\/]/.test(p.trim()) || p.trim().startsWith('\\\\');
}

function isUrl(p: string) {
  try { new URL(p.trim()); return true; } catch { return false; }
}

const inputCls = (disabled: boolean) =>
  `w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 ${
    disabled ? 'opacity-50 bg-slate-50 cursor-not-allowed' : 'bg-white'
  }`;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FileTransferBackupCard({ isAdmin }: { isAdmin: boolean }) {
  const [settings, setSettings] = useState<FTBSettings>(DEFAULTS);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  const [copied,   setCopied]   = useState(false);
  const [localMsg, setLocalMsg] = useState(false);

  // Load on mount
  useEffect(() => {
    fetch('/api/settings/file-transfer-backup', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.settings) setSettings({ ...DEFAULTS, ...data.settings }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof FTBSettings>(k: K, v: FTBSettings[K]) =>
    setSettings(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...settings, updatedAt: new Date().toISOString() };
      const res = await fetch('/api/settings/file-transfer-backup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      setSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!settings.path) return;
    try {
      await navigator.clipboard.writeText(settings.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleOpen = () => {
    const p = settings.path.trim();
    if (!p) return;
    if (isLocalPath(p)) {
      setLocalMsg(true);
      setTimeout(() => setLocalMsg(false), 6000);
    } else if (isUrl(p)) {
      window.open(p, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
          <FolderOpen size={15} className="text-violet-600 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-800">File Transfer &amp; Backup</h3>
        </div>
        <div className="p-5 flex justify-center">
          <Loader2 size={20} className="animate-spin text-violet-400" />
        </div>
      </div>
    );
  }

  const pathIsLocal = isLocalPath(settings.path);
  const pathIsUrl   = isUrl(settings.path);
  const hasPath     = settings.path.trim().length > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <FolderOpen size={15} className="text-violet-600 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">File Transfer &amp; Backup</h3>
      </div>

      <div className="p-5 space-y-5">

        {/* ── Helper text ── */}
        <div className="flex gap-2.5 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong>IWILLBUILD stores your files securely in the app.</strong>{' '}
            This backup location is saved so your team knows where exported job files, completed forms, photos and archives should be copied.
            Automatic cloud sync will be added later.
          </p>
        </div>

        {/* ── Fields ── */}
        <div className="space-y-4">

          {/* Destination name */}
          <Field label="Backup destination name" hint='e.g. "Company SharePoint Backup" or "Monthly Job Archive"'>
            <input
              type="text"
              disabled={!isAdmin}
              value={settings.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Company SharePoint Backup"
              className={inputCls(!isAdmin)}
            />
          </Field>

          {/* Destination type */}
          <Field label="Backup destination type">
            <select
              disabled={!isAdmin}
              value={settings.destType}
              onChange={e => set('destType', e.target.value as DestType)}
              className={inputCls(!isAdmin)}
            >
              <option value="">— Select a type —</option>
              {DEST_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {/* Folder link or path */}
          <Field
            label="Backup folder link or path"
            hint={
              settings.destType === 'local_sync'
                ? 'e.g. C:\\Users\\Name\\OneDrive - Company\\IWILLBUILD - Documents'
                : 'e.g. https://company.sharepoint.com/sites/IWILLBUILD/Shared Documents/IWILLBUILD Backups'
            }
          >
            <input
              type="text"
              disabled={!isAdmin}
              value={settings.path}
              onChange={e => set('path', e.target.value)}
              placeholder={
                settings.destType === 'local_sync'
                  ? 'C:\\Users\\Name\\OneDrive - Company\\IWILLBUILD - Documents'
                  : 'https://...'
              }
              className={inputCls(!isAdmin)}
            />
          </Field>

          {/* Notes */}
          <Field label="Notes" hint="Optional — e.g. Use this folder for monthly job archive exports.">
            <textarea
              disabled={!isAdmin}
              value={settings.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Use this folder for monthly job archive exports."
              className={`${inputCls(!isAdmin)} resize-none`}
            />
          </Field>

          {/* Frequency */}
          <Field label="Backup frequency preference">
            <div className="flex flex-wrap gap-2">
              {FREQ_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => set('frequency', o.value)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    settings.frequency === o.value
                      ? 'bg-violet-500 text-white border-violet-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

        </div>

        {/* ── Local path message ── */}
        {localMsg && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <Info size={14} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              <strong>Local folder paths cannot be opened directly from the browser.</strong>{' '}
              Copy the path and open it on your computer.
            </span>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="flex flex-wrap items-center gap-2 pt-1">

          {/* Save */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-500 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save backup settings
            </button>
          )}

          {/* Copy backup link */}
          <button
            type="button"
            disabled={!hasPath}
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy backup link'}
          </button>

          {/* Open backup location */}
          <button
            type="button"
            disabled={!hasPath}
            onClick={handleOpen}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ExternalLink size={14} />
            Open backup location
          </button>

          {/* Test link — only for URLs */}
          {hasPath && pathIsUrl && (
            <a
              href={settings.path.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Link2 size={14} />
              Test link
            </a>
          )}

        </div>

        {/* ── Feedback ── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <AlertCircle size={12} className="shrink-0" /> {error}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
            <CheckCircle2 size={12} className="shrink-0" />
            Backup settings saved
            {settings.updatedAt && (
              <span className="text-slate-400 ml-1">
                · {new Date(settings.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        )}
        {!isAdmin && (
          <p className="text-xs text-slate-400">Only Owners and Admins can edit backup settings.</p>
        )}

        {/* ── Coming later box ── */}
        <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
          <Info size={13} className="shrink-0 mt-0.5 text-slate-400" />
          <span>
            <strong className="text-slate-700">Coming later:</strong>{' '}
            automatic export to SharePoint/OneDrive, scheduled backups, and job archive ZIP transfer.
          </span>
        </div>

      </div>
    </div>
  );
}
