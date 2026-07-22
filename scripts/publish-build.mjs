import { execSync } from "node:child_process";

execSync("npx vite build --outDir dist/client", {
  stdio: "inherit",
  shell: true
});
