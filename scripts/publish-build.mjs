import { execSync } from "node:child_process";

// Build client assets
execSync("npx vite build --outDir dist/client", {
  stdio: "inherit",
  shell: true
});

// Build SSR server bundle — this is what production runs
execSync("npx vite build --ssr src/server/entry.ts --outDir dist", {
  stdio: "inherit",
  shell: true
});
