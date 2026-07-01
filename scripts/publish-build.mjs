#!/usr/bin/env node
/**
 * publish-build.mjs
 *
 * Wrapper around `npm run build:app` that:
 *  - Passes stdout through untouched (Vite progress, module counts, timings)
 *  - Passes stderr through EXCEPT for the two known-harmless airo-sandbox WARN
 *    lines that the publish pipeline incorrectly treats as build failures
 *  - Exits with the same code as the underlying build process
 *
 * Only these exact WARN patterns are suppressed:
 *   WARN airo-sandbox: user-specified path does not exist, skipping path=/git-repo ...
 *   WARN airo-sandbox: user-specified path does not exist, skipping path=/node_modules ...
 *
 * All TypeScript errors, Vite errors, dependency errors, and any other stderr
 * output is forwarded verbatim so real failures remain visible.
 */

import { spawn } from 'node:child_process';

// Lines matching this pattern are the only ones suppressed.
// Using a simple string test (no regex) to avoid any ReDoS risk.
function isHarmlessSandboxWarn(line) {
  return (
    line.includes('WARN airo-sandbox: user-specified path does not exist') &&
    (line.includes('path=/git-repo') || line.includes('path=/node_modules'))
  );
}

const child = spawn('npm', ['run', 'build:app'], {
  stdio: ['inherit', 'inherit', 'pipe'],
  shell: false,
});

let stderrBuf = '';

child.stderr.on('data', (chunk) => {
  stderrBuf += chunk.toString();
  // Flush complete lines, holding back any partial line at the end.
  const lines = stderrBuf.split('\n');
  stderrBuf = lines.pop(); // last element may be incomplete
  for (const line of lines) {
    if (!isHarmlessSandboxWarn(line)) {
      process.stderr.write(line + '\n');
    }
  }
});

child.stderr.on('end', () => {
  // Flush any remaining partial line.
  if (stderrBuf && !isHarmlessSandboxWarn(stderrBuf)) {
    process.stderr.write(stderrBuf + '\n');
  }
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
