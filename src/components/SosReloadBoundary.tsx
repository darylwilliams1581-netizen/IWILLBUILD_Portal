import { Component, type ReactNode } from 'react';

/**
 * SosReloadBoundary — sits ABOVE AiroErrorBoundary in main.tsx.
 *
 * The browser caches a frozen Vite HMR snapshot of RootLayout.tsx at
 * ?t=1783772358219 that references SOSAlertPopup as a bare identifier.
 * When that snapshot executes it throws ReferenceError: SOSAlertPopup is
 * not defined — BEFORE sos-shim.ts has a chance to set it on globalThis,
 * because the frozen module is already in the browser's module registry.
 *
 * Strategy:
 *  - Catch ALL errors here first (above AiroErrorBoundary).
 *  - If it's a SOSAlertPopup ReferenceError → reload (clears the frozen
 *    module from the registry). A 10-second guard prevents reload loops.
 *  - For any other error → reset the boundary key so the children
 *    re-mount fresh; AiroErrorBoundary will catch it on the next render.
 */

const GUARD_KEY = 'sos_reload_ts';
const WINDOW_MS = 10_000;

function recentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(GUARD_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < WINDOW_MS;
  } catch {
    return false;
  }
}

function isSosError(error: unknown): boolean {
  return (
    error instanceof ReferenceError &&
    typeof error.message === 'string' &&
    error.message.includes('SOSAlertPopup')
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isSos: boolean;
  resetKey: number;
}

export default class SosReloadBoundary extends Component<Props, State> {
  state: State = { hasError: false, isSos: false, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, isSos: isSosError(error) };
  }

  componentDidUpdate(_: Props, prev: State) {
    if (!this.state.hasError || prev.hasError) return;

    if (this.state.isSos) {
      // SOSAlertPopup error — reload to flush the frozen module.
      if (!recentReload()) {
        try {
          localStorage.setItem(GUARD_KEY, String(Date.now()));
        } catch (_) {}
        window.location.reload();
      }
      // If we already reloaded recently, fall through to reset below
      // so the app at least attempts to render rather than staying blank.
    }

    // Non-SOS error (or post-guard fallback): reset so AiroErrorBoundary
    // gets a fresh render pass and can catch + report it properly.
    this.setState((s) => ({ hasError: false, isSos: false, resetKey: s.resetKey + 1 }));
  }

  render() {
    // While waiting for componentDidUpdate to fire, render nothing
    // (avoids a flash of broken UI before reload or reset).
    if (this.state.hasError) return null;

    return (
      <div key={this.state.resetKey} style={{ display: 'contents' }}>
        {this.props.children}
      </div>
    );
  }
}
