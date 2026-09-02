/**
 * PlatformEmailTab
 * Developer Console tab — manage platform-wide email settings.
 * Lets the developer update the contact notification address, support reply-to,
 * and from-name, then send a live test email to confirm delivery.
 */
import { useState, useEffect, useCallback } from 'react';
import { Mail, Save, Send, RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface EmailSettings {
  contact_notification_email: string;
  support_reply_to: string;
  from_name: string;
}

const FIELD_META: Array<{
  key: keyof EmailSettings;
  label: string;
  description: string;
  type: 'email' | 'text';
  placeholder: string;
}> = [
  {
    key: 'contact_notification_email',
    label: 'Contact form notification email',
    description: 'Where website contact form submissions are delivered. Change this to route enquiries to support@iwillbuild.com.',
    type: 'email',
    placeholder: 'support@iwillbuild.com',
  },
  {
    key: 'support_reply_to',
    label: 'Support reply-to address',
    description: 'The Reply-To header on outbound emails (auto-replies, enquiry confirmations). Replies from customers land here.',
    type: 'email',
    placeholder: 'support@iwillbuild.com',
  },
  {
    key: 'from_name',
    label: 'From display name',
    description: 'The sender name shown in recipients\' inboxes, e.g. "IWIIlBUILD".',
    type: 'text',
    placeholder: 'IWIIlBUILD',
  },
];

export default function PlatformEmailTab() {
  const [settings, setSettings]   = useState<EmailSettings>({
    contact_notification_email: '',
    support_reply_to: '',
    from_name: '',
  });
  const [original, setOriginal]   = useState<EmailSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [toast, setToast]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/developer/email-settings');
      const data = await res.json() as { settings?: EmailSettings; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Load failed');
      const s = data.settings ?? {} as EmailSettings;
      setSettings({
        contact_notification_email: s.contact_notification_email ?? '',
        support_reply_to:           s.support_reply_to           ?? '',
        from_name:                  s.from_name                  ?? '',
      });
      setOriginal({
        contact_notification_email: s.contact_notification_email ?? '',
        support_reply_to:           s.support_reply_to           ?? '',
        from_name:                  s.from_name                  ?? '',
      });
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDirty = original !== null && (
    settings.contact_notification_email !== original.contact_notification_email ||
    settings.support_reply_to           !== original.support_reply_to           ||
    settings.from_name                  !== original.from_name
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res  = await fetch('/api/developer/email-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setOriginal({ ...settings });
      showToast('success', `Saved — ${(data as { updated?: string[] }).updated?.join(', ') ?? 'settings updated'}`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res  = await fetch('/api/developer/email-settings/test', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; sentTo?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Test failed');
      showToast('success', `Test email sent to ${data.sentTo}`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Test send failed');
    } finally {
      setTesting(false);
    }
  };

  const inputClass = [
    'w-full px-3 py-2 rounded-md border text-sm',
    'bg-slate-900 border-slate-700 text-white placeholder-slate-500',
    'focus:outline-none focus:ring-2 focus:ring-violet-600 focus:border-transparent',
    'transition-colors',
  ].join(' ');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mail size={18} className="text-violet-400" />
            Platform Email Settings
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Control where platform emails are sent and how they appear to recipients.
            Changes take effect immediately for all new outbound emails.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={[
          'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium',
          toast.type === 'success'
            ? 'bg-green-900/40 border border-green-700 text-green-300'
            : 'bg-red-900/40 border border-red-700 text-red-300',
        ].join(' ')}>
          {toast.type === 'success'
            ? <CheckCircle size={15} />
            : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Settings form */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-800/50 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-48 mb-2" />
              <div className="h-9 bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {FIELD_META.map(({ key, label, description, type, placeholder }) => (
            <div key={key} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <label className="block text-sm font-medium text-slate-200 mb-1">{label}</label>
              <p className="text-xs text-slate-500 mb-2 flex items-start gap-1.5">
                <Info size={11} className="mt-0.5 shrink-0 text-slate-600" />
                {description}
              </p>
              <input
                type={type}
                value={settings[key]}
                onChange={(e) => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className={inputClass}
              />
              {/* Show current saved value if different from what's typed */}
              {original && original[key] && original[key] !== settings[key] && (
                <p className="text-xs text-slate-500 mt-1">
                  Current saved: <span className="text-slate-400">{original[key]}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
        <button
          onClick={handleSave}
          disabled={saving || loading || !isDirty}
          className={[
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            isDirty && !saving
              ? 'bg-violet-500 hover:bg-violet-700 text-white'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed',
          ].join(' ')}
        >
          <Save size={14} />
          {saving ? 'Saving…' : isDirty ? 'Save changes' : 'No changes'}
        </button>

        <button
          onClick={handleTest}
          disabled={testing || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-50"
        >
          <Send size={14} />
          {testing ? 'Sending…' : 'Send test email'}
        </button>

        <span className="text-xs text-slate-600 ml-auto">
          Test sends to the current <em>contact_notification_email</em> address
        </span>
      </div>

      {/* Info box */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-4 text-xs text-blue-300 space-y-1.5">
        <p className="font-semibold text-blue-200">How these settings are used</p>
        <ul className="space-y-1 text-blue-300/80 list-disc list-inside">
          <li><strong className="text-blue-200">contact_notification_email</strong> — receives every website contact form submission</li>
          <li><strong className="text-blue-200">support_reply_to</strong> — the Reply-To on auto-reply emails sent to enquirers; customer replies land here</li>
          <li><strong className="text-blue-200">from_name</strong> — display name shown in recipients' inboxes alongside the platform sender address</li>
        </ul>
        <p className="text-blue-400/60 pt-1">
          System emails (password reset, verification, invites) use their own from-name but inherit the reply-to.
        </p>
      </div>
    </div>
  );
}
