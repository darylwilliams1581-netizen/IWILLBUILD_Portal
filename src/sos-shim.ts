// sos-shim.ts — imported first in main.tsx before any other module
// The browser has a frozen Vite HMR snapshot of RootLayout.tsx (t=1783772358219)
// that references SOSAlertPopup as a free variable inside the component JSX.
// Because this module has NO imports, it is guaranteed to execute before any
// other module in the graph. Setting SOSAlertPopup on globalThis here means
// it is defined before the frozen snapshot's module body runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).SOSAlertPopup = function SOSAlertPopup() { return null; };
