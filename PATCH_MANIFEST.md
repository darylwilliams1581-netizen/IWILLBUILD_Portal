# IWILLBUILD delivery patch - Version 12.0.5, Build 17

Prepared 2026-08-26 from the Airo download at `C:\Users\daryl_ey\OneDrive\Desktop\iwillbuild\DOWNLOAD\IWILLBUILD_Portal` and the GitHub repository on branch `main`, base commit `6c2c9a6`.

## Version values

- npm/web version: `12.0.5`
- iOS `MARKETING_VERSION`: `12`
- iOS `CURRENT_PROJECT_VERSION`: `17` for Debug and Release
- Capacitor/iOS build number: `17`

## Delivery overlay retained

- Existing Git history and native Capacitor/iOS project.
- Native app icons, splash assets and release scripts.
- Direct `busboy` dependency required by the server upload service.
- ESM-safe `vite.config.ts` path handling required by the SSR build.
- Direct Jimp core and resize dependencies required by the exported storage/image code.

## Verification

- Full browser and SSR production build: passed, exit code 0.
- Capacitor iOS sync: passed; 11 native plugins registered.
- Standalone strict TypeScript check: inherited Airo diagnostics backlog remains; production bundling is successful.
- Exported test harness has known Airo-only module/database-mock limitations; 117/135 electrical calculation and validation tests pass locally, while the 18 handler tests require Airo's database configuration. Production files were not changed merely to mask harness failures.

## Safety and scope

- Source merge excluded `.git`, secrets, `node_modules`, `dist`, and the downloaded tree's absent native overlay.
- No secrets are included.
- The working tree is reviewed before commit and push.
