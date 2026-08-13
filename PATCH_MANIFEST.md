# IWILLBUILD reconstructed patch — Version 12, Build 11

Prepared 2026-08-14 for the clean Airo download.

## Restored files

- `capacitor.config.json`
- `ionic.config.json`
- `vite.config.ts` (local/build path compatibility patch)
- `scripts/publish-build.mjs`
- `dev-tools/src/AiroErrorBoundary.tsx`
- `ios/` native project source (excluding stale compiled web assets)
- public app icons and IWILLBUILD logo variants

## Version change

- Marketing version remains `12`.
- iOS build number advanced from `10` to `11` in Debug and Release.

## Preserved from the new Airo download

- `/jobs/:jobId/camera` route and camera page
- current-job photo saving and return-to-Photos flow
- new upload queue improvements
- Airo's new watermark settings hook and shimmer asset

## Apply to a clean Airo download

1. Back up the destination and preserve its `.git` folder.
2. Copy this patch into the project root, preserving paths.
3. Run `npm ci`.
4. Run `npm run build`.
5. Run `npx cap sync ios`.
6. Confirm version 12, build 11 in Xcode.
7. Commit and push, then archive/upload to TestFlight.

This patch intentionally contains no `.git` directory and introduces no new GPS/location work.
