# IWILLBUILD release candidate - Version 12.0.5, Build 17

Prepared 2026-08-26 from:

`C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\DOWNLOAD\IWILLBUILD_Portal`

Target repository:

`C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\IWILLBUILD_Portal`

- Git remote: `https://github.com/darylwilliams1581-netizen/IWILLBUILD_Portal.git`
- Base commit: `6c2c9a6`
- Target branch: `main`
- Web/package version: `12.0.5`
- iOS marketing version: `12`
- iOS build number: `17`

## Preparation result

The latest Airo application download was merged into the GitHub repository while preserving Git history, the Capacitor/iOS project, native assets, release scripts, the direct Busboy dependency and the ESM-safe Vite configuration.

The release also preserves timezone-free MySQL DATETIME values during evidence upload, avoiding an unintended Brisbane-to-UTC time shift.

## Verification result

- Complete browser and SSR production build: passed with exit code 0.
- Capacitor iOS sync: passed; 11 native plugins registered, including Share.
- Debug and Release Xcode configurations both use Version 12 / Build 17.
- Strict standalone TypeScript audit: does not pass because the exported Airo source contains a large inherited diagnostics backlog. The production bundler succeeds; the backlog was not hidden or bulk-rewritten during this release merge.
- Exported unit tests have local harness limitations around Airo-only modules and database mocks. In the electrical suite, 117/135 calculation and validation tests pass; the 18 handler tests require the unavailable Airo database configuration. The evidence timestamp correction was confirmed with the database module stubbed locally.

The iOS project has been synchronised and is ready for the downstream Xcode archive and App Store submission workflow.
