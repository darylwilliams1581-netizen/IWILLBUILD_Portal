/**
 * Local-dev / E2E passthrough for AiroErrorBoundary.
 *
 * In the builder sandbox the real component lives at
 * ../../dev-tools/src/AiroErrorBoundary (project root).
 * When that directory is present (local dev), src/main.tsx and src/App.tsx
 * import it directly via relative paths — this file is never loaded.
 *
 * This stub exists solely as the alias target for
 *   { find: '@/dev-tools/AiroErrorBoundary', replacement: '...this file...' }
 * in vite.config.ts, so Vite does not 404 if any future import uses the
 * @-alias form instead of a relative path.
 *
 * It re-exports the real component when available, otherwise falls back to a
 * plain React Fragment wrapper so the app still renders.
 */
import React from 'react';

let RealBoundary: React.ComponentType<{ children?: React.ReactNode; captureGlobalErrors?: boolean }> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RealBoundary = require('../../dev-tools/src/AiroErrorBoundary').default;
} catch {
  // dev-tools directory absent — use passthrough below
}

function PassthroughBoundary({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

const AiroErrorBoundary = RealBoundary ?? PassthroughBoundary;
export default AiroErrorBoundary;
