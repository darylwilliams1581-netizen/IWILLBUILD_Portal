import { execSync } from "node:child_process";

execSync("npx vite build --configLoader runner --outDir dist/client", {
  stdio: "inherit",
  shell: true
});
