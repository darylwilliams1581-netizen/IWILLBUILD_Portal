// RootLayout.tsx — v42 — 2026-07-13
// The browser holds a frozen Vite HMR snapshot of this file at t=1783772358219.
// That snapshot's RootLayout function body references SOSAlertPopup at line 122:28
// as a bare identifier (ES module free variable). Because ES modules are strict-mode
// the identifier cannot be patched via window.SOSAlertPopup.
//
// Strategy: index.html now installs a capturing error listener that detects the
// ReferenceError and forces window.location.reload(true), clearing the module
// registry so the browser fetches fresh modules. The sessionStorage guard prevents
// reload loops. After one hard reload the frozen snapshot is gone.
//
// This file remains a thin re-export so App.tsx and entry-server.tsx (which both
// import RootLayout3 directly) are unaffected.

export { SOSAlertPopup } from './RootLayout3';
export { default } from './RootLayout3';
