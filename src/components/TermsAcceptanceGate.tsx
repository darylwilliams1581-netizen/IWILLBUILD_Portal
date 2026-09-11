/**
 * TermsAcceptanceGate — first screen after login, not an overlay on Home.
 * Lives inside AppShell so it is clipped by the same overflow-x-hidden box.
 */
import { useState } from 'react';
import { Shield } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';
import LegalDocument, { LEGAL_VERSION, LEGAL_JURISDICTION } from '@/content/legal/LegalDocument';

const TERMS_KEY = 'iwb_terms_accepted_v3';
const DEV_TEST_EMAIL = 'support@iwillbuild.com';

export function hasAcceptedTerms(email?: string): boolean {
  if (email?.toLowerCase() === DEV_TEST_EMAIL) return false;
  try {
    return localStorage.getItem(TERMS_KEY) === 'true';
  } catch {
    return false;
  }
}

function markTermsAccepted(): void {
  try {
    localStorage.setItem(TERMS_KEY, 'true');
  } catch { /* storage unavailable */ }
}

interface Props {
  onAccepted: () => void;
  userEmail?: string;
}

export default function TermsAcceptanceGate({ onAccepted, userEmail }: Props) {
  const isDevAccount = userEmail?.toLowerCase() === DEV_TEST_EMAIL;
  const [declining, setDeclining] = useState(false);
  const [checked, setChecked] = useState(false);

  async function handleDecline() {
    setDeclining(true);
    try {
      await authClient.signOut();
    } catch { /* ignore */ }
    window.location.href = '/';
  }

  function handleAccept() {
    if (!checked) return;
    if (!isDevAccount) markTermsAccepted();
    onAccepted();
  }

  return (
    <div
      className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden bg-[#edf0f5] p-3"
      style={{ minWidth: 0, maxWidth: '100%' }}
    >
      <div
        className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
      >
        <div className="flex min-w-0 shrink-0 items-center gap-2.5 border-b border-gray-100 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600">
            <Shield size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 id="terms-title" className="truncate text-sm font-semibold leading-tight text-gray-900">
              Terms & privacy
            </h1>
            <p className="truncate text-[11px] text-gray-500">
              {LEGAL_VERSION} · {LEGAL_JURISDICTION}
            </p>
          </div>
        </div>

        {isDevAccount && (
          <p className="mx-3 mt-2 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Dev account — this prompt always shows for support@iwillbuild.com
          </p>
        )}

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3">
          <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
            <LegalDocument />
          </div>
        </div>

        <div className="min-w-0 shrink-0 space-y-2 border-t border-gray-100 bg-white px-3 py-3">
          <label className="flex min-w-0 cursor-pointer items-start gap-2 text-xs leading-snug text-gray-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-violet-600"
            />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              I have read and agree to the Terms of Use, Fair Use, Privacy and System Policy.
            </span>
          </label>
          <button
            onClick={handleAccept}
            disabled={!checked}
            className={[
              'w-full rounded-xl py-2.5 text-sm font-semibold',
              checked
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            I agree — continue
          </button>
          <button
            onClick={handleDecline}
            disabled={declining}
            className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-800"
          >
            {declining ? 'Signing out…' : 'Decline — sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}
