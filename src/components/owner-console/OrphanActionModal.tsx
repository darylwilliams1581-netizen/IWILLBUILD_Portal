import { useState, useEffect } from 'react';
import {
  X, Loader2, AlertTriangle, Building2, Trash2, Mail,
  CheckCircle2, RefreshCw,
} from 'lucide-react';
import type { OrphanUser, OrphanAction } from './OrphanActionsMenu';

interface Company {
  id: number;
  name: string;
}

interface Props {
  action: OrphanAction;
  user: OrphanUser;
  onClose: () => void;
  onSuccess: (action: OrphanAction, userId: string, extra?: Record<string, unknown>) => void;
}

const ROLE_OPTIONS = ['owner', 'admin', 'member', 'viewer'] as const;

export default function OrphanActionModal({ action, user, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('member');
  const [reason, setReason] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  // Load companies for assign action
  useEffect(() => {
    if (action !== 'assign-company') return;
    fetch('/api/owner-console/companies', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { companies?: Company[] }) => setCompanies(d.companies ?? []))
      .catch(() => setError('Failed to load companies.'));
  }, [action]);

  const cfg = {
    'assign-company': {
      title: 'Assign to existing company',
      description: 'Creates a profile for this user and links them to the selected company.',
      confirmLabel: 'Assign user',
      icon: Building2,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50 border-blue-200',
      confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    'delete-orphan': {
      title: 'Delete orphaned account',
      description: 'Permanently deletes this auth account. Only allowed if no company data exists.',
      confirmLabel: 'Delete permanently',
      icon: Trash2,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-50 border-red-200',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
    },
    'send-reset': {
      title: 'Send password reset email',
      description: 'Sends a password reset link to this user\'s email address.',
      confirmLabel: 'Send reset email',
      icon: Mail,
      iconColor: 'text-slate-600',
      iconBg: 'bg-slate-50 border-slate-200',
      confirmClass: 'bg-primary hover:bg-orange-600 text-white',
    },
    'verify-orphan': {
      title: 'Verify email manually',
      description: 'Marks this user\'s email as verified so they can log in.',
      confirmLabel: 'Verify manually',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-50 border-emerald-200',
      confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    'resume-setup': {
      title: 'Resume setup',
      description: 'Sends the user a link to continue their incomplete signup. They will need to re-enter company details.',
      confirmLabel: 'Send resume link',
      icon: RefreshCw,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50 border-blue-200',
      confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
  }[action];

  const Icon = cfg.icon;

  const canConfirm = () => {
    if (action === 'assign-company') return selectedCompanyId !== null;
    if (action === 'delete-orphan') return deleteConfirmed;
    return true;
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      let url = '';
      let method = 'POST';
      let body: Record<string, unknown> = { reason: reason || null };

      switch (action) {
        case 'assign-company':
          url = `/api/developer/users/${user.userId}/assign-company`;
          body = { companyId: selectedCompanyId, role: selectedRole, reason: reason || null };
          break;
        case 'delete-orphan':
          url = `/api/developer/users/${user.userId}/delete-orphan`;
          body = { confirmed: true, reason: reason || null };
          break;
        case 'send-reset':
          url = '/api/auth/forgot-password';
          body = { email: user.email };
          break;
        case 'verify-orphan':
          url = '/api/owner-console/users/verify';
          body = { userId: user.userId, reason: reason || 'Manual verify of orphaned account' };
          break;
        case 'resume-setup':
          // Send a password reset email — user can reset password and then resume signup
          url = '/api/auth/forgot-password';
          body = { email: user.email };
          break;
      }

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // forgot-password always returns 200 (generic response)
      if (action === 'send-reset' || action === 'resume-setup') {
        onSuccess(action, user.userId, {});
        return;
      }

      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setLoading(false); return; }
      onSuccess(action, user.userId, { companyId: selectedCompanyId, role: selectedRole });
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* User info */}
        <div className="mx-6 mb-4 px-4 py-3 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
              Incomplete signup
            </span>
          </div>
          <p className="text-sm font-bold text-slate-800">{user.name || user.email}</p>
          <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {user.emailVerified ? 'Email verified' : 'Email not verified'} · No profile · No company
          </p>
        </div>

        {/* Assign company: company + role selectors */}
        {action === 'assign-company' && (
          <div className="mx-6 mb-4 flex flex-col gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Select company</label>
              {companies.length === 0 ? (
                <p className="text-xs text-slate-400">Loading companies…</p>
              ) : (
                <select
                  value={selectedCompanyId ?? ''}
                  onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-primary/60 transition-colors"
                >
                  <option value="">— Choose a company —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRole(r)}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold capitalize transition-colors ${
                      selectedRole === r
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-primary/40'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Delete: confirmation checkbox */}
        {action === 'delete-orphan' && (
          <div className="mx-6 mb-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(e) => setDeleteConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-slate-700">
                I confirm this is a test or abandoned account with no company data. This action is <strong>permanent</strong> and cannot be undone.
              </span>
            </label>
          </div>
        )}

        {/* Reason */}
        {(action === 'assign-company' || action === 'delete-orphan') && (
          <div className="mx-6 mb-4">
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              Reason <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Test account, Signup interrupted…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>
        )}

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
            disabled={loading || !canConfirm()}
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
