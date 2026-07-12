import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { crashed: boolean; otherError: Error | null; }

const GUARD_KEY = 'rl_stale_reloading';

/**
 * Catches the SOSAlertPopup ReferenceError thrown by the frozen Vite HMR
 * snapshot of RootLayout.tsx (t=1783772358219).
 *
 * Must sit OUTSIDE AiroErrorBoundary/PortalErrorBoundary so it intercepts
 * the error first.
 *
 * Guard logic (mirrors index.html v10):
 *  - On clean mount: clear the guard key so every new page load gets a
 *    fresh chance to reload if the frozen snapshot resurfaces.
 *  - On SOSAlertPopup error: set the guard key then reload. The key prevents
 *    an infinite loop within the same reload cycle.
 *  - Non-SOSAlertPopup errors: re-thrown during render so inner boundaries
 *    (AiroErrorBoundary / PortalErrorBoundary) handle them normally.
 */
export default class StaleModuleReloadBoundary extends Component<Props, State> {
  state: State = { crashed: false, otherError: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (error instanceof ReferenceError && error.message.includes('SOSAlertPopup')) {
      return { crashed: true, otherError: null };
    }
    return { crashed: false, otherError: error };
  }

  componentDidMount() {
    // Clear guard on every clean mount — allows future reloads if needed.
    try { localStorage.removeItem(GUARD_KEY); } catch (_) {}
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.crashed && !prev.crashed) {
      try {
        if (!localStorage.getItem(GUARD_KEY)) {
          localStorage.setItem(GUARD_KEY, '1');
          window.location.reload();
          return;
        }
      } catch (_) {}
    }
  }

  render() {
    // Re-throw non-SOSAlertPopup errors so inner boundaries handle them.
    if (this.state.otherError) throw this.state.otherError;

    if (this.state.crashed) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h2>Something went wrong loading the portal.</h2>
          <p>Please do a hard reload to clear the browser cache.</p>
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
