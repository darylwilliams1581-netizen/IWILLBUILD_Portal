import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["vite", "build", "--outDir", "dist/client"];

const child = spawn(command, args, {
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Build stopped by signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
