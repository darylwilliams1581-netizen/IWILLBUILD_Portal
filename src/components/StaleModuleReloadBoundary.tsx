import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { crashed: boolean; otherError: Error | null; }

/**
 * Catches the SOSAlertPopup ReferenceError thrown by the frozen Vite HMR
 * snapshot of RootLayout.tsx (t=1783772358219).
 *
 * Must sit OUTSIDE AiroErrorBoundary/PortalErrorBoundary so it intercepts
 * the error first. Uses localStorage for the reload guard so index.html's
 * sessionStorage-clearing script cannot reset it mid-loop.
 *
 * Non-SOSAlertPopup errors are stored in state and re-thrown during render
 * so the inner boundary (AiroErrorBoundary / PortalErrorBoundary) handles them.
 */
export default class StaleModuleReloadBoundary extends Component<Props, State> {
  state: State = { crashed: false, otherError: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (error instanceof ReferenceError && error.message.includes('SOSAlertPopup')) {
      return { crashed: true, otherError: null };
    }
    // Pass other errors through by storing them — render will re-throw
    return { crashed: false, otherError: error };
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.crashed && !prev.crashed) {
      try {
        const KEY = 'rl_stale_reload_done';
        if (!localStorage.getItem(KEY)) {
          localStorage.setItem(KEY, '1');
          window.location.reload();
          return;
        }
      } catch (_) {}
    }
  }

  componentDidMount() {
    // If we reloaded and the error is gone, clear the guard
    if (!this.state.crashed) {
      try { localStorage.removeItem('rl_stale_reload_done'); } catch (_) {}
    }
  }

  render() {
    // Re-throw non-SOSAlertPopup errors so inner boundaries handle them
    if (this.state.otherError) throw this.state.otherError;

    if (this.state.crashed) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h2>Something went wrong</h2>
          <p>Please do a hard reload (Ctrl+Shift+R / Cmd+Shift+R) to clear the browser cache.</p>
          <button onClick={() => {
            try { localStorage.removeItem('rl_stale_reload_done'); } catch (_) {}
            window.location.reload();
          }}>
            Hard reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
