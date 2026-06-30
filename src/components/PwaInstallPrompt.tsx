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
    // Don't show if already installed or previously dismissed
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

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
      aria-label="Install IWILLBUILD app"
      className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto"
    >
      <div className="bg-gray-900 border border-orange-500/40 rounded-2xl shadow-2xl p-4 flex gap-3 items-start">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-white font-black text-sm leading-none">IW</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight">Install IWILLBUILD</p>

          {showIosHint ? (
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Tap{' '}
              <span className="inline-flex items-center gap-0.5 text-orange-400 font-medium">
                <Share size={11} className="inline" /> Share
              </span>
              {' '}then{' '}
              <span className="text-orange-400 font-medium">Add to Home Screen</span>
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
              className="mt-2 flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download size={12} />
              Install App
            </button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
