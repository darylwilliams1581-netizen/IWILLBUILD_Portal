/**
 * TermsAcceptanceGate.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen modal shown ONCE on first use (web + native) requiring the user
 * to accept the Terms of Use, Acceptable Use Policy, and Privacy Policy before
 * accessing the app.
 *
 * Persistence:
 *   localStorage key  'iwb_terms_accepted_v1'
 *   Bump the version suffix (v2, v3 …) to force re-acceptance on policy updates.
 *
 * Sequence (native):  Terms gate → AppPermissionsOnboarding
 * Sequence (web):     Terms gate → app (no permissions walkthrough)
 *
 * Decline: signs the user out and returns them to the login screen.
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, FileText, AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';

// ── Persistence ───────────────────────────────────────────────────────────────

const TERMS_KEY = 'iwb_terms_accepted_v1';

export function hasAcceptedTerms(): boolean {
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onAccepted: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TermsAcceptanceGate({ onAccepted }: Props) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setScrolledToBottom(true);
  }

  async function handleDecline() {
    setDeclining(true);
    try {
      await authClient.signOut();
    } catch { /* ignore */ }
    // Hard reload to login screen
    window.location.href = '/';
  }

  function handleAccept() {
    markTermsAccepted();
    setAccepted(true);
    setTimeout(() => onAccepted(), 350);
  }

  return (
    <AnimatePresence>
      {!accepted && (
        <motion.div
          key="terms-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9999] flex flex-col bg-gray-950"
          style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}
        >
          {/* Header */}
          <div className="flex-none px-5 pt-safe-top pt-6 pb-4 border-b border-gray-800">
            <div className="flex items-center gap-3 max-w-lg mx-auto">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white leading-tight">
                  Terms &amp; Acceptable Use
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  Please read and accept before continuing
                </p>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-5 py-5"
          >
            <div className="max-w-lg mx-auto space-y-6 text-sm text-gray-300 leading-relaxed">

              {/* Intro */}
              <p>
                By using <strong className="text-white">IWILLBUILD</strong> you agree to the
                following terms. These apply to all users — company owners, workers, and
                subcontractors — on both the web portal and the mobile app.
              </p>

              {/* Section 1 — What the app does */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-violet-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">What IWILLBUILD does</h2>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-violet-500">
                  <li>Manages jobs, quotes, invoices, and documents for trade businesses.</li>
                  <li>Stores job photos, SWMS, and safety records in cloud storage (Cloudflare R2, Australian region).</li>
                  <li>Uses GPS location for job tracking — only while the app is active and you have granted permission.</li>
                  <li>Sends push notifications and SMS for job alerts — only with your permission.</li>
                  <li>Processes payments via Stripe. IWILLBUILD does not store card numbers.</li>
                </ul>
              </section>

              {/* Section 2 — Acceptable Use */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">Acceptable Use Policy</h2>
                </div>
                <p>You must not use IWILLBUILD to:</p>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-amber-500">
                  <li>Upload, store, or share unlawful content — including sexual content involving minors, graphic violence, or material that breaches Australian law.</li>
                  <li>Harass, threaten, or impersonate any person.</li>
                  <li>Attempt to access accounts, data, or systems you are not authorised to use.</li>
                  <li>Reverse-engineer, scrape, or abuse the platform's APIs.</li>
                  <li>Use the platform for any purpose other than legitimate trade business operations.</li>
                </ul>
                <p className="text-gray-400 text-xs mt-1">
                  Violations may result in immediate account suspension. Where required by law,
                  content may be reported to eSafety or Australian Police.
                </p>
              </section>

              {/* Section 3 — Image audit */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-violet-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">Photo &amp; image audit</h2>
                </div>
                <p>
                  Job photos stored in IWILLBUILD may be reviewed by an automated audit service
                  operated by the platform owner. The service checks for content that breaches
                  this Acceptable Use Policy. Only review flags are retained — photo bytes are
                  not copied or shared. Clients are not notified of routine review flags.
                  Ordinary work photos (crew, plant, defects, safety evidence) are expected and
                  are not flagged.
                </p>
              </section>

              {/* Section 4 — Liability */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">Liability &amp; disclaimer</h2>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-amber-500">
                  <li>
                    IWILLBUILD is a job management tool. It does not provide legal, financial,
                    or safety compliance advice. You are responsible for ensuring your documents,
                    SWMS, and safety records meet applicable Australian regulations.
                  </li>
                  <li>
                    The platform is provided "as is". To the maximum extent permitted by law,
                    IWILLBUILD is not liable for loss of data, business interruption, or
                    consequential damages arising from use of the platform.
                  </li>
                  <li>
                    You are responsible for all activity under your account. Keep your
                    credentials secure and do not share login access.
                  </li>
                  <li>
                    These terms are governed by the laws of Queensland, Australia.
                  </li>
                </ul>
              </section>

              {/* Section 5 — Full docs links */}
              <section className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 space-y-2">
                <p className="text-xs text-gray-400">Full policy documents:</p>
                <div className="flex flex-col gap-2">
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-violet-400 hover:text-violet-300 transition-colors text-sm"
                  >
                    <ExternalLink size={13} />
                    Terms of Use
                  </a>
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-violet-400 hover:text-violet-300 transition-colors text-sm"
                  >
                    <ExternalLink size={13} />
                    Privacy Policy
                  </a>
                </div>
              </section>

              {/* Scroll nudge — hidden once at bottom */}
              {!scrolledToBottom && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-1 py-2 text-gray-500 text-xs"
                >
                  <ChevronDown size={16} className="animate-bounce" />
                  Scroll to read all terms
                </motion.div>
              )}

              {/* Bottom padding so last content clears the fixed footer */}
              <div className="h-4" />
            </div>
          </div>

          {/* Fixed footer — accept / decline */}
          <div className="flex-none border-t border-gray-800 bg-gray-950 px-5 py-4 pb-safe-bottom">
            <div className="max-w-lg mx-auto space-y-3">

              {/* Accept button — enabled once scrolled to bottom */}
              <button
                onClick={handleAccept}
                disabled={!scrolledToBottom}
                className={[
                  'w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200',
                  scrolledToBottom
                    ? 'bg-violet-600 hover:bg-violet-500 active:scale-[0.98] text-white shadow-lg shadow-violet-900/40'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed',
                ].join(' ')}
              >
                {scrolledToBottom ? 'I agree — continue' : 'Read all terms to continue'}
              </button>

              {/* Decline */}
              <button
                onClick={handleDecline}
                disabled={declining}
                className="w-full py-2.5 rounded-xl text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                {declining ? 'Signing out…' : 'Decline — sign out'}
              </button>

              <p className="text-center text-xs text-gray-600 leading-snug">
                By tapping "I agree" you confirm you have read and accept the Terms of Use,
                Acceptable Use Policy, and Privacy Policy.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
