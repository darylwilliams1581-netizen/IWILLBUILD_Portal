# IWILLBUILD release candidate - Version 12.0.1, Build 13

Prepared 2026-08-16 from the new Airo download at:

`C:\Users\daryl_ey\Downloads\IWILLBUILD_Portal (1)\IWILLBUILD_Portal`

The download was merged into the existing Git repository without replacing its `.git` history or its Capacitor/iOS delivery files.

- Git remote: `https://github.com/darylwilliams1581-netizen/IWILLBUILD_Portal.git`
- Base commit before this delivery: `8bf95229e533493b66ca281c2a98044d7f65832d`
- Web/package version: `12.0.1`
- iOS marketing version: `12`
- iOS/TestFlight build number: `13`
- Target branch: `main`

## Included Airo work

- Dazza V3, Anatomy snapshots and read-only GitHub anatomy integration.
- Bug Loop analysis, Dazza review, owner communication and fix-prompt workflow.
- Secure Quote/Invoice/Form sharing with view/download content routes.
- Standard document email composition and PDF attachments.
- Weather widget and dashboard integration.
- Safety poster PDF generation and poster preview updates.
- Lists and user-log server repairs from the latest Airo session.
- Estimate Print modal removal while retaining server-generated PDF download.

## Native delivery preservation

The existing Capacitor project, iOS project, native icons, scripts and Git repository were retained. Capacitor sync completed successfully after the source merge, and Debug/Release Xcode build numbers are both 13.

## Build preparation

The production build script now creates both browser and SSR bundles, supplies the deployed `#airo/secrets` runtime shim, copies starter-pack data, and gives Vite a 4 GB heap allowance for reliable packaging.

The Airo codebase has substantial inherited strict TypeScript debt outside this delivery (872 diagnostics across 359 files). Vite production packaging does not use that standalone check. See `PATCH_MANIFEST.md` for the verification record and patch instructions.

No Git push, deployment, Airo publish or TestFlight upload was performed by Codex.
