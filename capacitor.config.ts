import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for IWILLBUILD Portal
 *
 * For local development: set server.url to your local dev server
 * For production builds: remove server.url so the app uses bundled assets
 *
 * Build steps:
 *   npm run build:cap        — builds web assets for Capacitor
 *   npx cap sync             — copies web assets + updates native projects
 *   npx cap open ios         — opens Xcode
 *   npx cap open android     — opens Android Studio
 */

const config: CapacitorConfig = {
  // Reverse-domain app identifier — must match your Apple/Google developer account
  appId: 'com.iwillbuild.portal',
  appName: 'IWILLBUILD',

  // Where Capacitor looks for the built web assets
  webDir: 'dist/client',

  // ── Server config ─────────────────────────────────────────────────────────
  // During development, point at your live server so API calls work.
  // Comment this out for production App Store / Play Store builds.
  server: {
    url: 'https://iwillbuild.com',        // ← live URL mode: app shell loads from production
    // url: 'http://192.168.1.x:5173',  // ← uncomment for local dev (use your LAN IP)
    cleartext: false,                   // disallow plain HTTP in production
    allowNavigation: ['iwillbuild.com', '*.iwillbuild.com'],
  },

  // ── iOS specific ──────────────────────────────────────────────────────────
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#111827',

    // ── Info.plist usage description strings ─────────────────────────────────
    // These are injected by Capacitor / Appflow into Info.plist during `cap sync`.
    // Apple requires every permission your app requests to have a usage string.
    // Strings must explain WHY the app needs the permission — vague strings cause
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

    // Splash screen — shown while app loads
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#111827',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#ff6b00',
    },

    // Push notifications
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
