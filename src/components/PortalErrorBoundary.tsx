/**
 * PortalErrorBoundary
 * ─────────────────────────────────────────────────────────────────────────────
 * Class-based React error boundary for production use.
 * Catches render errors (including React hook-order violations like #310)
 * and shows a friendly recovery screen instead of a blank/crashed page.
 *
 * Used in two places:
 *   1. App.tsx — wraps the entire route tree in production
 *   2. routes.tsx errorElement — per-route fallback so layout stays mounted
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { RefreshCw, LogIn } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** If true, renders a compact inline error (for per-route errorElement use) */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class PortalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Log to console — in production you could forward to a monitoring service here
    console.error('[PortalErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoToLogin = () => {
    window.location.href = '/login';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.inline) {
      // Compact version for per-route errorElement
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
            <RefreshCw size={20} className="text-red-500" />
          </div>
          <h2 className="font-heading font-bold text-lg text-slate-900 mb-1">
            Something went wrong
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            This page encountered an error. Please refresh or return to login.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              onClick={this.handleGoToLogin}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              <LogIn size={14} />
              Go to Login
            </button>
          </div>
        </div>
      );
    }

    // Full-screen version for the root boundary
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F1117] px-6 text-center">
        {/* Logo mark */}
        <div className="w-14 h-14 bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <span className="text-white font-black text-lg">IW</span>
        </div>

        <h1 className="font-heading font-black text-2xl text-white mb-2">
          Something went wrong
        </h1>
        <p className="text-white/50 text-sm mb-8 max-w-sm leading-relaxed">
          Please refresh the page or return to login. If the problem keeps happening, try clearing your browser cache.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={this.handleRefresh}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-md"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            onClick={this.handleGoToLogin}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition-colors"
          >
            <LogIn size={15} />
            Go to Login
          </button>
        </div>

        {/* Dev-only detail */}
        {import.meta.env.DEV && this.state.errorMessage && (
          <details className="mt-8 max-w-lg text-left">
            <summary className="text-white/30 text-xs cursor-pointer hover:text-white/50">
              Error detail (dev only)
            </summary>
            <pre className="mt-2 text-red-400 text-xs bg-black/40 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
              {this.state.errorMessage}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
