import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for IWIllBUIlD Portal
 *
 * ── Build number management ───────────────────────────────────────────────────
 * CURRENT_PROJECT_VERSION (CFBundleVersion) must increase with every App Store
 * upload. Apple rejects any build where this number is ≤ the last accepted build.
 *
 * History:
 *   Build 1 — rejected (missing NSLocation strings)
 *   Build 2 — accepted by App Store Connect
 *   Build 3 — rejected (duplicate CFBundleVersion=2, then fixed and re-uploaded)
 *   Build 4 — submitted
 *   Build 5 — white screen in TestFlight (top-level @capacitor/camera import crash)
 *   Build 6 — NEXT UPLOAD (current value below)
 *
 * ── How to increment for future uploads ──────────────────────────────────────
 * Before every new Appflow / Xcode archive:
 *   1. Increase IOS_BUILD_NUMBER by 1
 *   2. Commit the change
 *   3. Run: npm run build:cap  (builds web assets + cap sync)
 *   4. Archive in Xcode → Distribute → App Store Connect
 *
 * MARKETING_VERSION stays 1.0 unless the user explicitly requests a version bump.
 *
 * ── Server config note ───────────────────────────────────────────────────────
 * For App Store / TestFlight builds: server.url must be ABSENT (commented out).
 * The native app loads bundled assets from dist/client — no network dependency
 * on first paint. API calls go to https://iwillbuild.com via normal fetch().
 *
 * For local development only: uncomment server.url and set to your LAN IP.
 *
 * Build steps:
 *   npm run build:cap        — builds web assets for Capacitor
 *   npx cap sync             — copies web assets + updates native projects
 *   npx cap open ios         — opens Xcode
 *   npx cap open android     — opens Android Studio
 */

// ── SINGLE SOURCE OF TRUTH FOR BUILD NUMBER ───────────────────────────────────
// Increment this before every App Store / TestFlight upload.
// Current: 21 (server.url removed; RootLayout overflow:clip → overflow:hidden layout fix)
const IOS_BUILD_NUMBER = 22;

const config: CapacitorConfig = {
  // Reverse-domain app identifier — must match your Apple/Google developer account
  appId: 'com.iwillbuild.portal',
  appName: 'IWIllBUIlD',

  // Where Capacitor looks for the built web assets
  webDir: 'dist/client',

  // ── Server config ─────────────────────────────────────────────────────────
  // ⚠️  server.url is intentionally ABSENT for App Store / TestFlight builds.
  //     The native app loads bundled assets from dist/client — no network
  //     dependency on first paint. API calls go to https://iwillbuild.com via
  //     normal fetch(). A live server.url causes white screen on slow/no network
  //     and may trigger App Store review rejection.
  //
  // For local development only: add server: { url: 'http://YOUR_LAN_IP:5173' }
  //
  // ── iOS specific ──────────────────────────────────────────────────────────
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#111827',

    // ── Build number — MUST increase with every App Store upload ─────────────
    // This sets CURRENT_PROJECT_VERSION / CFBundleVersion in project.pbxproj
    // when `npx cap sync` runs. MARKETING_VERSION (CFBundleShortVersionString)
    // stays 1.0 and is controlled in Xcode / Appflow separately.
    buildNumber: String(IOS_BUILD_NUMBER),

    // ── Info.plist usage description strings ─────────────────────────────────
    // Injected into Info.plist by `cap sync`. Apple requires every permission
    // to have a usage string explaining the user benefit — vague strings cause
    // App Store review rejection.
    //
    // ── Camera release checklist (required before every TestFlight/App Store build) ──
    // 1. NSCameraUsageDescription must be present (below) — live camera will crash
    //    at the OS level on first use if this string is missing from Info.plist.
    // 2. NSPhotoLibraryUsageDescription must be present — library picker crashes without it.
    // 3. NSPhotoLibraryAddUsageDescription must be present — camera roll backup fails without it.
    // 4. @capacitor/camera must be listed in package.json AND synced to the native project
    //    via `npx cap sync` — the plugin registers the native camera bridge. Without sync,
    //    Camera.getPhoto() silently falls back to a file input that does nothing on iOS.
    // 5. CameraResultType.Base64 is used (not DataUrl) — avoids the extra fetch() memory
    //    copy that caused OOM crashes on large iPhone captures in earlier builds.
    // 6. User-cancel is distinguished from real errors — "cancelled"/"dismiss" in the
    //    error message is not logged as a crash; only genuine failures are warned.
    infoPlist: {
      // Camera — job photos, receipts, incidents, site records
      NSCameraUsageDescription:
        'IWIllBUIlD uses your camera to capture job photos, receipts, incidents, and site evidence for your work records.',

      // Photo library read — upload existing photos as job evidence
      NSPhotoLibraryUsageDescription:
        'IWIllBUIlD uses your photo library so you can upload job photos, receipts, and site evidence.',

      // Photo library write — save captured photos back to the camera roll
      NSPhotoLibraryAddUsageDescription:
        'IWIllBUIlD saves captured photos to your photo library.',

      // Location while in use — attendance, job travel, fleet tracking
      NSLocationWhenInUseUsageDescription:
        'IWIllBUIlD uses your location for job travel, fleet tracking, and site attendance records.',

      // Location always — background GPS for active drive sessions
      // Also requires "Background Modes > Location updates" in Xcode Capabilities
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'IWIllBUIlD uses your location in the background to track active drive sessions for fleet management.',

      // Legacy key — still required for iOS 10 compatibility
      NSLocationAlwaysUsageDescription:
        'IWIllBUIlD uses your location in the background to track active drive sessions for fleet management.',

      // Microphone — voice notes and dictation
      NSMicrophoneUsageDescription:
        'IWIllBUIlD uses the microphone for voice notes and dictation where enabled.',

      // Background modes — location + push notifications
      UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
    },
  },

  // ── Android specific ──────────────────────────────────────────────────────
  android: {
    backgroundColor: '#111827',
    // Background location handled via AndroidManifest.xml permissions
  },

  // ── Plugin configuration ──────────────────────────────────────────────────
  plugins: {
    // Geolocation — high accuracy GPS for driver tracking
    Geolocation: {
      // iOS: request "always" permission for background tracking
      // Android: ACCESS_FINE_LOCATION + ACCESS_BACKGROUND_LOCATION
    },

    // Status bar — dark background to match app theme
    StatusBar: {
      style: 'dark',
      backgroundColor: '#111827',
      overlaysWebView: false,
    },

    // Splash screen — manual hide mode
    // launchAutoHide: false means the native layer will NOT auto-dismiss.
    // CapacitorInit.tsx calls SplashScreen.hide() at ~400ms after first React
    // paint, giving the UI time to render before the splash fades out.
    // launchShowDuration: 3000 is a safety net only — if React never mounts
    // (e.g. a JS crash), the splash auto-hides after 3s so the user is never
    // stuck on a black screen forever.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#111827',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    // Push notifications
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // CapacitorHttp — routes absolute HTTPS requests through NSURLSession (iOS)
    // instead of WKWebView's fetch. NSURLSession shares HTTPCookieStorage.shared
    // with WKWebView via CapacitorCookieManager, giving persistent cookie sessions
    // across force-close without extra cookie handling code.
    //
    // NOTE: CapacitorHttp does NOT intercept relative URLs — isRelativeOrProxyUrl()
    // in the native bridge passes them through unchanged to the original WebKit fetch.
    // The global fetch patch in src/lib/native-api.ts handles relative URL rewriting.
    CapacitorHttp: {
      enabled: true,
    },

    // CapacitorCookies — syncs NSHTTPCookieStorage.shared ↔ WKWebView cookie store
    // so cookies set by NSURLSession (via CapacitorHttp) are visible to the WebView
    // and vice versa. Required for BetterAuth session cookies to persist correctly.
    CapacitorCookies: {
      enabled: true,
    },
  },
};

export default config;
