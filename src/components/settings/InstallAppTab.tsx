/**
 * InstallAppTab
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings tab that promotes PWA installation with platform-specific
 * step-by-step instructions. Also exposes a manual "Install Now" trigger
 * for Android/Chrome/Edge users.
 */
import { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  Share2,
  MoreVertical,
  CheckCircle2,
  Monitor,
  Chrome,
  Zap,
  WifiOff,
  Bell,
  LayoutDashboard,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'iwb_pwa_install_dismissed';
const SNOOZE_KEY = 'iwb_pwa_install_snooze';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

function getPlatform(): 'ios' | 'android' | 'desktop-chrome' | 'desktop-other' {
  if (typeof window === 'undefined') return 'desktop-other';
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'desktop-chrome';
  if (/edg/i.test(ua)) return 'desktop-chrome'; // Edge also supports install
  return 'desktop-other';
}

const benefits = [
  { icon: Zap, label: 'Instant launch', desc: 'Opens in under a second, no browser chrome.' },
  { icon: WifiOff, label: 'Works offline', desc: 'Core app shell loads even without signal.' },
  { icon: Bell, label: 'Push notifications', desc: 'Get job alerts and emergency beacons.' },
  { icon: LayoutDashboard, label: 'Full-screen experience', desc: 'No address bar — feels like a native app.' },
];

export default function InstallAppTab() {
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const platform = getPlatform();

  useEffect(() => {
    setInstalled(isStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setJustInstalled(true);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setJustInstalled(true);
        // Clear any previous dismissal so the banner doesn't re-appear
        localStorage.removeItem(DISMISSED_KEY);
        localStorage.removeItem(SNOOZE_KEY);
      }
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  }

  if (installed || justInstalled) {
    return (
      <div className="max-w-lg">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex items-start gap-4">
          <CheckCircle2 size={28} className="text-green-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-green-800 text-base">
              {justInstalled ? 'App installed successfully!' : 'Already installed'}
            </h3>
            <p className="text-green-700 text-sm mt-1">
              IWIllBUIlD is installed on this device. You can launch it directly from your home screen or app launcher.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Smartphone size={20} className="text-primary" />
          Install IWIllBUIlD App
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Add IWIllBUIlD to your home screen for instant access — no app store required. Takes about 5 seconds.
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {benefits.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Platform-specific instructions */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          {platform === 'ios' ? (
            <Smartphone size={15} className="text-slate-500" />
          ) : platform === 'android' ? (
            <Smartphone size={15} className="text-slate-500" />
          ) : (
            <Monitor size={15} className="text-slate-500" />
          )}
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            {platform === 'ios'
              ? 'iPhone / iPad — Safari'
              : platform === 'android'
              ? 'Android — Chrome'
              : 'Desktop — Chrome / Edge'}
          </span>
        </div>

        <div className="p-4 space-y-3">
          {platform === 'ios' && (
            <>
              <Step n={1} icon={<Share2 size={15} />} text='Tap the Share button at the bottom of Safari (the box with an arrow pointing up).' />
              <Step n={2} icon={<Smartphone size={15} />} text='Scroll down in the share sheet and tap "Add to Home Screen".' />
              <Step n={3} icon={<CheckCircle2 size={15} />} text='Tap "Add" in the top-right corner. The app icon will appear on your home screen.' />
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                <strong>Note:</strong> This must be done in Safari — Chrome and Firefox on iOS do not support Add to Home Screen.
              </div>
            </>
          )}

          {platform === 'android' && (
            <>
              {deferredPrompt ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Your browser is ready to install. Tap the button below:</p>
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold text-sm px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
                  >
                    <Download size={15} />
                    {installing ? 'Installing…' : 'Install App Now'}
                  </button>
                </div>
              ) : (
                <>
                  <Step n={1} icon={<MoreVertical size={15} />} text='Tap the three-dot menu (⋮) in the top-right of Chrome.' />
                  <Step n={2} icon={<Download size={15} />} text='Tap "Add to Home screen" or "Install app".' />
                  <Step n={3} icon={<CheckCircle2 size={15} />} text='Tap "Add". The app icon will appear on your home screen.' />
                </>
              )}
            </>
          )}

          {platform === 'desktop-chrome' && (
            <>
              {deferredPrompt ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Your browser is ready to install. Click the button below:</p>
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold text-sm px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
                  >
                    <Download size={15} />
                    {installing ? 'Installing…' : 'Install App Now'}
                  </button>
                </div>
              ) : (
                <>
                  <Step n={1} icon={<Chrome size={15} />} text='Look for the install icon (⊕) in the address bar on the right side.' />
                  <Step n={2} icon={<Download size={15} />} text='Click it and select "Install" in the prompt that appears.' />
                  <Step n={3} icon={<CheckCircle2 size={15} />} text='IWIllBUIlD will open as a standalone app and appear in your taskbar / app launcher.' />
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-800">
                    <strong>Tip:</strong> If you don't see the install icon, try refreshing the page or opening the three-dot menu → "Cast, save, and share" → "Install page as app".
                  </div>
                </>
              )}
            </>
          )}

          {platform === 'desktop-other' && (
            <>
              <p className="text-sm text-slate-600">
                For the best experience, open IWIllBUIlD in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> to install it as a desktop app.
              </p>
              <Step n={1} icon={<Chrome size={15} />} text='Open this page in Chrome or Edge.' />
              <Step n={2} icon={<Download size={15} />} text='Click the install icon (⊕) in the address bar.' />
              <Step n={3} icon={<CheckCircle2 size={15} />} text='Click "Install" — done.' />
            </>
          )}
        </div>
      </div>

      {/* Share link */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Share with your team</p>
        <p className="text-sm text-slate-600">
          Send your team to <span className="font-mono font-semibold text-primary">IWIllBUIlD.com</span> and ask them to follow the steps above. No app store, no download — just open and install.
        </p>
      </div>
    </div>
  );
}

function Step({ n, icon, text }: { n: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </div>
      <div className="flex items-start gap-2 flex-1">
        <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>
        <p className="text-sm text-slate-700">{text}</p>
      </div>
    </div>
  );
}
