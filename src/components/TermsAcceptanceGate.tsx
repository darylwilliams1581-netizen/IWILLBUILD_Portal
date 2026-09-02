/**
 * TermsAcceptanceGate.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen modal shown ONCE on first use (web + native) requiring the user
 * to accept the Terms of Use, Fair Use Policy, and Privacy Policy before
 * accessing the app.
 *
 * Persistence:
 *   localStorage key  'iwb_terms_accepted_v2'
 *   Bump the version suffix (v3, v4 …) to force re-acceptance on policy updates.
 *   v2 — bumped 3 Sep 2026 for Terms v2.0 / Privacy v2.0 / new Fair Use &
 *         System Policy pages.
 *
 * Sequence (native):  Terms gate → AppPermissionsOnboarding
 * Sequence (web):     Terms gate → app (no permissions walkthrough)
 *
 * Decline: signs the user out and returns them to the login screen.
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, FileText, AlertTriangle, ChevronDown, ExternalLink, Cpu } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';

// ── Persistence ───────────────────────────────────────────────────────────────

const TERMS_KEY = 'iwb_terms_accepted_v2';
const DEV_TEST_EMAIL = 'support@iwillbuild.com';

export function hasAcceptedTerms(email?: string): boolean {
  // Developer test account always sees the gate — never skip it
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onAccepted: () => void;
  userEmail?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TermsAcceptanceGate({ onAccepted, userEmail }: Props) {
  const isDevAccount = userEmail?.toLowerCase() === DEV_TEST_EMAIL;
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
    window.location.href = '/';
  }

  function handleAccept() {
    // Don't persist acceptance for the dev test account — gate always re-shows
    if (!isDevAccount) markTermsAccepted();
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
          {/* ── Header ── */}
          <div className="flex-none px-5 pt-safe-top pt-6 pb-4 border-b border-gray-800">

            {/* Developer test account banner */}
            {isDevAccount && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-2">
                <span className="text-amber-400 text-xs font-bold tracking-wide uppercase shrink-0">
                  Dev / Test Account
                </span>
                <span className="text-amber-300/80 text-xs leading-snug">
                  This gate always shows for{' '}
                  <strong className="text-amber-300">support@iwillbuild.com</strong> — acceptance
                  is not persisted for this account.
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 max-w-lg mx-auto">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white leading-tight">
                  Terms, Fair Use &amp; Privacy
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  Please read and accept before continuing — v2.0, 3 Sep 2026
                </p>
              </div>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-5 py-5"
          >
            <div className="max-w-lg mx-auto space-y-6 text-sm text-gray-300 leading-relaxed">

              {/* Intro */}
              <p>
                By using <strong className="text-white">IWILLBUILD</strong> you agree to the
                following terms. These apply to all users — company owners, workers and
                subcontractors — on both the web portal and the mobile app. These terms are
                governed by the laws of Queensland, Australia. New Zealand consumer law
                provisions apply where relevant.
              </p>

              {/* Section 1 — What the app does */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-violet-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">What IWILLBUILD does</h2>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-violet-500">
                  <li>Manages jobs, quotes, invoices, safety records and documents for trade businesses.</li>
                  <li>Stores job photos, SWMS, permits and field records in cloud storage.</li>
                  <li>Uses GPS location for job tracking — only while the app is active and you have granted permission.</li>
                  <li>Sends push notifications and SMS for job alerts — only with your permission.</li>
                  <li>Processes payments via Stripe. IWILLBUILD does not store card numbers or CVV values.</li>
                  <li>Provides AI-assisted tools (Dazza AI) to help search, draft and summarise information you are already authorised to access. AI outputs are suggestions — a competent person must review them before relying on them for safety, legal or compliance decisions.</li>
                </ul>
              </section>

              {/* Section 2 — Fair Use */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">Fair Use Policy</h2>
                </div>
                <p>You must not use IWILLBUILD to:</p>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-amber-500">
                  <li>
                    <strong className="text-white">Upload, store or share child sexual abuse material (CSAM).</strong>{' '}
                    This is a zero-tolerance rule. Detected CSAM will be reported to the Australian
                    Federal Police without notice.
                  </li>
                  <li>Upload or share non-consensual intimate images (image-based abuse).</li>
                  <li>Create, store or share fraudulent safety records, forged signatures or falsified documents.</li>
                  <li>Harass, threaten, impersonate or discriminate against any person.</li>
                  <li>Attempt to access accounts, data or systems you are not authorised to use.</li>
                  <li>Reverse-engineer, scrape or abuse the platform's APIs.</li>
                  <li>Use the platform for any purpose other than legitimate trade business operations.</li>
                </ul>
                <p className="text-gray-400 text-xs mt-1">
                  Violations may result in immediate account suspension and, where required by law,
                  disclosure to eSafety, the Australian Federal Police or other authorities.
                </p>
              </section>

              {/* Section 3 — Image Safeguard */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-violet-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">Image Safeguard Protocol</h2>
                </div>
                <p>
                  Job photos stored in IWILLBUILD may be included in periodic, bounded Image
                  Safeguard reviews initiated by an authorised IWILLBUILD platform owner. The
                  safeguard may detect the apparent presence of a face as a privacy signal for
                  possible human review by authorised support personnel.
                </p>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-violet-500">
                  <li>The safeguard does not identify people, determine age or prove misconduct.</li>
                  <li>It does not automatically delete, quarantine or report images based on a signal alone.</li>
                  <li>Ordinary work photos are not blocked merely because a face may be present.</li>
                  <li>A sharing acknowledgement may appear before images are emailed or shared.</li>
                </ul>
              </section>

              {/* Section 4 — AI tools */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-violet-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">AI-assisted tools</h2>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-violet-500">
                  <li>Dazza AI and other AI tools operate within your existing role permissions.</li>
                  <li>AI outputs are suggestions only — they may be incomplete or incorrect.</li>
                  <li>A competent person must review AI-generated SWMS, safety documents and records before use on any worksite.</li>
                  <li>IWILLBUILD does not use your job records or photos to train public AI models.</li>
                </ul>
              </section>

              {/* Section 5 — Safety docs disclaimer */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">Safety documents &amp; professional advice</h2>
                </div>
                <p>
                  Templates, SWMS, risk assessments, permits and safety materials are starting
                  points only. They must be reviewed, adapted and approved by a competent person
                  for the actual work, site, jurisdiction and hazards. IWILLBUILD does not provide
                  legal, engineering, safety or compliance advice. You are solely responsible for
                  compliance with all applicable laws, codes and regulations.
                </p>
              </section>

              {/* Section 6 — Liability */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <h2 className="text-sm font-semibold text-white">Liability &amp; disclaimer</h2>
                </div>
                <ul className="space-y-1.5 pl-4 list-disc marker:text-amber-500">
                  <li>
                    Nothing in these terms excludes rights that cannot lawfully be excluded,
                    including rights under the <em>Australian Consumer Law</em> or applicable New
                    Zealand consumer law.
                  </li>
                  <li>
                    Subject to those non-excludable rights, the platform is provided with
                    reasonable care and skill but is not warranted to be uninterrupted or
                    error-free.
                  </li>
                  <li>
                    You are responsible for all activity under your account. Keep your credentials
                    secure and do not share login access.
                  </li>
                  <li>These terms are governed by the laws of Queensland, Australia.</li>
                </ul>
              </section>

              {/* Section 7 — Full docs links */}
              <section className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 space-y-2">
                <p className="text-xs text-gray-400 font-medium">Full policy documents (open in new tab):</p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors text-sm"
                  >
                    <ExternalLink size={12} />
                    Terms of Use
                  </a>
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors text-sm"
                  >
                    <ExternalLink size={12} />
                    Privacy Policy
                  </a>
                  <a
                    href="/fair-use"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors text-sm"
                  >
                    <ExternalLink size={12} />
                    Fair Use Policy
                  </a>
                  <a
                    href="/system-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors text-sm"
                  >
                    <ExternalLink size={12} />
                    System Policy
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

          {/* ── Fixed footer — accept / decline ── */}
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
                Fair Use Policy, Privacy Policy and System Policy (v2.0, 3 Sep 2026).
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
