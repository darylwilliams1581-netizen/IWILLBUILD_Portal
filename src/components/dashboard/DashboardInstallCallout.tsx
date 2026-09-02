/**
 * DashboardInstallCallout
 * ─────────────────────────────────────────────────────────────────────────────
 * A compact install-promotion card shown on the dashboard for users who
 * haven't installed the PWA yet. Respects the same snooze/dismiss state
 * as PwaInstallPrompt so they don't fight each other.
 *
 * Hidden when:
 *  - Already running in standalone mode (already installed)
 *  - User has permanently dismissed it
 *  - User has snoozed it (3-day snooze)
 */
import { useState, useEffect } from 'react';
import { Smartphone, X, Download, Share } from 'lucide-react';
import { Link } from "react-router";
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
  }>;
}
const DISMISSED_KEY = 'iwb_pwa_dash_dismissed';
const SNOOZE_KEY = 'iwb_pwa_dash_snooze';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || 'standalone' in window.navigator && (window.navigator as {
    standalone?: boolean;
  }).standalone === true;
}
function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isSafari(): boolean {
  if (typeof window === 'undefined') return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}
export default function DashboardInstallCallout() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = useState(false);
  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
    if (snoozeUntil && Date.now() < Number(snoozeUntil)) return;
    if (isIos() && isSafari()) {
      setIsIosSafari(true);
      setVisible(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setVisible(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }
  function handleSnooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setVisible(false);
  }
  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const {
      outcome
    } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setDeferredPrompt(null);
  }
  if (!visible) return null;
  return <div className="mb-5 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-amber-50 px-4 py-3.5 flex items-center gap-3">
      {/* Icon */}
      <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
        <Smartphone size={17} className="text-white" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 leading-tight">
          Install IWIllBUILD on your device
        </p>
        {isIosSafari ? <p className="text-xs text-slate-500 mt-0.5">
            Tap <Share size={10} className="inline mx-0.5 text-violet-600" /> Share → <span className="font-medium text-violet-700">Add to Home Screen</span> for instant access.
          </p> : <p className="text-xs text-slate-500 mt-0.5">
            Add to your home screen in 5 seconds — no app store needed.
          </p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {deferredPrompt && !isIosSafari && <button onClick={handleInstall} className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
            <Download size={12} />
            Install
          </button>}
        {isIosSafari && <Link to="/settings?tab=install" className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
            How to install
          </Link>}
        {!deferredPrompt && !isIosSafari && <Link to="/settings?tab=install" className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
            <Download size={12} />
            Install
          </Link>}
        <button onClick={handleSnooze} title="Remind me later" className="text-slate-600 hover:text-slate-800 transition-colors p-1">
          <X size={15} />
        </button>
      </div>

      {/* Permanent dismiss — small link */}
      <button onClick={handleDismiss} className="hidden sm:block text-xs text-slate-600 hover:text-slate-800 underline underline-offset-2 shrink-0 whitespace-nowrap">
        Don't show again
      </button>
    </div>;
}
