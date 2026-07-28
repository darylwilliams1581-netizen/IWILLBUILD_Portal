# Appflow Patches

Saved July 28, 2026 for IWILLBUILD Appflow recovery.

## Patch 1

File: `capacitor.config.json`

```json
{
  "appId": "com.iwillbuild.app",
  "appName": "IWILLBUILD",
  "webDir": "dist/client",
  "bundledWebRuntime": false
}
```

## Patch 2

File: `scripts/publish-build.mjs`

```js
import { execSync } from "node:child_process";

execSync("npx vite build --outDir dist/client", {
  stdio: "inherit",
  shell: true
});
```

## Patch 3

File: `package.json`

Ensure:

```json
"eslint": "^9.39.5"
```

## Patch 4

File: `dev-tools/src/AiroErrorBoundary.tsx`

```tsx
import React from 'react';

function AiroErrorBoundary({ children }: { children?: React.ReactNode; captureGlobalErrors?: boolean }) {
  return <>{children}</>;
}

export default AiroErrorBoundary;
```

## Patch 5

Files:

- `ios/.gitignore`
- `ios/debug.xcconfig`
- `ios/App/App.xcodeproj/...`
- `ios/App/App/...`
- `ios/App/CapApp-SPM/...`

Purpose:

- Restore the native Capacitor iOS project when Appflow fails with:
  `No .xcodeproj file found`
- Required path:
  `ios/App/App.xcodeproj`

Notes:

- This was regenerated locally with `npx cap add ios`
- Appflow needs the full `ios` folder committed to GitHub, not just web files
- If the `ios` folder is missing, Appflow can build the web bundle but cannot package the iOS app

## Notes

- Use these patches when an Airo export is missing Appflow build files.
- Confirm `capacitor.config.json` exists at project root beside `package.json`.
- Confirm `scripts/publish-build.mjs` exists before pushing to GitHub and rerunning Appflow.
- Confirm `dev-tools/src/AiroErrorBoundary.tsx` exists if `src/main.tsx` imports it.
- Confirm `ios/App/App.xcodeproj` exists before rerunning an iOS Appflow build.
