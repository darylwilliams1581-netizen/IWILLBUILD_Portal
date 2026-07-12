import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { crashed: boolean; }

/**
 * Catches the SOSAlertPopup ReferenceError thrown by the frozen Vite HMR
 * snapshot of RootLayout.tsx (t=1783772358219).
 *
 * Uses localStorage (not sessionStorage) for the reload guard so that
 * index.html's sessionStorage-clearing script cannot reset it mid-loop.
 * The guard key is written before reload and checked on the next load —
 * if the error is gone the key is cleared; if it persists we show the
 * manual-reload UI instead of looping.
 */
export default class StaleModuleReloadBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  componentDidMount() {
    // If we reloaded to fix the error and it's now gone, clear the guard.
    try { localStorage.removeItem('rl_stale_reload_done'); } catch (_) {}
  }

  componentDidCatch(error: Error) {
    if (error instanceof ReferenceError && error.message.includes('SOSAlertPopup')) {
      try {
        const KEY = 'rl_stale_reload_done';
        if (!localStorage.getItem(KEY)) {
          localStorage.setItem(KEY, '1');
          window.location.reload();
          return;
        }
      } catch (_) {}
      // Already reloaded once and error persists — show manual UI
      this.setState({ crashed: true });
      return;
    }
    // Not our error — re-throw so outer boundary handles it
    throw error;
  }

  render() {
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
