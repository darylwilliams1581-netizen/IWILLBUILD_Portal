# IWILLBUILD — Capacitor Native App Build Guide

Capacitor wraps the existing React web app into a native iOS and Android shell.
Your web portal at iwillbuild.com continues to work unchanged.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 22 | Already installed |
| Xcode | ≥ 15 | Mac App Store (iOS only) |
| Android Studio | Latest | developer.android.com |
| CocoaPods | Latest | `sudo gem install cocoapods` (iOS only) |
| Java JDK | 17+ | Required by Android Studio |

You need a **Mac** to build for iOS. Android can be built on Mac, Windows, or Linux.

---

## First-time Setup

### 1. Add native platforms

```bash
npx cap add ios
npx cap add android
```

This creates `ios/` and `android/` directories. These are full native projects —
commit them to git so your team can open them in Xcode / Android Studio.

### 2. Build web assets and sync

```bash
npm run build:cap
```

This runs `vite build` then `npx cap sync` which:
- Copies `dist/client/` into the native projects
- Updates native dependencies (CocoaPods / Gradle)

---

## Daily Development Workflow

```bash
# After any code change:
npm run build:cap      # rebuild + sync

# Open in Xcode (iOS):
npm run cap:ios

# Open in Android Studio:
npm run cap:android

# Run directly on connected device:
npm run cap:run:ios
npm run cap:run:android
```

---

## Production Configuration

Before submitting to App Store / Play Store, update `capacitor.config.ts`:

```ts
server: {
  url: 'https://iwillbuild.com',  // ← uncomment this line
  cleartext: false,
}
```

This makes the native app load your live server rather than bundled assets,
so you can update the app without going through App Store review for most changes.

---

## iOS Setup (Xcode)

### Required capabilities (in Xcode → Signing & Capabilities)

1. **Background Modes** → check **Location updates**
   - Required for GPS tracking while screen is off
2. **Push Notifications**
   - Required for job/fleet alerts

### Required Info.plist keys

Add these in Xcode → Info tab:

| Key | Value |
|---|---|
| `NSLocationWhenInUseUsageDescription` | "IWILLBUILD uses your location to track your driving session for fleet management." |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | "IWILLBUILD uses your location in the background to keep your driving session active when the screen is off." |
| `NSLocationAlwaysUsageDescription` | "IWILLBUILD uses your location in the background for fleet tracking." |

### App Store submission

1. Set Bundle ID to `com.iwillbuild.portal` in Xcode
2. Set version and build number
3. Archive → Distribute App → App Store Connect
4. Submit for review (1–3 business days)

---

## Android Setup (Android Studio)

### Required permissions (AndroidManifest.xml)

These are added automatically by the Capacitor Geolocation plugin, but verify:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

### Background location on Android 10+

Android 10+ requires a separate runtime prompt for background location.
The `useCapacitor` hook requests `location` permission — users will see a
second prompt for "Allow all the time" which enables background tracking.

### Internal distribution (no Play Store)

For internal team use, you can distribute the APK directly:
1. Build → Generate Signed Bundle/APK → APK
2. Share the `.apk` file — team members install via "Install unknown apps"
3. No Play Store review needed for internal distribution

### Play Store submission

1. Set Application ID to `com.iwillbuild.portal` in `android/app/build.gradle`
2. Build → Generate Signed Bundle/APK → Android App Bundle (.aab)
3. Upload to Play Console → Production track

---

## GPS Tracking — How It Works

The app uses a two-layer GPS strategy:

| Context | Method | Notes |
|---|---|---|
| Native iOS/Android | `@capacitor/geolocation` | Higher accuracy, works in background on Android |
| Web browser | `navigator.geolocation` | Standard browser API, foreground only |

**iOS background limitation:** Apple restricts background location to apps with
"Always" permission and the Background Modes capability. Drivers must grant
"Allow Always" when prompted. The app will still work with "While Using" but
GPS stops when the screen locks.

**Android background:** Works reliably with `ACCESS_BACKGROUND_LOCATION`.
Drivers should see a notification while tracking is active (Android requirement).

---

## App Icons

Replace the SVG placeholders with proper PNG icons before submitting:

- `public/icon-192.png` — 192×192px PNG
- `public/icon-512.png` — 512×512px PNG
- iOS: Xcode will generate all required sizes from a 1024×1024 source image
- Android: Android Studio → Image Asset Studio → Launcher Icons

---

## Troubleshooting

**`npx cap sync` fails with CocoaPods error**
```bash
cd ios/App && pod install --repo-update
```

**Android build fails with Gradle error**
- Open Android Studio → File → Sync Project with Gradle Files

**GPS not working on iOS simulator**
- Simulator → Features → Location → Custom Location (set lat/lng manually)
- Real device testing required for accurate GPS

**White screen on launch**
- Check `capacitor.config.ts` → `server.url` is correct
- Check `webDir` points to `dist/client`
- Run `npm run build:cap` to rebuild assets

---

## File Structure

```
capacitor.config.ts          ← Capacitor configuration
ios/                         ← Xcode project (after npx cap add ios)
android/                     ← Android Studio project (after npx cap add android)
src/lib/capacitor-plugins.ts ← Native plugin wrappers
src/lib/useCapacitor.ts      ← React hook for native features
src/lib/useDriverSession.ts  ← GPS-aware driver session hook
public/manifest.json         ← PWA manifest (also used by Capacitor)
```
