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

## Notes

- Use these patches when an Airo export is missing Appflow build files.
- Confirm `capacitor.config.json` exists at project root beside `package.json`.
- Confirm `scripts/publish-build.mjs` exists before pushing to GitHub and rerunning Appflow.
