import { Component, type ReactNode } from 'react';

/**
 * SosReloadBoundary — outermost boundary in main.tsx, above AiroErrorBoundary.
 *
 * Catches SOSAlertPopup ReferenceErrors from the frozen Vite HMR snapshot of
 * RootLayout.tsx (t=1783772358219) and reloads once to flush the module registry.
 *
 * Non-SOS errors are re-thrown from render so AiroErrorBoundary catches them.
 */

const GUARD_KEY = 'sos_outer_reload_ts';
const WINDOW_MS = 12_000;

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
    typeof (error as Error).message === 'string' &&
    (error as Error).message.includes('SOSAlertPopup')
  );
}

interface Props { children: ReactNode; }
interface State { sosError: boolean; }

export default class SosReloadBoundary extends Component<Props, State> {
  state: State = { sosError: false };
  private _otherError: Error | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { sosError: isSosError(error) };
  }

  componentDidCatch(error: Error) {
    if (!isSosError(error)) {
      this._otherError = error;
    }
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.sosError && !prev.sosError) {
      // Use the centralised reload helper from index.html if available,
      // otherwise fall back to the local guard.
      if (typeof (window as any).__sosBoundaryTrigger === 'function') {
        (window as any).__sosBoundaryTrigger();
      } else if (!recentReload()) {
        try { localStorage.setItem(GUARD_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
    }
  }

  render() {
    // Re-throw non-SOS errors so AiroErrorBoundary (child) catches them.
    if (this._otherError) {
      const err = this._otherError;
      this._otherError = null;
      throw err;
    }

    // While waiting for reload, render nothing.
    if (this.state.sosError) return null;

    return this.props.children;
  }
}
