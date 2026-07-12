import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { crashed: boolean; otherError: Error | null; }

const GUARD_KEY = 'rl_stale_ts';
const WINDOW_MS = 10_000;

function recentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(GUARD_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Catches the SOSAlertPopup ReferenceError thrown by the frozen Vite HMR
 * snapshot of RootLayout.tsx (t=1783772358219).
 *
 * Guard logic (v11 — timestamp-based, mirrors index.html v11):
 *  - On SOSAlertPopup error: if no reload within the last 10 s, record the
 *    current timestamp and reload. The 10 s window prevents an infinite loop.
 *  - We do NOT clear the guard on mount — clearing it before the error check
 *    was the root cause of the infinite reload loop in v10.
 *  - Non-SOSAlertPopup errors: re-thrown so inner boundaries handle them.
 */
export default class StaleModuleReloadBoundary extends Component<Props, State> {
  state: State = { crashed: false, otherError: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (error instanceof ReferenceError && error.message.includes('SOSAlertPopup')) {
      return { crashed: true, otherError: null };
    }
    return { crashed: false, otherError: error };
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.crashed && !prev.crashed) {
      if (!recentReload()) {
        try { localStorage.setItem(GUARD_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
    }
  }

  render() {
    // Re-throw non-SOSAlertPopup errors so inner boundaries handle them.
    if (this.state.otherError) throw this.state.otherError;

    if (this.state.crashed) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h2>Something went wrong loading the portal.</h2>
          <p>Please do a hard reload (Ctrl+Shift+R / Cmd+Shift+R) to clear the browser cache.</p>
          <button
            onClick={() => {
              try { localStorage.removeItem(GUARD_KEY); } catch (_) {}
              window.location.reload();
            }}
          >
            Reload now
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
