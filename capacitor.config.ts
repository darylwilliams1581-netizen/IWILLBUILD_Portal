import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for IWILLBUILD Portal
 *
 * ── Build number management ───────────────────────────────────────────────────
 * CURRENT_PROJECT_VERSION (CFBundleVersion) must increase with every App Store
 * upload. Apple rejects any build where this number is ≤ the last accepted build.
 *
 * History:
 *   Build 1 — rejected (missing NSLocation strings)
 *   Build 2 — accepted by App Store Connect
 *   Build 3 — rejected (duplicate CFBundleVersion=2, then fixed and re-uploaded)
 *   Build 4 — NEXT UPLOAD (current value below)
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
// Current: 4 (next after last accepted build 2, with build 3 having been rejected)
const IOS_BUILD_NUMBER = 4;

const config: CapacitorConfig = {
  // Reverse-domain app identifier — must match your Apple/Google developer account
  appId: 'com.iwillbuild.portal',
  appName: 'IWILLBUILD',

  // Where Capacitor looks for the built web assets
  webDir: 'dist/client',

  // ── Server config ─────────────────────────────────────────────────────────
  // ⚠️  PRODUCTION / APP STORE BUILDS: keep server.url commented out.
  //     The app must load bundled assets — not a remote URL — so the WebView
  //     paints immediately without a network round-trip. A live server.url
  //     causes a white screen on slow networks and is rejected by App Store
  //     review guidelines for apps that require a network connection to launch.
  //
  // server: {
  //   url: 'https://iwillbuild.com',     // ← LOCAL DEV ONLY — uncomment for LAN testing
  //   cleartext: false,
  //   allowNavigation: ['iwillbuild.com', '*.iwillbuild.com'],
  // },

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
    infoPlist: {
      // Camera — job photos, receipts, incidents, site records
      NSCameraUsageDescription:
        'IWILLBUILD uses your camera to capture job photos, receipts, incidents, and site evidence for your work records.',

      // Photo library read — upload existing photos as job evidence
      NSPhotoLibraryUsageDescription:
        'IWILLBUILD uses your photo library so you can upload job photos, receipts, and site evidence.',

      // Photo library write — save captured photos back to the camera roll
      NSPhotoLibraryAddUsageDescription:
        'IWILLBUILD saves captured photos to your photo library.',

      // Location while in use — attendance, job travel, fleet tracking
      NSLocationWhenInUseUsageDescription:
        'IWILLBUILD uses your location for job travel, fleet tracking, and site attendance records.',

      // Location always — background GPS for active drive sessions
      // Also requires "Background Modes > Location updates" in Xcode Capabilities
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'IWILLBUILD uses your location in the background to track active drive sessions for fleet management.',

      // Legacy key — still required for iOS 10 compatibility
      NSLocationAlwaysUsageDescription:
        'IWILLBUILD uses your location in the background to track active drive sessions for fleet management.',

      // Microphone — voice notes and dictation
      NSMicrophoneUsageDescription:
        'IWILLBUILD uses the microphone for voice notes and dictation where enabled.',

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
  },
};

export default config;
