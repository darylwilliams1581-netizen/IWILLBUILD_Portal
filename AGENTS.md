# Agent rules for IWILLBUILD_Portal

You are editing the **web portal and API** repo.

GoDaddy Airo still controls the live website. This GitHub repo is the source of truth for code that gets committed and (for the Capacitor wrapper) built by Appflow.

## Hard stops

- Do not edit `ios/`, `android/`, or `capacitor.config.*` unless the human named that file.
- Do not rewrite camera capture to `getUserMedia` or a new Capacitor fallback.
- Do not dump a full project export onto `main`.
- Native iPhone camera belongs in repo `IWILLBUILD-iOS`, not here.
- Keep production Alpine constraints: no `sharp`, no `bcrypt`, no `canvas`. Use `jimp` and `bcryptjs`.
- Every data query stays scoped to `company_id`.

## Allowed here

- Website pages and copy
- Express API handlers
- Job / photo **server** endpoints the iOS app will call
- Billing, team, safety, studio, Dazza

## If the user asks to fix TestFlight camera

Stop. Tell them that work is `IWILLBUILD-iOS`. Do not patch the Capacitor wrapper camera again.
