import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for IWIllBUILD Portal
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
// Current: 11 (schema-compat camera upload fix; INFORMATION_SCHEMA migration)
const IOS_BUILD_NUMBER = 12;

const config: CapacitorConfig = {
  // Reverse-domain app identifier — must match your Apple/Google developer account
  appId: 'com.iwillbuild.portal',
  appName: 'IWIllBUILD',

  // Where Capacitor looks for the built web assets
  webDir: 'dist/client',

  // ── Server config ─────────────────────────────────────────────────────────
  // ⚠️  BUILD 11: server.url is ENABLED — app loads from live server.
  //     This is intentional for this Appflow/TestFlight build.
  //
  // ⚠️  BEFORE App Store submission: comment server.url back out.
  //     A live server.url causes white screen on slow/no network and may
  //     trigger App Store review rejection (apps must not require network to launch).
  //
  server: {
    url: 'https://iwillbuild.com',
    cleartext: false,
    allowNavigation: ['iwillbuild.com', '*.iwillbuild.com'],
  },

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
        'IWIllBUILD uses your camera to capture job photos, receipts, incidents, and site evidence for your work records.',

      // Photo library read — upload existing photos as job evidence
      NSPhotoLibraryUsageDescription:
        'IWIllBUILD uses your photo library so you can upload job photos, receipts, and site evidence.',

      // Photo library write — save captured photos back to the camera roll
      NSPhotoLibraryAddUsageDescription:
        'IWIllBUILD saves captured photos to your photo library.',

      // Location while in use — attendance, job travel, fleet tracking
      NSLocationWhenInUseUsageDescription:
        'IWIllBUILD uses your location for job travel, fleet tracking, and site attendance records.',

      // Location always — background GPS for active drive sessions
      // Also requires "Background Modes > Location updates" in Xcode Capabilities
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'IWIllBUILD uses your location in the background to track active drive sessions for fleet management.',

      // Legacy key — still required for iOS 10 compatibility
      NSLocationAlwaysUsageDescription:
        'IWIllBUILD uses your location in the background to track active drive sessions for fleet management.',

      // Microphone — voice notes and dictation
      NSMicrophoneUsageDescription:
        'IWIllBUILD uses the microphone for voice notes and dictation where enabled.',

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
