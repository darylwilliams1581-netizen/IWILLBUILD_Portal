import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

// ── Post-build: ensure #airo/secrets resolves in the publish container ────────
//
// The publish container runs `node /app/dist/server.bundle.mjs` (or
// `./server.bundle.mjs` from /app).  Node resolves package `imports` maps by
// walking up from the importing file's directory.  The bundle lives at
// dist/server.bundle.mjs, so Node looks for package.json in dist/ first.
//
// The root package.json maps  "#airo/secrets" → "./export-plugins/airo-secrets.ts"
// which is a TypeScript source file — Node cannot execute it directly.
//
// Fix: write a compiled ESM shim into dist/airo-secrets.mjs and drop a
// minimal package.json into dist/ that maps "#airo/secrets" to that shim.
// Node finds dist/package.json first and resolves the .mjs file correctly.
//
// In the platform's managed injection flow the platform may override this shim
// with its own implementation — that's fine, this is only a fallback that reads
// from process.env (same behaviour as the dev shim).

const shimSrc = `
// Runtime shim for #airo/secrets — reads from process.env.
// The platform may replace this with a managed implementation at deploy time.
export function getSecret(name) {
  return process.env[name] ?? '';
}
`.trimStart();

writeFileSync(path.join(root, "dist", "airo-secrets.mjs"), shimSrc, "utf8");

const distPkg = {
  type: "module",
  imports: {
    "#airo/secrets": "./airo-secrets.mjs"
  }
};

writeFileSync(
  path.join(root, "dist", "package.json"),
  JSON.stringify(distPkg, null, 2) + "\n",
  "utf8"
);

console.log("[publish-build] wrote dist/airo-secrets.mjs and dist/package.json");
