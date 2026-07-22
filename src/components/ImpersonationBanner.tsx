/**
 * ImpersonationBanner
 * Reads the `iwb_impersonate` cookie and shows a persistent orange banner
 * when a developer is viewing the portal as another user.
 *
 * The banner:
 *  - Shows the target user's name/email and role
 *  - Shows "READ ONLY" badge
 *  - Has an "End session" button that clears the cookie and calls the API
 *  - Cannot be dismissed without ending the session
 */
import { useEffect, useState } from 'react';
import { Eye, X, ShieldAlert } from 'lucide-react';

interface ImpersonationPayload {
  targetUserId: string;
  targetEmail: string;
  targetName: string;
  targetRole: string;
  targetCompanyId: number | null;
  devUserId: string;
  devEmail: string;
  startedAt: string;
  readOnly: boolean;
}

function readImpersonateCookie(): ImpersonationPayload | null {
  try {
    const match = document.cookie.split('; ').find(c => c.startsWith('iwb_impersonate='));
    if (!match) return null;
    const value = match.split('=').slice(1).join('=');
    return JSON.parse(atob(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

export default function ImpersonationBanner() {
  const [payload, setPayload] = useState<ImpersonationPayload | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const check = () => setPayload(readImpersonateCookie());
    check();
    // Re-check every 30s in case cookie expires
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!payload) return null;

  async function endSession() {
    if (!payload) return;
    setEnding(true);
    try {
      await fetch(`/api/developer/users/${payload.targetUserId}/impersonate`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch { /* best effort */ }
    // Clear cookie client-side as fallback
    document.cookie = 'iwb_impersonate=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setPayload(null);
    setEnding(false);
    // Reload to restore normal session state
    window.location.href = '/owner-console?tab=users';
  }

  const startedAt = new Date(payload.startedAt);
  const timeStr = startedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] bg-orange-500 text-white shadow-lg"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
        {/* Icon */}
        <div className="flex items-center gap-2 shrink-0">
          <Eye size={16} />
          <span className="font-bold text-sm uppercase tracking-wide">Support View</span>
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-orange-300 shrink-0" />

        {/* Target info */}
        <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
          <span className="font-medium truncate">
            Viewing as <strong>{payload.targetName}</strong>
            {payload.targetName !== payload.targetEmail && (
              <span className="opacity-75 ml-1">({payload.targetEmail})</span>
            )}
          </span>
          <span className="bg-orange-600 text-orange-100 text-xs px-2 py-0.5 rounded-full font-medium shrink-0">
            {payload.targetRole}
          </span>
        </div>

        {/* Read-only badge */}
        <div className="flex items-center gap-1.5 bg-orange-600 text-orange-100 text-xs px-2.5 py-1 rounded-full shrink-0">
          <ShieldAlert size={11} />
          <span className="font-semibold">READ ONLY</span>
        </div>

        {/* Started at */}
        <span className="text-orange-200 text-xs shrink-0 hidden sm:block">
          Started {timeStr}
        </span>

        {/* End session */}
        <button
          onClick={endSession}
          disabled={ending}
          className="flex items-center gap-1.5 bg-white text-orange-600 hover:bg-orange-50 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-60"
        >
          <X size={12} />
          {ending ? 'Ending…' : 'End session'}
        </button>
      </div>
    </div>
  );
}
