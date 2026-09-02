/**
 * PwaInstallPrompt
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a dismissible install banner when:
 *  - The browser fires the `beforeinstallprompt` event (Android Chrome / Edge)
 *  - OR the user is on iOS Safari (manual Add to Home Screen instructions)
 *
 * Dismissed state is persisted in localStorage so it doesn't re-appear.
 * Never shown when already running in standalone mode.
 */
import { useEffect, useState } from 'react';
import { X, Download, Share } from 'lucide-react';

// Extend Window for the non-standard beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'iwb_pwa_install_dismissed';
const SNOOZE_KEY    = 'iwb_pwa_install_snooze';
const SNOOZE_MS     = 3 * 24 * 60 * 60 * 1000; // 3 days

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isSafari(): boolean {
  if (typeof window === 'undefined') return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed or permanently dismissed
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Respect snooze
    const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
    if (snoozeUntil && Date.now() < Number(snoozeUntil)) return;

    // iOS Safari — no beforeinstallprompt, show manual instructions
    if (isIos() && isSafari()) {
      setShowIosHint(true);
      setVisible(true);
      return;
    }

    // Android / Chrome / Edge — listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // If already installed, hide
    window.addEventListener('appinstalled', () => setVisible(false));

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  function handleDismiss() {
    // X button = snooze 3 days (not permanent)
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setVisible(false);
  }

  function handleNeverShow() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Install IWIllBUILD app"
      className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto"
    >
      <div className="bg-gray-900 border border-violet-600/40 rounded-2xl shadow-2xl p-4 flex gap-3 items-start">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-white font-black text-sm leading-none">IW</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight">Install IWIllBUILD</p>

          {showIosHint ? (
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Tap{' '}
              <span className="inline-flex items-center gap-0.5 text-violet-400 font-medium">
                <Share size={11} className="inline" /> Share
              </span>
              {' '}then{' '}
              <span className="text-violet-400 font-medium">Add to Home Screen</span>
              {' '}to install.
            </p>
          ) : (
            <p className="text-gray-400 text-xs mt-1">
              Add to your home screen for quick access.
            </p>
          )}

          {!showIosHint && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-2 flex items-center gap-1.5 bg-violet-500 hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download size={12} />
              Install App
            </button>
          )}
        </div>

        {/* Dismiss (snooze) */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={handleDismiss}
            aria-label="Remind me later"
            className="text-gray-500 hover:text-gray-300 transition-colors mt-0.5"
          >
            <X size={16} />
          </button>
          <button
            onClick={handleNeverShow}
            className="text-gray-600 hover:text-gray-400 text-[10px] underline underline-offset-2 transition-colors whitespace-nowrap"
          >
            Don't show again
          </button>
        </div>
      </div>
    </div>
  );
}
