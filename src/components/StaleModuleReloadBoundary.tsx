import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { crashed: boolean; }

/**
 * Catches the SOSAlertPopup ReferenceError thrown by the frozen Vite HMR
 * snapshot of RootLayout.tsx (t=1783772358219). Instead of showing an error
 * UI it forces a hard reload (once, guarded by sessionStorage) so the browser
 * discards its module registry and fetches fresh modules.
 *
 * All other errors are re-thrown so the outer AiroErrorBoundary / PortalErrorBoundary
 * can handle them normally.
 */
export default class StaleModuleReloadBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  componentDidCatch(error: Error) {
    if (error instanceof ReferenceError && error.message.includes('SOSAlertPopup')) {
      const KEY = 'rl_stale_reloaded_v6';
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        window.location.reload();
        return;
      }
      // Already reloaded once — mark crashed so we don't loop
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
          <button onClick={() => { sessionStorage.clear(); window.location.reload(); }}>
            Hard reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
