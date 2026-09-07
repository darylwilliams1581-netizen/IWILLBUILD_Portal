/**
 * TermsAcceptanceGate — compact acknowledgement dialog (web + native).
 * Shown once. Does not lock html/body height (that blew out dashboard pages).
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ExternalLink } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';

const TERMS_KEY = 'iwb_terms_accepted_v2';
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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
    setAccepted(true);
    setTimeout(() => onAccepted(), 200);
  }

  return (
    <AnimatePresence>
      {!accepted && (
        <motion.div
          key="terms-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(15,17,23,0.55)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-title"
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl"
            style={{ maxHeight: 'min(72dvh, 560px)' }}
          >
            <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                <Shield size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 id="terms-title" className="text-base font-semibold text-gray-900 leading-tight">
                  Terms & privacy
                </h1>
                <p className="text-xs text-gray-500">v2.0 · Queensland, Australia</p>
              </div>
            </div>

            {isDevAccount && (
              <p className="mx-5 mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Dev account — this prompt always shows for support@iwillbuild.com
              </p>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-600 space-y-3 min-h-0">
              <p>
                IWILLBUILD stores jobs, photos, safety records and GPS while you are signed in.
                By continuing you agree to the Terms of Use, Fair Use, Privacy and System Policy.
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-[13px]">
                <li>No CSAM, image-based abuse, or fake safety records.</li>
                <li>AI (Dazza) is a suggestion — a competent person must review it.</li>
                <li>Templates are starting points, not legal advice.</li>
              </ul>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {[
                  ['/terms', 'Terms of Use'],
                  ['/privacy', 'Privacy'],
                  ['/fair-use', 'Fair Use'],
                  ['/system-policy', 'System Policy'],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-violet-600 hover:text-violet-800 text-xs font-medium"
                  >
                    <ExternalLink size={11} />
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-100 px-5 py-4 space-y-3 bg-white">
              <label className="flex items-start gap-2.5 text-[13px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => setChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600"
                />
                <span>I have read and agree to the Terms, Fair Use, Privacy and System Policy.</span>
              </label>
              <button
                onClick={handleAccept}
                disabled={!checked}
                className={[
                  'w-full py-3 rounded-xl text-sm font-semibold',
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
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-800"
              >
                {declining ? 'Signing out…' : 'Decline — sign out'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
