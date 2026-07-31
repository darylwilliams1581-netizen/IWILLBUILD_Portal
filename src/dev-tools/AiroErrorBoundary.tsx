/**
 * AiroErrorBoundary — production / Capacitor passthrough stub.
 *
 * This file is the alias target for:
 *   { find: '@/dev-tools/AiroErrorBoundary', replacement: '...this file...' }
 * in vite.config.ts.
 *
 * WHY THIS IS A PASSTHROUGH:
 * The real AiroErrorBoundary (dev-tools/src/AiroErrorBoundary.tsx) is a
 * builder-sandbox-only component. It imports builder-internal modules
 * (postMessage utils, HMR hooks, overlay UI, event bus, cycle state) that
 * only exist inside the Airo builder iframe. In a production Capacitor build
 * (npm run build:cap) or any standalone deployment, those modules don't exist
 * and the import chain would crash the JS bundle at parse time → white screen.
 *
 * The previous version of this stub used a dynamic require() inside try/catch
 * to attempt loading the real boundary. In a Vite ESM production build, Vite
 * statically analyzes require() calls and tries to bundle the target — which
 * pulls in the full builder boundary and all its internal deps, causing the
 * same crash. The try/catch does NOT prevent Vite from bundling the require().
 *
 * This passthrough is the correct production form:
 *   - Zero builder-internal imports
 *   - No require() calls
 *   - Renders children transparently
 *   - Matches the interface expected by main.tsx (children + captureGlobalErrors)
 *
 * The builder sandbox injects the real AiroErrorBoundary via its own Vite
 * plugin layer, which overrides this alias at build time in the sandbox only.
 */
import React from 'react';

function AiroErrorBoundary({
  children,
}: {
  children?: React.ReactNode;
  captureGlobalErrors?: boolean;
}) {
  return <>{children}</>;
}

export default AiroErrorBoundary;
