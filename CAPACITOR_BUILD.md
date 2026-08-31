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

### ⚠️ server.url must be COMMENTED OUT for App Store builds

`capacitor.config.ts` has `server.url` commented out by default. **Keep it that way.**

When `server.url` is set, the WebView loads the app shell from the network on every
cold launch. This causes a white screen on slow connections and violates App Store
guidelines for apps that require a network connection to launch.

For App Store / TestFlight builds: the app loads bundled assets from `dist/client`.
API calls to `https://iwillbuild.com` still work normally via `fetch()`.

For local LAN development only: uncomment `server.url` in `capacitor.config.ts`
and set it to your machine's LAN IP (e.g. `http://192.168.1.x:5173`).

---

## iOS Build Number — How to Increment

Apple rejects any upload where `CFBundleVersion` (CURRENT_PROJECT_VERSION) is ≤
the last accepted build. You must increment it before every upload.

### Build number history

| Build | CFBundleVersion | Result |
|-------|----------------|--------|
| 1 | 1 | Rejected — missing NSLocation strings |
| 2 | 2 | Accepted by App Store Connect |
| 3 | 2 | Rejected — duplicate CFBundleVersion |
| 3 (retry) | 3 | Accepted |
| **4** | **4** | **Next upload — current value in config** |

### How to increment for future uploads

**One file to edit:** `capacitor.config.ts`, line with `const IOS_BUILD_NUMBER = N`

```ts
// Before upload 5:
const IOS_BUILD_NUMBER = 5;

// Before upload 6:
const IOS_BUILD_NUMBER = 6;
```

Then:
```bash
npm run build:cap   # rebuilds web assets + runs cap sync
# cap sync writes the new buildNumber into ios/App/App.xcodeproj/project.pbxproj
```

Then archive in Xcode → Distribute → App Store Connect.

### Why this works

`capacitor.config.ts` is the **single source of truth**. When `cap sync` runs, it
reads `ios.buildNumber` from this config and writes it into:
- `ios/App/App.xcodeproj/project.pbxproj` → `CURRENT_PROJECT_VERSION`
- `ios/App/App/Info.plist` → `CFBundleVersion`

You never need to edit `project.pbxproj` or `Info.plist` manually.

---

## iOS Setup (Xcode)

### Required capabilities (in Xcode → Signing & Capabilities)

1. **Background Modes** → check **Location updates**
   - Required for GPS tracking while screen is off
2. **Push Notifications**
   - Required for job/fleet alerts

### Info.plist usage descriptions

These are now **automatically injected** by Capacitor via `capacitor.config.json → ios.infoPlist`
when you run `npx cap sync`. You do **not** need to add them manually in Xcode.

The following strings are configured:

| Key | Purpose |
|---|---|
| `NSCameraUsageDescription` | Job photos, receipts, incidents, site records |
| `NSPhotoLibraryUsageDescription` | Upload existing photos as job evidence |
| `NSPhotoLibraryAddUsageDescription` | Save captured photos to camera roll |
| `NSLocationWhenInUseUsageDescription` | Job travel, fleet tracking, site attendance |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | Background GPS for active drive sessions |
| `NSLocationAlwaysUsageDescription` | Background GPS (legacy iOS 10 key) |
| `NSMicrophoneUsageDescription` | Voice notes and dictation |
| `UIBackgroundModes` | `location`, `fetch`, `remote-notification` |

> **App Store review tip:** Apple reviewers check that usage strings clearly explain
> the user benefit — not just "the app needs this". The strings above are written
> to pass review. Do not shorten them to generic phrases like "for app functionality".

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
