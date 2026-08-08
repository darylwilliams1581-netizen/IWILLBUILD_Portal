# IWILLBUILD TestFlight Version 12 / Build 5 patch bundle

Created from the verified Airo download on 8 August 2026.

## Release metadata

- App: IWILLBUILD
- Bundle ID: `com.iwillbuild.portal`
- Marketing version: `12`
- iOS build number: `5`
- Capacitor: `8`

## Included fixes

- Native iPhone Camera opens automatically with URI-first capture.
- Camera captures retain the processed Blob and provide a real Retry Save action.
- Camera database inserts use the insert ID returned by the same pooled query.
- Job Card photo inputs use the reliable iOS picker and report upload failures.
- Fleet Live Map CSP, key loading, authentication diagnostics and mobile height fixes.
- Complete native iOS project, icons, splash screens and permission descriptions.
- Capacitor Camera, Geolocation, App, Haptics, Network, Push Notifications,
  Splash Screen and Status Bar Swift packages.
- Repaired `package-lock.json` containing the previously missing Yjs dependencies.

## Apply to the next raw Airo download

1. Copy this folder over the raw project using the same relative paths.
2. Do not copy the manifest into the application if it is not wanted.
3. Run `npm ci`.
4. Run `npm run build`.
5. Run `npx cap sync ios`.
6. Confirm Xcode shows Version 12 / Build 5 or increment both for the next release.
7. Archive and upload from `ios/App/App.xcodeproj`.

Generated `ios/App/App/public` assets are intentionally excluded. Capacitor regenerates
them during `npx cap sync ios`, preventing stale web code from being carried forward.

## Verification completed

- Production build: passed.
- Capacitor iOS sync: passed; eight plugins detected.
- Strict TypeScript audit: not clean because the downloaded portal contains extensive
  pre-existing type errors outside this release. The production bundler completes.
- Physical iPhone/TestFlight runtime testing remains required after upload.

