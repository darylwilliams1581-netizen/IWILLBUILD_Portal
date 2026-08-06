import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const clientEntry = "dist/client/index.html";
const serverBundle = "dist/server.bundle.mjs";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function runVite(args, label) {
  console.log(`[startup] building ${label}...`);
  const result = spawnSync(npxCommand, ["vite", ...args], {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  if (result.error) {
    console.error(`[startup] ${label} build failed:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Airo preview can start in a clean container without a prebuilt dist folder.
// Build the client and SSR entry before launching the server when needed.
if (!existsSync(clientEntry)) {
  runVite(["build", "--outDir", "dist/client"], "client");
}

if (!existsSync(serverBundle) || process.env.AIRO_PREVIEW === "true") {
  runVite(["build", "--ssr", "src/server/entry.ts"], "server");
}

const child = spawn(process.execPath, [serverBundle], {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

child.on("error", (error) => {
  console.error("[startup] failed to launch server bundle:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[startup] server stopped by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
