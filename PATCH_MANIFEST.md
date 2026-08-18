# IWILLBUILD delivery patch - Version 12.0.3, Build 15

Prepared 2026-08-18 from the raw Airo download at `C:\Users\daryl_ey\Downloads\IWILLBUILD_Portal (3)\IWILLBUILD_Portal` and the existing GitHub-ready repository on branch `main`, base commit `a71ed9d0790fcb38415f2cb4ca0f28030cc43029`.

The Airo download contains the current application code. This Patch is the smaller delivery overlay Airo does not export: retained Git/Capacitor/iOS delivery files, native assets, release scripts and the Version 12.0.3 / Build 15 bump.

## Delivery locations

- GitHub-ready working tree: `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\IWILLBUILD_Portal`
- Reconstructed overlay: `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\Patch`
- Safety backup: `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\IWILLBUILD_Portal_backup_20260818_164628`

## Version values

- npm/web version: `12.0.3`
- iOS `MARKETING_VERSION`: `12`
- iOS `CURRENT_PROJECT_VERSION`: `15` for Debug and Release
- Capacitor/TestFlight build number: `15`

## Important dependency merge

- Retained `@capacitor/share` from the new Airo download for native share support.
- Retained direct `busboy` dependency from the delivery patch for the server upload service.
- Retained the ESM-safe `vite.config.ts` path handling required by the SSR build.

## Verification

- Production browser bundle: passed, 3,164 modules transformed.
- Production SSR bundle: passed, 3,924 modules transformed.
- Full production build: passed, exit code 0.
- Standalone strict TypeScript check: does not pass because the downloaded Airo codebase contains a large inherited diagnostics backlog across unrelated modules. This is recorded and was not hidden or bulk-rewritten as part of the release merge.
- Capacitor iOS sync: passed; 11 native plugins were registered, including `@capacitor/share`.

## Safety and scope

- Existing Git history and native project are preserved.
- Patch excludes `.git`, secrets, `node_modules` and `dist`.
- No secrets are included.
- The working tree is reviewed before commit and push.
