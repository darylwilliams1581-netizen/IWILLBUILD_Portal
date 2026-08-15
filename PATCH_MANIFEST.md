# IWILLBUILD delivery patch - Version 12.0.1, Build 13

Prepared 2026-08-16 from the new Airo download and the existing Git repository based on commit `8bf9522`.

## Delivery layout

- The GitHub-ready working tree is `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\IWILLBUILD_Portal`.
- The reconstructed overlay is `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\Patch`.
- Copy the Patch contents over a matching repository root while preserving relative paths.
- Apply every entry in `DELETE_FILES.txt` after copying the overlay.

## Major file groups

### Release and native build

- `package.json` and `package-lock.json`
- `capacitor.config.json`
- `ios/App/App.xcodeproj/project.pbxproj`
- Capacitor-generated iOS configuration and Swift package files
- `scripts/publish-build.mjs`
- `PREPARED_RELEASE.md` and `PATCH_MANIFEST.md`

### Dazza, Anatomy and Bug Loop

- Dazza V3 UI, brain and read-only tools
- Anatomy upload/index/security/GitHub services and owner-console UI
- Bug analysis, Dazza review, SMS authorisation and publish-prompt routes
- Bug communication and review panels

### Email, PDF and secure sharing

- Reusable document email modal and success toast
- Quote, Invoice, Job and completed Form composition/send routes
- Canonical Estimate, Invoice and Form PDF builders
- Secure-share content endpoint, expiry/revoke support and public viewer actions
- Estimate Print modal deletion; PDF download remains

### Portal fixes and additions

- Weather widget and home-page integration
- Safety poster PDF and preview integration
- Lists endpoint handlers and user-log corrections
- Owner Console, Help and navigation updates
- Current Airo client/server source changes

## Version values

- npm/web version: `12.0.1`
- iOS `MARKETING_VERSION`: `12`
- iOS `CURRENT_PROJECT_VERSION`: `13` for Debug and Release
- Capacitor iOS build number: `13`

## Apply and verify

1. Back up the destination repository, including `.git` and `ios`.
2. Copy the Patch overlay into the repository root.
3. Delete the paths listed in `DELETE_FILES.txt`.
4. Install from `package-lock.json`.
5. Run the production build.
6. Run Capacitor iOS sync.
7. Confirm Version 12 / Build 13 in Xcode before archiving.
8. Review Git changes, commit to `main`, then push through GitHub Desktop.

## Verification record

- Safety backup created and checked before synchronization.
- Package, Capacitor and both Xcode build configurations agree on Build 13.
- Capacitor iOS sync: passed; 10 plugins discovered and web assets copied.
- Browser production bundle: passed (3,150 modules).
- SSR bundle exists and passes Node syntax/import-map checks.
- Strict standalone TypeScript check: not clean because the supplied Airo source contains 872 inherited diagnostics across 359 files; these are broader than this delivery.
- Git whitespace and final complete production-build results are recorded during final packaging.

## Scope and safety

- The original repository and native project were preserved.
- The backup excludes only regenerable `node_modules` and `dist` folders.
- Secrets are not included in this Patch.
- No Git push, publish, deployment or TestFlight upload is part of this preparation.
