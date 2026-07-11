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
    // url: 'https://iwillbuild.com',   // ← uncomment for production native build
    // url: 'http://192.168.1.x:5173',  // ← uncomment for local dev (use your LAN IP)
    cleartext: false,                   // disallow plain HTTP in production
    allowNavigation: ['iwillbuild.com', '*.iwillbuild.com'],
  },

  // ── iOS specific ──────────────────────────────────────────────────────────
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#111827',
    // Background location — required for driver GPS tracking while screen is off
    // You must also add NSLocationAlwaysAndWhenInUseUsageDescription to Info.plist
    // and enable "Background Modes > Location updates" in Xcode capabilities
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
