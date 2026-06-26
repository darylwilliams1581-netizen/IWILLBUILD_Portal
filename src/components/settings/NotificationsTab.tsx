/**
 * NotificationsTab
 * ─────────────────────────────────────────────────────────────────────────────
 * User-scoped notification preferences. Saves to /api/notifications/prefs.
 * Settings persist in the user's profile row (notification_prefs JSON column).
 */
import { useState, useEffect } from 'react';
import {
  Bell, Save, CheckCircle2, AlertCircle, Loader2,
  Clock, Truck, FileText, DollarSign, Megaphone,
} from 'lucide-react';

interface NotificationPrefs {
  enabled: boolean;
  todoOverdue: boolean;
  todoDueToday: boolean;
  fleetServiceDue: boolean;
  fleetRegoDue: boolean;
  fleetPrestartFlag: boolean;
  formCompleted: boolean;
  estimateApproved: boolean;
  companyBanner: boolean;
}

const DEFAULT: NotificationPrefs = {
  enabled: true,
  todoOverdue: true,
  todoDueToday: true,
  fleetServiceDue: true,
  fleetRegoDue: true,
  fleetPrestartFlag: true,
  formCompleted: true,
  estimateApproved: true,
  companyBanner: true,
};

interface PrefGroup {
  label: string;
  icon: React.ElementType;
  iconColor: string;
  items: Array<{ key: keyof NotificationPrefs; label: string; description: string }>;
}

const PREF_GROUPS: PrefGroup[] = [
  {
    label: 'Jobs & To-Dos',
    icon: Clock,
    iconColor: 'text-amber-500',
    items: [
      { key: 'todoOverdue',  label: 'Overdue to-dos',   description: 'Alert when a job to-do passes its due date' },
      { key: 'todoDueToday', label: 'Due today',         description: 'Alert for to-dos due on the current day' },
    ],
  },
  {
    label: 'Fleet',
    icon: Truck,
    iconColor: 'text-orange-500',
    items: [
      { key: 'fleetServiceDue',  label: 'Service due',          description: 'Alert when service is due within 14 days' },
      { key: 'fleetRegoDue',     label: 'Rego expiring',        description: 'Alert when rego expires within 14 days' },
      { key: 'fleetPrestartFlag', label: 'Prestart issue flagged', description: 'Alert when a prestart flags an attention item' },
    ],
  },
  {
    label: 'Forms',
    icon: FileText,
    iconColor: 'text-blue-500',
    items: [
      { key: 'formCompleted', label: 'Form completed', description: 'Alert when a form submission is marked complete' },
    ],
  },
  {
    label: 'Estimates',
    icon: DollarSign,
    iconColor: 'text-emerald-500',
    items: [
      { key: 'estimateApproved', label: 'Estimate approved', description: 'Alert when an estimate is marked as approved' },
    ],
  },
  {
    label: 'Company',
    icon: Megaphone,
    iconColor: 'text-violet-500',
    items: [
      { key: 'companyBanner', label: 'Company notices', description: 'Show active dashboard banner alerts' },
    ],
  },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        checked ? 'bg-primary' : 'bg-slate-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({ ...DEFAULT });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/notifications/prefs', { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<{ prefs: NotificationPrefs }> : Promise.reject())
      .then((data) => { setPrefs({ ...DEFAULT, ...data.prefs }); })
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: keyof NotificationPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/notifications/prefs', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
          <Bell size={18} className="text-slate-600" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-lg text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">Choose which in-app alerts you want to receive.</p>
        </div>
      </div>

      {/* Master enable */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 mb-6">
        <div className="flex items-center gap-3">
          <Bell size={16} className="text-slate-600" />
          <div>
            <div className="text-sm font-semibold text-slate-800">Enable notifications</div>
            <div className="text-xs text-slate-500">Turn all in-app alerts on or off</div>
          </div>
        </div>
        <Toggle checked={prefs.enabled} onChange={() => toggle('enabled')} />
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-4">
        {PREF_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.label} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <GroupIcon size={13} className={group.iconColor} />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{group.label}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{item.label}</div>
                      <div className="text-xs text-slate-500">{item.description}</div>
                    </div>
                    <Toggle
                      checked={prefs[item.key] as boolean}
                      onChange={() => toggle(item.key)}
                      disabled={!prefs.enabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save preferences
        </button>
        {saved && (
          <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold">
            <CheckCircle2 size={14} />
            Saved
          </div>
        )}
        {error && (
          <div className="flex items-center gap-1.5 text-red-600 text-sm">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
