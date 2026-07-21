/**
 * /download-app — Public page for drivers to download the IWILLBUILD Android APK
 * No login required — share this URL directly with drivers.
 */
import { Helmet } from '@dr.pogodin/react-helmet';
import { Smartphone, Download, Shield, Wifi, MapPin, Bell, CheckCircle, ExternalLink } from 'lucide-react';

const GITHUB_RELEASES_URL = 'https://github.com/YOUR_ORG/YOUR_REPO/releases/latest';
// ↑ Replace with your actual GitHub repo URL once set up

const features = [
  { icon: MapPin,   label: 'Live GPS tracking',        desc: 'Your location updates automatically while on a job' },
  { icon: Bell,     label: 'Push notifications',       desc: 'Get notified about job updates and fleet alerts' },
  { icon: Wifi,     label: 'Works offline',            desc: 'Core features work even without mobile data' },
  { icon: Shield,   label: 'Secure & private',         desc: 'Your data stays within your company account' },
];

const steps = [
  { n: '1', title: 'Download the APK', body: 'Tap the Download button below. Your browser will download the APK file.' },
  { n: '2', title: 'Allow installation', body: 'Android will ask to allow installs from unknown sources. Tap Settings → enable "Install unknown apps" for your browser.' },
  { n: '3', title: 'Install the app', body: 'Open the downloaded file from your notifications or Downloads folder and tap Install.' },
  { n: '4', title: 'Sign in', body: 'Open IWILLBUILD and sign in with your existing portal credentials.' },
];

export default function DownloadAppPage() {
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  const isIos     = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <>
      <Helmet>
        <title>Download the IWILLBUILD Driver App — Fleet Management on Mobile</title>
        <meta name="description" content="Download the IWILLBUILD driver app for Android. Live GPS tracking, job management, SWMS safety forms, and fleet tools — all in your pocket." />
        <link rel="canonical" href="https://iwillbuild.com/download-app" />
        <meta property="og:title" content="Download the IWILLBUILD Driver App" />
        <meta property="og:description" content="Live GPS tracking, job management, SWMS safety forms, and fleet tools for drivers — available on Android." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/download-app" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Download the IWILLBUILD Driver App" />
        <meta name="twitter:description" content="Live GPS tracking, job management, SWMS safety forms, and fleet tools for drivers." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": "https://iwillbuild.com/download-app#webpage",
          "name": "Download the IWILLBUILD Driver App",
          "url": "https://iwillbuild.com/download-app",
          "description": "Download the IWILLBUILD driver app for Android. Live GPS tracking, job management, SWMS safety forms, and fleet tools — all in your pocket.",
          "isPartOf": { "@id": "https://iwillbuild.com/#website" },
          "about": { "@id": "https://iwillbuild.com/#organization" }
        })}</script>
      </Helmet>

      <main className="min-h-screen bg-gray-950 text-white">

        {/* Header */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm">IW</span>
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">IWILLBUILD</p>
            <p className="text-gray-400 text-xs">Construction Portal</p>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-10 space-y-10">

          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-orange-500 flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/30">
              <Smartphone size={36} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Get the App</h1>
              <p className="text-gray-400 mt-1 text-sm leading-relaxed">
                The full IWILLBUILD portal in your pocket — jobs, fleet tracking, forms, and more.
              </p>
            </div>
          </div>

          {/* Platform detection banner */}
          {isIos && (
            <div className="bg-blue-950/60 border border-blue-800/50 rounded-2xl p-4 text-center">
              <p className="text-blue-300 font-semibold text-sm">You're on iOS</p>
              <p className="text-blue-400/80 text-xs mt-1 leading-relaxed">
                The iOS app is coming soon. For now, tap the Share button in Safari then
                <span className="text-blue-300 font-medium"> Add to Home Screen</span> to install the web app.
              </p>
            </div>
          )}

          {/* Download button */}
          <div className="space-y-3">
            <a
              href={GITHUB_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-4 px-6 rounded-2xl transition-colors shadow-lg shadow-orange-500/20 text-base"
            >
              <Download size={20} />
              Download Android APK
              <ExternalLink size={14} className="opacity-60" />
            </a>

            {isAndroid && (
              <p className="text-center text-xs text-gray-500">
                Android device detected — you're good to go
              </p>
            )}

            <p className="text-center text-xs text-gray-600">
              Free download · No Play Store required · Latest version
            </p>
          </div>

          {/* Install steps */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">How to install</h2>
            <div className="space-y-3">
              {steps.map((step) => (
                <div key={step.n} className="flex gap-3 bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <div className="w-7 h-7 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-orange-400 font-black text-xs">{step.n}</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{step.title}</p>
                    <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">What's included</h2>
            <div className="grid grid-cols-1 gap-3">
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-orange-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{label}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trust note */}
          <div className="flex items-start gap-3 bg-gray-900/50 rounded-xl p-4 border border-gray-800">
            <CheckCircle size={18} className="text-green-400 shrink-0 mt-0.5" />
            <p className="text-gray-400 text-xs leading-relaxed">
              This app is distributed directly by your employer. It is not available on the Play Store —
              you need to allow installation from unknown sources. This is normal for internal business apps.
            </p>
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
