/**
 * DesktopOnly
 * ─────────────────────────────────────────────────────────────────────────────
 * Guard component that blocks access to pages that are desktop-only.
 *
 * On native iOS / Android (Capacitor) the screen is too small and the
 * drag-and-drop studio builder / admin console are not touch-optimised.
 * Navigating to these pages on mobile via a direct URL would show a broken
 * layout. This guard intercepts the render and shows a friendly "use desktop"
 * screen instead.
 *
 * Detection strategy
 * ──────────────────
 * We use TWO signals combined with OR so the guard fires on either:
 *
 *   1. isNative() — running inside a Capacitor WKWebView (iOS / Android app).
 *      This is the primary signal for TestFlight / App Store builds.
 *
 *   2. window.innerWidth < MOBILE_BREAKPOINT — running in a narrow browser
 *      window (e.g. someone opens the web app on their phone browser, or a
 *      developer resizes the preview pane). We re-check on resize so the guard
 *      lifts if the window is widened.
 *
 * The guard does NOT redirect — it renders a full-screen message in place of
 * the page content. This keeps the URL intact so the user can share it with
 * a desktop colleague, and avoids a redirect loop if /home is also narrow.
 *
 * Usage (in routes.tsx):
 *   function protectDesktop(element: React.ReactElement) {
 *     return (
 *       <ProtectedRoute>
 *         <Suspense fallback={<PageLoader />}>
 *           <DesktopOnly>{element}</DesktopOnly>
 *         </Suspense>
 *       </ProtectedRoute>
 *     );
 *   }
 */

import { useState, useEffect } from 'react';
import { Monitor, Smartphone, ArrowLeft } from 'lucide-react';
import { isNative } from '@/lib/capacitor-plugins';
import { useNavigate } from 'react-router-dom';

/** Viewport width below which the guard activates (px). */
const MOBILE_BREAKPOINT = 768;

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

interface DesktopOnlyProps {
  children: React.ReactNode;
  /**
   * Optional page label shown in the message, e.g. "Studio Builder".
   * Defaults to "This page".
   */
  pageName?: string;
}

export default function DesktopOnly({ children, pageName = 'This page' }: DesktopOnlyProps) {
  const native = isNative();
  const navigate = useNavigate();

  // Track viewport width for web-browser narrow-window detection.
  // On native we skip the listener — isNative() is stable for the app lifetime.
  const [narrowViewport, setNarrowViewport] = useState(() => isMobileViewport());

  useEffect(() => {
    if (native) return; // native detection is sufficient; no need to listen
    const handler = () => setNarrowViewport(isMobileViewport());
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, [native]);

  const blocked = native || narrowViewport;

  if (!blocked) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center bg-background">
      {/* Back button — top-left */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all px-2 py-1.5 rounded-lg hover:bg-muted"
        aria-label="Go back"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Icon pair */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted border border-border">
          <Smartphone size={26} className="text-muted-foreground/40" />
        </div>
        <div className="w-8 h-px bg-border" />
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30">
          <Monitor size={26} className="text-primary" />
        </div>
      </div>

      {/* Heading */}
      <div className="flex flex-col gap-2 max-w-xs">
        <h1 className="text-foreground font-bold text-xl leading-snug">
          {pageName} is desktop only
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Open IWILLBUILD in a desktop browser to access this area.
        </p>
      </div>

      {/* Login link */}
      <a
        href="https://iwillbuild.com/login"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2.5 bg-primary hover:bg-violet-700 active:bg-violet-800 text-white font-semibold text-base rounded-2xl px-8 py-4 max-w-xs w-full transition-colors shadow-lg"
      >
        <Monitor size={20} />
        Open iwillbuild.com
      </a>
    </div>
  );
}
