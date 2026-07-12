import { Component, type ReactNode } from 'react';

/**
 * SosReloadBoundary — outermost error boundary in main.tsx, above AiroErrorBoundary.
 *
 * The browser holds a frozen Vite HMR snapshot of RootLayout.tsx at
 * ?t=1783772358219 that references SOSAlertPopup as a bare module-scope
 * identifier. When that frozen module executes, it throws a ReferenceError
 * before AiroErrorBoundary can catch it — but AiroErrorBoundary IS catching
 * it because the frozen App.tsx snapshot also lacks StaleModuleReloadBoundary.
 *
 * This boundary sits ABOVE AiroErrorBoundary so it intercepts the error first.
 * On a SOSAlertPopup ReferenceError it reloads the page (clearing the frozen
 * module from the browser's module registry). A 10-second guard prevents loops.
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

interface Props { children: ReactNode; }
interface State { triggered: boolean; }

export default class SosReloadBoundary extends Component<Props, State> {
  state: State = { triggered: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (error instanceof ReferenceError && error.message.includes('SOSAlertPopup')) {
      return { triggered: true };
    }
    // Not our error — re-throw so AiroErrorBoundary handles it.
    throw error;
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.triggered && !prev.triggered) {
      if (!recentReload()) {
        try { localStorage.setItem(GUARD_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.triggered) {
      // Reloading — render nothing to avoid a flash.
      return null;
    }
    return this.props.children;
  }
}
