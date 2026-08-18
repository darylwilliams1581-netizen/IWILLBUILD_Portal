/**
 * AppErrorBoundary
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-grade top-level error boundary for iOS / native field use.
 *
 * Catches:
 *   - React render errors (componentDidCatch)
 *   - Unhandled promise rejections (window.unhandledrejection)
 *   - Uncaught JS errors (window.error)
 *
 * On catch: shows a clean recovery screen with a "Reload App" button.
 * Does NOT interfere with the SosInterceptBoundary in main.tsx — that
 * boundary handles the specific stale-shim NotFoundError. This boundary
 * sits INSIDE SosInterceptBoundary and catches everything else.
 */

import { Component, type ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional: render a custom fallback instead of the default recovery screen */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  // ── Global error listeners ─────────────────────────────────────────────────

  private _onUnhandledRejection = (ev: PromiseRejectionEvent) => {
    const msg = ev.reason instanceof Error
      ? ev.reason.message
      : String(ev.reason ?? 'Unknown error');
    if (this._isBenign(msg)) return;
    console.error('[AppErrorBoundary] unhandledrejection:', ev.reason);
    ev.preventDefault();
    this.setState({ hasError: true, errorMessage: msg });
  };

  private _onWindowError = (ev: ErrorEvent) => {
    if (!ev.error) return;
    const msg = ev.error instanceof Error ? ev.error.message : String(ev.error);
    if (this._isBenign(msg)) return;
    console.error('[AppErrorBoundary] window.error:', ev.error);
    this.setState({ hasError: true, errorMessage: msg });
  };

  /** Patterns that are safe to ignore — don't show the recovery screen */
  private _isBenign(msg: string): boolean {
    const lower = msg.toLowerCase();
    return (
      lower.includes('notfounderror') ||
      lower.includes('removechild') ||
      lower.includes('resizeobserver loop') ||
      lower.includes('script error') ||
      lower.includes('cancelled') ||
      lower.includes('cancel') ||
      lower.includes('no image') ||
      lower.includes('user cancelled')
    );
  }

  componentDidMount() {
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);
    window.addEventListener('error', this._onWindowError);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
    window.removeEventListener('error', this._onWindowError);
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message ?? 'Something went wrong' };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[AppErrorBoundary] componentDidCatch:', error, info?.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMessage: null });
    try { window.location.reload(); } catch { /* ignore in test env */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background text-foreground p-6 z-[9999]">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center mb-5">
          <AlertTriangle size={32} className="text-destructive" />
        </div>

        {/* Heading */}
        <h1 className="text-xl font-bold mb-2 text-center">Something went wrong</h1>

        {/* Subtext */}
        <p className="text-sm text-muted-foreground text-center max-w-xs mb-8 leading-relaxed">
          The app hit an unexpected error. Tap below to reload — your saved
          photos and data are safe.
        </p>

        {/* Reload button */}
        <button
          onClick={this.handleReload}
          className="flex items-center gap-2 px-7 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-95 transition-transform"
        >
          <RefreshCw size={16} />
          Reload App
        </button>

        {/* Error detail (collapsed) */}
        {this.state.errorMessage && (
          <details className="mt-6 max-w-sm w-full">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              Error details
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded-lg text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {this.state.errorMessage}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

export default AppErrorBoundary;
