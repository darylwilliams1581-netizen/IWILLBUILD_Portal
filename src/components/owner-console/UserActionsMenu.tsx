import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, CheckCircle2, XCircle,
  UserCheck, Mail, Shield, Eye, Trash2, MonitorSmartphone,
  KeyRound, Unlock, Send,
} from 'lucide-react';

export interface OcUserForActions {
  id: number;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified?: boolean;
  companyId: number | null;
}

export type UserAction =
  | 'verify'
  | 'resend-verification'
  | 'deactivate'
  | 'reactivate'
  | 'change-role'
  | 'impersonate'
  | 'view-sessions'
  | 'revoke-sessions'
  | 'force-temp-password'
  | 'unlock-account'
  | 'send-reset-email';

interface Props {
  user: OcUserForActions;
  onAction: (action: UserAction, user: OcUserForActions) => void;
}

export default function UserActionsMenu({ user, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const trigger = (action: UserAction) => {
    setOpen(false);
    onAction(action, user);
  };

  const isInactive = user.status === 'inactive';
  const isVerified = user.emailVerified !== false;

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        title="User actions"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, maxHeight: `calc(100vh - ${pos.top + 8}px)`, overflowY: 'auto' }}
          className="w-56 bg-white rounded-xl border border-slate-200 shadow-xl py-1"
        >
          {!isVerified && (
            <button onClick={() => trigger('verify')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors">
              <CheckCircle2 size={14} />Verify manually
            </button>
          )}
          {!isVerified && (
            <button onClick={() => trigger('resend-verification')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
              <Mail size={14} />Resend verification
            </button>
          )}
          <button onClick={() => trigger('change-role')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <Shield size={14} />Change role
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button onClick={() => trigger('impersonate')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-orange-600 hover:bg-orange-50 transition-colors">
            <Eye size={14} />View as user
          </button>
          <button onClick={() => trigger('view-sessions')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <MonitorSmartphone size={14} />View sessions
          </button>
          <button onClick={() => trigger('revoke-sessions')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 transition-colors">
            <Trash2 size={14} />Force logout
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button onClick={() => trigger('force-temp-password')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-orange-600 hover:bg-orange-50 transition-colors">
            <KeyRound size={14} />Set temp password
          </button>
          <button onClick={() => trigger('unlock-account')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors">
            <Unlock size={14} />Unlock account
          </button>
          <button onClick={() => trigger('send-reset-email')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
            <Send size={14} />Send reset email
          </button>
          <div className="my-1 border-t border-slate-100" />
          {isInactive ? (
            <button onClick={() => trigger('reactivate')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors">
              <UserCheck size={14} />Reactivate account
            </button>
          ) : (
            <button onClick={() => trigger('deactivate')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
              <XCircle size={14} />Deactivate account
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
