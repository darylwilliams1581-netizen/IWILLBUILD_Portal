/**
 * BuilderTab — Owner Console tab
 * ─────────────────────────────────────────────────────────────────────────────
 * Embeds the GoDaddy Airo Builder in an iframe so the platform owner can
 * review and fix code without leaving the IWILLBUILD portal.
 *
 * The builder URL is hardcoded to this app's workspace. The iframe is
 * sandboxed with the minimum permissions needed for the builder to function.
 *
 * Note: GoDaddy's builder may refuse to load inside an iframe if it sets
 * X-Frame-Options: DENY or CSP frame-ancestors: 'none'. In that case the
 * fallback "Open in new tab" button is the primary action.
 */
import { useState, useRef } from 'react';
import {
  Code2, ExternalLink, RefreshCw, Maximize2, Minimize2,
  AlertTriangle, Loader2,
} from 'lucide-react';

const BUILDER_URL = 'https://airo-builder.godaddy.com/develop/f38wenbvln?siteId=f38wenbvln';

export default function BuilderTab() {
  const [loading, setLoading]       = useState(true);
  const [blocked, setBlocked]       = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef                   = useRef<HTMLIFrameElement>(null);
  const containerRef                = useRef<HTMLDivElement>(null);

  function handleLoad() {
    setLoading(false);
    // Try to detect if the iframe was blocked (blank page / about:blank)
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc && (doc.URL === 'about:blank' || doc.body?.innerHTML === '')) {
        setBlocked(true);
      }
    } catch {
      // Cross-origin — can't inspect; assume it loaded fine
    }
  }

  function handleError() {
    setLoading(false);
    setBlocked(true);
  }

  function reload() {
    setLoading(true);
    setBlocked(false);
    if (iframeRef.current) {
      iframeRef.current.src = BUILDER_URL;
    }
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-slate-950 ${
        fullscreen
          ? 'fixed inset-0 z-50'
          : 'h-full'
      }`}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <Code2 size={15} className="text-violet-400" />
          <span className="text-sm font-bold text-slate-100">Airo Builder</span>
          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[260px] hidden sm:block">
            {BUILDER_URL}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Reload */}
          <button
            onClick={reload}
            title="Reload builder"
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={14} />
          </button>

          {/* Open in new tab */}
          <a
            href={BUILDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
          >
            <ExternalLink size={12} />
            Open in new tab
          </a>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ── iframe area ── */}
      <div className="relative flex-1 min-h-0">
        {/* Loading spinner */}
        {loading && !blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
            <Loader2 size={28} className="animate-spin text-violet-400" />
            <p className="text-sm text-slate-400">Loading Airo Builder…</p>
          </div>
        )}

        {/* Blocked / X-Frame-Options fallback */}
        {blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-4 px-8 text-center">
            <AlertTriangle size={32} className="text-amber-400" />
            <div>
              <p className="text-sm font-bold text-slate-200 mb-1">
                Builder blocked in iframe
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                GoDaddy's builder prevents embedding for security reasons.
                Use the button below to open it in a new tab — your session
                carries over automatically.
              </p>
            </div>
            <a
              href={BUILDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors shadow-lg"
            >
              <ExternalLink size={14} />
              Open Airo Builder
            </a>
            <button
              onClick={reload}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* The iframe */}
        {!blocked && (
          <iframe
            ref={iframeRef}
            src={BUILDER_URL}
            title="Airo Builder"
            onLoad={handleLoad}
            onError={handleError}
            allow="clipboard-read; clipboard-write; camera; microphone"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-top-navigation-by-user-activation"
            className="w-full h-full border-0"
            style={{ display: loading ? 'none' : 'block' }}
          />
        )}
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900 border-t border-slate-700 shrink-0">
        <span className="text-[10px] text-slate-500">
          IWILLBUILD · App ID: f38wenbvln · Platform owner only
        </span>
        <span className="text-[10px] text-slate-600">
          Changes made here deploy to iwillbuild.com
        </span>
      </div>
    </div>
  );
}
