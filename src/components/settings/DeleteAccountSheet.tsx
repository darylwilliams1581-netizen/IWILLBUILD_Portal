import { useState } from 'react';
import { AlertCircle, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import { useMe } from '@/lib/usePermissions';

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

export function DeleteAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { me } = useMe();
  const isOwner = me?.profile?.role === 'owner';
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteCompanyData, setDeleteCompanyData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  function close() {
    if (deletingAccount) return;
    setDeletePassword('');
    setDeleteConfirmation('');
    setDeleteCompanyData(false);
    setDeleteError('');
    onClose();
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError('');
    if (!deletePassword.trim()) {
      setDeleteError('Current password is required.');
      return;
    }
    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Type DELETE exactly to confirm.');
      return;
    }
    if (isOwner && !deleteCompanyData) {
      setDeleteError('Confirm that the company data will also be deleted.');
      return;
    }

    setDeletingAccount(true);
    try {
      const res = await fetch('/api/me/delete-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: deletePassword,
          confirmation: deleteConfirmation,
          deleteCompanyData: isOwner ? deleteCompanyData : false,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        setDeleteError(data.message ?? data.error ?? 'Account deletion failed. No data was deleted.');
        return;
      }

      try { window.localStorage.clear(); } catch { /* best effort */ }
      try { window.sessionStorage.clear(); } catch { /* best effort */ }
      window.location.replace('/login?accountDeleted=1');
    } catch {
      setDeleteError('Network error. No data was deleted. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
      <div
        className="w-full max-w-lg overflow-y-auto rounded-t-2xl border border-red-200 bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6"
        style={{ maxHeight: 'min(560px, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px))', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="delete-account-title" className="flex items-center gap-2 text-base font-bold text-red-700"><ShieldAlert size={16} />Delete account</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {isOwner
                ? 'If you are the only active member, this also deletes the company and its jobs, documents and files. Transfer ownership first if other team members remain.'
                : 'Your login and personal profile will be deleted. Company-owned job records and files stay with the company.'}
            </p>
          </div>
          <button type="button" aria-label="Close" disabled={deletingAccount} onClick={close} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleDeleteAccount} className="flex flex-col gap-4">
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 leading-relaxed">
            This cannot be undone. {isOwner ? 'Your company data will be permanently removed and any linked subscription will be cancelled first.' : 'You will immediately lose access to this account.'}
          </div>
          <div>
            <label className={labelClass}>Current Password</label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
              className={inputClass}
              placeholder="Enter your current password"
            />
          </div>
          <div>
            <label className={labelClass}>Type DELETE to confirm</label>
            <input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              className={inputClass}
              placeholder="DELETE"
            />
          </div>
          {isOwner && (
            <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-white px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={deleteCompanyData}
                onChange={(e) => setDeleteCompanyData(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-red-600"
              />
              <span>I understand that deleting my sole-owner account also permanently deletes the company and its data.</span>
            </label>
          )}
          {deleteError && (
            <div className="flex items-start gap-2 text-red-700 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />{deleteError}
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={deletingAccount}
              onClick={close}
              className="w-full sm:w-auto min-h-[44px] rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deletingAccount || !deletePassword || deleteConfirmation !== 'DELETE' || (isOwner && !deleteCompanyData)}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingAccount ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Permanently Delete Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteAccountEntry() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-red-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-red-700"><ShieldAlert size={16} />Delete account</h2>
        <p className="mt-1 text-sm text-slate-600">Permanently remove your IWILLBUILD account and access.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 sm:w-auto"
        >
          <Trash2 size={16} />Delete account
        </button>
      </div>
      <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
