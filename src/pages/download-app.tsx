/**
 * /download-app — Android APK download page
 *
 * STATUS: Coming soon — no signed APK release exists yet.
 * noindex,nofollow + excluded from sitemap until first release is published.
 *
 * TO ACTIVATE: when the first signed APK is published to GitHub Releases,
 *   1. Set APK_AVAILABLE = true
 *   2. Remove the noindex meta tag from <Helmet>
 *   3. Set sitemap: true (or remove sitemap:false) for /download-app in seo-routes.ts
 *   4. Update lastmod in seo-routes.ts
 */
import { Helmet } from '@dr.pogodin/react-helmet';
import { Smartphone, Shield, Wifi, MapPin, Bell, Clock } from 'lucide-react';

/** Flip to true once the first signed APK release exists on GitHub. */
const APK_AVAILABLE = false;

const GITHUB_RELEASES_URL =
  'https://github.com/darylwilliams1581-netizen/IWIllBUILD_Portal/releases/latest';

const features = [
  { icon: MapPin,  label: 'Live GPS tracking',   desc: 'Your location updates automatically while on a job' },
  { icon: Bell,    label: 'Push notifications',  desc: 'Get notified about job updates and fleet alerts' },
  { icon: Wifi,    label: 'Works offline',        desc: 'Core features work even without mobile data' },
  { icon: Shield,  label: 'Secure & private',     desc: 'Your data stays within your company account' },
];

const steps = [
  { n: '1', title: 'Download the APK',    body: 'Tap the Download button below. Your browser will download the APK file.' },
  { n: '2', title: 'Allow installation',  body: 'Android will ask to allow installs from unknown sources. Tap Settings → enable "Install unknown apps" for your browser.' },
  { n: '3', title: 'Install the app',     body: 'Open the downloaded file from your notifications or Downloads folder and tap Install.' },
  { n: '4', title: 'Sign in',             body: 'Open IWIllBUILD and sign in with your existing portal credentials.' },
];

export default function DownloadAppPage() {
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  return (
    <>
      <Helmet>
        <title>IWIllBUILD Driver App — Coming Soon</title>
        <meta name="description" content="The IWIllBUILD Android driver app is coming soon. Live GPS tracking, job management, SWMS safety forms, and fleet tools — all in your pocket." />
        <link rel="canonical" href="https://iwillbuild.com/download-app" />
        {/* noindex until first APK release is published */}
        <meta name="robots" content="noindex,nofollow" />
        <meta property="og:title" content="IWIllBUILD Driver App — Coming Soon" />
        <meta property="og:description" content="The IWIllBUILD Android driver app is coming soon. Live GPS, job management, safety forms, and fleet tools." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/download-app" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="IWIllBUILD Driver App — Coming Soon" />
        <meta name="twitter:description" content="The IWIllBUILD Android driver app is coming soon." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <main className="min-h-screen bg-gray-950 text-white">

        {/* Header */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm">IW</span>
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">IWIllBUILD</p>
            <p className="text-gray-400 text-xs">Construction Portal</p>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-10 space-y-10">

          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-violet-500 flex items-center justify-center mx-auto shadow-2xl shadow-violet-500/30">
              <Smartphone size={36} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">IWIllBUILD Android App</h1>
              <p className="text-gray-400 mt-1 text-sm leading-relaxed">
                The full IWIllBUILD portal in your pocket — jobs, fleet tracking, forms, and more.
              </p>
            </div>
          </div>

          {/* Coming soon banner */}
          {!APK_AVAILABLE && (
            <div className="bg-amber-950/50 border border-amber-700/50 rounded-2xl p-5 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Clock size={18} />
                <span className="font-bold text-sm">Android app coming soon</span>
              </div>
              <p className="text-amber-400/70 text-xs leading-relaxed">
                The first release is being prepared. Check back here once your admin
                notifies you that the app is ready to download.
              </p>
            </div>
          )}

          {/* iOS banner */}
          {isIos && (
            <div className="bg-blue-950/60 border border-blue-800/50 rounded-2xl p-4 text-center">
              <p className="text-blue-300 font-semibold text-sm">You're on iOS</p>
              <p className="text-blue-400/80 text-xs mt-1 leading-relaxed">
                The iOS app is coming soon. For now, tap the Share button in Safari then
                <span className="text-blue-300 font-medium"> Add to Home Screen</span> to install the web app.
              </p>
            </div>
          )}

          {/* Download button — disabled until APK is available */}
          <div className="space-y-3">
            {APK_AVAILABLE ? (
              <a
                href={GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white font-bold py-4 px-6 rounded-2xl transition-colors shadow-lg shadow-violet-500/20 text-base"
              >
                <Smartphone size={20} />
                Download Android APK
              </a>
            ) : (
              <button
                disabled
                className="flex items-center justify-center gap-3 w-full bg-gray-800 text-gray-500 font-bold py-4 px-6 rounded-2xl cursor-not-allowed text-base border border-gray-700"
                aria-label="Android APK download not yet available"
              >
                <Smartphone size={20} />
                Download Android APK
                <span className="ml-1 text-xs font-normal text-gray-600">(coming soon)</span>
              </button>
            )}

            {APK_AVAILABLE && isAndroid && (
              <p className="text-center text-xs text-gray-500">
                Android device detected — you're good to go
              </p>
            )}
          </div>

          {/* Install steps — shown only when APK is available */}
          {APK_AVAILABLE && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">How to install</h2>
              <div className="space-y-3">
                {steps.map((step) => (
                  <div key={step.n} className="flex gap-3 bg-gray-900 rounded-xl p-4 border border-gray-800">
                    <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-600/40 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-violet-400 font-black text-xs">{step.n}</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{step.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">What's included</h2>
            <div className="grid grid-cols-1 gap-3">
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-violet-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{label}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-gray-700 text-xs pb-4">
            Having trouble? Contact your site manager or admin.
          </p>

        </div>
      </main>
    </>
  );
}
