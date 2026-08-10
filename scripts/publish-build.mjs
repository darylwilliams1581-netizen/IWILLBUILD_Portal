import { execSync } from "node:child_process";

// Build client assets
execSync("npx vite build --outDir dist/client", {
  stdio: "inherit",
  shell: true
});

// Build SSR server bundle — outputs dist/server.bundle.mjs via vite.config.ts SSR branch
execSync("npx vite build --ssr", {
  stdio: "inherit",
  shell: true
});
