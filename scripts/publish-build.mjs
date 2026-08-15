import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";

function runVite(args) {
  execFileSync(process.execPath, ["--max-old-space-size=4096", "node_modules/vite/bin/vite.js", "build", ...args], {
    stdio: "inherit",
  });
}

// Build the browser bundle first. The SSR build uses emptyOutDir=false so it
// adds the production server without removing dist/client.
runVite(["--configLoader", "runner", "--outDir", "dist/client"]);
runVite(["--configLoader", "runner", "--ssr"]);

// The server bundle intentionally externalises #airo/secrets. Node cannot
// execute the TypeScript export stub directly, so publish a JavaScript runtime
// shim and a dist-local import map that resolves the external safely.
mkdirSync("dist", { recursive: true });
writeFileSync(
  "dist/airo-secrets.mjs",
  `export function getSecret(secretName) {
  return process.env[secretName] ?? null;
}

export function listSecretNames() {
  return Object.keys(process.env).filter(
    (key) => !key.startsWith("npm_") && !key.startsWith("NODE_") && !key.startsWith("PATH"),
  );
}
`,
);
writeFileSync(
  "dist/package.json",
  `${JSON.stringify(
    {
      type: "module",
      imports: {
        "#airo/secrets": "./airo-secrets.mjs",
      },
    },
    null,
    2,
  )}\n`,
);

// Starter-pack JSON is read from dist/server/seed at runtime.
cpSync("src/server/seed/starter-packs", "dist/server/seed/starter-packs", {
  recursive: true,
  force: true,
});
