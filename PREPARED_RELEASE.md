# IWILLBUILD release candidate - Version 12.0.3, Build 15

Prepared 2026-08-18 from:

`C:\Users\daryl_ey\Downloads\IWILLBUILD_Portal (3)\IWILLBUILD_Portal`

Target repository:

`C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\IWILLBUILD_Portal`

- Git remote: `https://github.com/darylwilliams1581-netizen/IWILLBUILD_Portal.git`
- Base commit: `a71ed9d0790fcb38415f2cb4ca0f28030cc43029`
- Target branch: `main`
- Web/package version: `12.0.3`
- iOS marketing version: `12`
- iOS/TestFlight build number: `15`
- Safety backup: `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\IWILLBUILD_Portal_backup_20260818_164628`

## Preparation result

The complete Airo application download was merged with the retained Capacitor/iOS delivery overlay. Git history, native app assets, release scripts and the SSR packaging correction were preserved.

The dependency merge retains both the Airo-native Share plugin and the direct Busboy upload dependency. Debug and Release Xcode configurations both use Build 15.

## Verification result

- Browser production build: passed (3,164 modules).
- SSR production build: passed (3,924 modules).
- Complete production build: passed with exit code 0.
- Capacitor iOS sync: passed; 11 native plugins registered, including Share.
- Strict standalone TypeScript audit: failed on the downloaded project's inherited diagnostics backlog. These unrelated diagnostics were not mass-edited during release preparation.

The prepared iOS project has already been synchronised. The downstream TestFlight workflow may repeat the sync as its normal archive step.
