/**
 * TermsAcceptanceGate — one scrollable legal document + sticky acknowledgement.
 * Does not lock html/body height (that blew out dashboard pages).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
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
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const previousBodyOverflow = useRef<string | null>(null);

  const restoreBodyOverflow = useCallback(() => {
    if (previousBodyOverflow.current === null) return;
    document.body.style.overflow = previousBodyOverflow.current;
    previousBodyOverflow.current = null;
    document.body.style.removeProperty('height');
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('height');
  }, []);

  useEffect(() => {
    previousBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return restoreBodyOverflow;
  }, [restoreBodyOverflow]);

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
    restoreBodyOverflow();
    setAccepted(true);
    setTimeout(() => onAccepted(), 200);
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {!accepted && (
        <motion.div
          key="terms-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-4"
          style={{
            background: 'rgba(15,17,23,0.72)',
            paddingTop: 'max(env(safe-area-inset-top), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{
              width: 'calc(100% - 8px)',
              maxWidth: '24rem',
              maxHeight: 'calc(100% - 24px)',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-title"
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-gray-100 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600">
                <Shield size={14} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 id="terms-title" className="text-sm font-semibold leading-tight text-gray-900">
                  Terms & privacy
                </h1>
                <p className="text-[11px] text-gray-500">
                  {LEGAL_VERSION} · {LEGAL_JURISDICTION}
                </p>
              </div>
            </div>

            {isDevAccount && (
              <p className="mx-4 mt-2 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Dev account — this prompt always shows for support@iwillbuild.com
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              <LegalDocument />
            </div>

            <div className="shrink-0 space-y-2 border-t border-gray-100 bg-white px-4 py-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-gray-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => setChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-violet-600"
                />
                <span>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
