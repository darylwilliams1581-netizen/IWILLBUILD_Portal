import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, Trash2, Building2, Mail, CheckCircle2, RefreshCw,
} from 'lucide-react';

export interface OrphanUser {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export type OrphanAction =
  | 'assign-company'
  | 'delete-orphan'
  | 'send-reset'
  | 'verify-orphan'
  | 'resume-setup';

interface Props {
  user: OrphanUser;
  onAction: (action: OrphanAction, user: OrphanUser) => void;
}

export default function OrphanActionsMenu({ user, onAction }: Props) {
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

  const trigger = (action: OrphanAction) => {
    setOpen(false);
    onAction(action, user);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        title="Orphan user actions"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, maxHeight: `calc(100vh - ${pos.top + 8}px)`, overflowY: 'auto' }}
          className="w-56 bg-white rounded-xl border border-slate-200 shadow-xl py-1"
        >
          <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Incomplete Account</p>
          </div>
          <button onClick={() => trigger('resume-setup')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
            <RefreshCw size={14} />Resume setup
          </button>
          <button onClick={() => trigger('assign-company')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <Building2 size={14} />Assign to company
          </button>
          {!user.emailVerified && (
            <button onClick={() => trigger('verify-orphan')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors">
              <CheckCircle2 size={14} />Verify email manually
            </button>
          )}
          <button onClick={() => trigger('send-reset')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <Mail size={14} />Send password reset
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button onClick={() => trigger('delete-orphan')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />Delete orphan account
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
