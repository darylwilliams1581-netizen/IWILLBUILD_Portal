// RootLayout — IWILLBUILD Portal — v29 — 2026-07-13 — sos-shim-import
// Imports SOSAlertPopup so the stale Vite HMR module (t=1783772358219)
// that references it at line 122 resolves without a ReferenceError.
// The live app uses RootLayout3 directly via App.tsx and entry-server.tsx.
import SOSAlertPopup from '@/components/SOSAlertPopup';
// Keep the symbol reachable in this module scope
void SOSAlertPopup;

export { default } from './RootLayout3';
