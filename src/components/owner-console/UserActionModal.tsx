import { useState } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle2, Shield, Mail, UserCheck, XCircle, KeyRound, Unlock, Send } from 'lucide-react';
import type { OcUserForActions, UserAction } from './UserActionsMenu';

const REASON_PRESETS: Record<string, string[]> = {
  verify: ['Work email blocked verification', 'Support request', 'Duplicate account', 'Other'],
  'resend-verification': ['User did not receive email', 'Email changed', 'Support request', 'Other'],
  deactivate: ['Left business', 'Duplicate account', 'Security concern', 'Support request', 'Other'],
  reactivate: ['Returned to business', 'Support request', 'Error — was incorrectly deactivated', 'Other'],
  'change-role': ['Promotion', 'Role change', 'Support request', 'Other'],
  impersonate: ['Support session', 'Troubleshooting login issue', 'Investigating bug report', 'Other'],
  'revoke-sessions': ['Security concern', 'User left business', 'Account compromised', 'Other'],
  'force-temp-password': ['User locked out', 'Account compromised', 'Support request', 'Other'],
  'unlock-account': ['Too many failed attempts', 'User locked out', 'Support request', 'Other'],
  'send-reset-email': ['User forgot password', 'Support request', 'Account recovery', 'Other'],
};

const ROLE_OPTIONS = ['owner', 'admin', 'member', 'viewer'] as const;

interface Props {
  action: UserAction;
  user: OcUserForActions;
  onClose: () => void;
  onSuccess: (action: UserAction, userId: string, extra?: Record<string, unknown>) => void;
}

function actionConfig(action: UserAction) {
  switch (action) {
    case 'verify': return {
      title: 'Manually verify email',
      description: 'This will mark the email as verified and allow the user to log in.',
      confirmLabel: 'Verify manually',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50 border-emerald-200',
      confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    };
    case 'resend-verification': return {
      title: 'Resend verification email',
      description: "A new verification link will be sent to the user's email address.",
      confirmLabel: 'Resend email',
      icon: Mail,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50 border-blue-200',
      confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    };
    case 'deactivate': return {
      title: 'Deactivate account',
      description: 'The user will be immediately logged out and blocked from logging in. Their data is preserved.',
      confirmLabel: 'Deactivate',
      icon: XCircle,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-50 border-red-200',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
    };
    case 'reactivate': return {
      title: 'Reactivate account',
      description: 'The user will be able to log in again. Email verification status is unchanged.',
      confirmLabel: 'Reactivate',
      icon: UserCheck,
      iconColor: 'text-green-600',
      iconBg: 'bg-green-50 border-green-200',
      confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
    };
    case 'change-role': return {
      title: 'Change company role',
      description: "Changes the user's role within their company. Platform developer access is separate and unaffected.",
      confirmLabel: 'Change role',
      icon: Shield,
      iconColor: 'text-slate-600',
      iconBg: 'bg-slate-50 border-slate-200',
      confirmClass: 'bg-primary hover:bg-violet-700 text-white',
    };
    case 'force-temp-password': return {
      title: 'Set temporary password',
      description: 'Generates a temporary password and forces the user to change it on next login. All active sessions will be revoked.',
      confirmLabel: 'Set temp password',
      icon: KeyRound,
      iconColor: 'text-violet-700',
      iconBg: 'bg-violet-50 border-violet-200',
      confirmClass: 'bg-violet-500 hover:bg-violet-700 text-white',
    };
    case 'unlock-account': return {
      title: 'Unlock account',
      description: 'Clears the failed login attempt counter and removes any lockout, allowing the user to try logging in again.',
      confirmLabel: 'Unlock account',
      icon: Unlock,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50 border-emerald-200',
      confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    };
    case 'send-reset-email': return {
      title: 'Send password reset email',
      description: 'Sends a password reset link to the user. The link expires in 30 minutes.',
      confirmLabel: 'Send reset email',
      icon: Send,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50 border-blue-200',
      confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    };
    default: return {
      title: 'Confirm action',
      description: 'Are you sure you want to perform this action?',
      confirmLabel: 'Confirm',
      icon: Shield,
      iconColor: 'text-slate-600',
      iconBg: 'bg-slate-50 border-slate-200',
      confirmClass: 'bg-primary hover:bg-violet-700 text-white',
    };
  }
}

export default function UserActionModal({ action, user, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState('');
  const [selectedRole, setSelectedRole] = useState(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const cfg = actionConfig(action);
  const Icon = cfg.icon;
  const presets = REASON_PRESETS[action] ?? [];

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      let url = '';
      let method = 'POST';
      let body: Record<string, unknown> = { reason: reason || null };

      switch (action) {
        case 'verify':
          url = '/api/owner-console/users/verify';
          body = { userId: user.userId, reason: reason || null };
          break;
        case 'resend-verification':
          url = `/api/developer/users/${user.userId}/resend-verification`;
          break;
        case 'deactivate':
          url = `/api/developer/users/${user.userId}/deactivate`;
          break;
        case 'reactivate':
          url = `/api/developer/users/${user.userId}/reactivate`;
          break;
        case 'change-role':
          url = `/api/developer/users/${user.userId}/role`;
          method = 'PUT';
          body = { role: selectedRole, reason: reason || null };
          break;
        case 'force-temp-password':
          url = `/api/developer/users/${user.userId}/force-temp-password`;
          break;
        case 'unlock-account':
          url = `/api/developer/users/${user.userId}/unlock-account`;
          break;
        case 'send-reset-email':
          url = `/api/developer/users/${user.userId}/send-reset-email`;
          break;
      }

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string; emailSent?: boolean; tempPassword?: string };
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setLoading(false); return; }

      // For force-temp-password, show the temp password before closing
      if (action === 'force-temp-password' && data.tempPassword) {
        setTempPassword(data.tempPassword);
        setLoading(false);
        return;
      }

      onSuccess(action, user.userId, { role: selectedRole, emailSent: data.emailSent, message: data.message });
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  // Temp password reveal screen
  if (tempPassword) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="px-6 pt-6 pb-4 flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl border bg-violet-50 border-violet-200 flex items-center justify-center shrink-0">
              <KeyRound size={20} className="text-violet-700" />
            </div>
            <div className="flex-1">
              <h2 className="font-black text-slate-900 text-lg">Temporary password set</h2>
              <p className="text-sm text-slate-500 mt-1">Share this with the user securely. It will not be shown again.</p>
            </div>
            <button onClick={() => { onSuccess(action, user.userId, {}); }} className="text-slate-600 hover:text-slate-800 mt-0.5">
              <X size={18} />
            </button>
          </div>
          <div className="mx-6 mb-4 px-4 py-3 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-between gap-3">
            <code className="text-violet-400 font-mono text-lg tracking-widest">{tempPassword}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(tempPassword); }}
              className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              Copy
            </button>
          </div>
          <div className="mx-6 mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-700">
              The user must change this password on their next login. All their active sessions have been revoked.
            </p>
          </div>
          <div className="px-6 pb-6">
            <button
              onClick={() => { onSuccess(action, user.userId, {}); }}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-sm font-bold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
            <Icon size={20} className={cfg.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-slate-900 text-lg leading-tight">{cfg.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{cfg.description}</p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-800 transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* User info */}
        <div className="mx-6 mb-4 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-sm font-bold text-slate-800">{user.name || user.email}</p>
          <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">
            {user.role} · {user.status}
            {user.emailVerified === false && ' · Unverified'}
          </p>
        </div>

        {/* Role selector */}
        {action === 'change-role' && (
          <div className="mx-6 mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-2">New role</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRole(r)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-semibold capitalize transition-colors ${
                    selectedRole === r
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {selectedRole === user.role && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <AlertTriangle size={11} /> This is already the user's current role.
              </p>
            )}
          </div>
        )}

        {/* Reason */}
        <div className="mx-6 mb-4">
          <label className="block text-xs font-bold text-slate-600 mb-2">Reason <span className="font-normal text-slate-400">(optional)</span></label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setReason(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  reason === p
                    ? 'bg-primary text-white border-primary'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-primary/40'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Or type a custom reason…"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (action === 'change-role' && selectedRole === user.role)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2 ${cfg.confirmClass}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {cfg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
