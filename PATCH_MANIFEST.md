# IWILLBUILD delivery patch - Version 12.0.2, Build 14

Prepared 2026-08-16 from the raw Airo download at `C:\Users\daryl_ey\Downloads\IWILLBUILD_Portal2\IWILLBUILD_Portal` and the current GitHub `main` commit `e8ef8fec0129d939d23797ffb17da211b0fbf2bc` (previous release commit `18938cb5cbcb9fa4b21529e337c480d807b4cfbc`).

The raw Airo download contains the current application code. This Patch is the smaller delivery overlay Airo does not export: the retained Git/Capacitor/iOS delivery layer, native assets, release scripts, and the Version 12.0.2 / Build 14 bump.

## Delivery layout

- The GitHub-ready working tree is `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\IWILLBUILD_Portal`.
- The reconstructed overlay is `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\Patch`.
- Copy the Patch contents over a matching repository root while preserving relative paths.
- `DELETE_FILES.txt` records whether the raw download contains any obsolete paths. This release has no required deletions.

## Patch contents

- 40 payload files: 37 retained delivery/build files, 2 version files and `vite.config.ts`, with `DELETE_FILES.txt` as the control record.
- `package.json` and `package-lock.json` carry the Version 12.0.2 bump.
- `capacitor.config.json`
- `ios/App/App.xcodeproj/project.pbxproj`
- Capacitor-generated iOS configuration and Swift package files
- Native app icons, splash assets and logos omitted by the Airo export
- `scripts/publish-build.mjs`
- `pnpm-workspace.yaml`, which permits only the required `esbuild` install scripts
- `PREPARED_RELEASE.md` and `PATCH_MANIFEST.md`
- `vite.config.ts` ESM path fix and direct `busboy` dependency declaration required by the SSR build

## Version values

- npm/web version: `12.0.2`
- iOS `MARKETING_VERSION`: `12`
- iOS `CURRENT_PROJECT_VERSION`: `14` for Debug and Release
- Capacitor iOS build number: `14`

## Apply and verify

1. Back up the destination repository, including `.git` and `ios`.
2. Copy the Patch overlay into the repository root.
3. Review `DELETE_FILES.txt` and apply any listed deletions (none for this release).
4. Install from `package-lock.json`.
5. Run the production build.
6. Run Capacitor iOS sync.
7. Confirm Version 12 / Build 14 in Xcode before archiving.
8. Review Git changes, commit to `main`, then push through GitHub Desktop.

## Verification record

- Git repository metadata was recovered and verified at the required working-tree location.
- Raw Airo download comparison: 1,482 files.
- Retained overlay comparison: exactly 37 delivery/build files absent from the raw download.
- New Patch payload: 40 files including the two version files and `vite.config.ts`, plus `DELETE_FILES.txt`.
- Package, Capacitor and both Xcode build configurations agree on Build 14.
- Production browser bundle: passed, 3,152 modules transformed.
- Production SSR bundle: passed, 3,902 modules transformed.
- Full production build exit code: 0.
- Capacitor sync must still be rerun before the next native archive.

## Scope and safety

- The original repository and native project were preserved.
- The Patch excludes `.git`, secrets, `node_modules` and `dist`.
- Secrets are not included in this Patch.
- No Git push, publish, deployment or TestFlight upload is part of this preparation.
