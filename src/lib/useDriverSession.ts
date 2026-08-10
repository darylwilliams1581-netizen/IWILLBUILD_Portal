/**
 * useDriverSession
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin shim that re-exports from DriverSessionContext.
 *
 * All GPS tracking now lives in DriverSessionProvider (mounted at app level
 * in RootLayout). This hook is a backward-compatible consumer so existing
 * call sites (driver.tsx, dashboard.tsx, DrivingSessionBadge, etc.) continue
 * to work without changes to their import paths.
 *
 * DO NOT add GPS logic here — it belongs in DriverSessionContext.tsx.
 */

// Re-export types so existing imports like:
//   import type { DriverSession, GpsStatusValue } from '@/lib/useDriverSession'
// continue to work.
export type { DriverSession, GpsStatusValue } from './DriverSessionContext';

export { useDriverSessionContext as useDriverSession } from './DriverSessionContext';
