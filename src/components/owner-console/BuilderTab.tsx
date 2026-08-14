/**
 * BuilderTab — Owner Console tab
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the GoDaddy login page in an iframe as a second authentication layer.
 * Even if someone gains access to the Owner Console, they still need valid
 * GoDaddy credentials to proceed to the builder.
 *
 * After login, GoDaddy may redirect to the builder — which sets X-Frame-Options
 * and blocks embedding. The fallback "Open Builder" button handles that case.
 */
import { useState, useRef } from 'react';
import {
  Code2, ExternalLink, Maximize2, Minimize2, Loader2,
  ShieldCheck, AlertTriangle, RefreshCw, MonitorSmartphone,
} from 'lucide-react';

const GODADDY_LOGIN_URL = 'https://sso.godaddy.com/?realm=idp';
const BUILDER_URL       = 'https://airo-builder.godaddy.com/develop/f38wenbvln?siteId=f38wenbvln';

export default function BuilderTab() {
  const [loading, setLoading]       = useState(true);
  const [blocked, setBlocked]       = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef                   = useRef<HTMLIFrameElement>(null);

  function handleLoad() {
    setLoading(false);
    // After GoDaddy login the builder redirects — which may then block.
    // We can't inspect cross-origin content, so we just hide the spinner.
  }

  function handleError() {
    setLoading(false);
    setBlocked(true);
  }

  function reload() {
    setLoading(true);
    setBlocked(false);
    if (iframeRef.current) {
      iframeRef.current.src = GODADDY_LOGIN_URL;
    }
  }

  return (
    <div className={`flex flex-col bg-slate-950 ${fullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={15} className="text-emerald-400" />
          <span className="text-sm font-bold text-slate-100">GoDaddy Builder</span>
          <span className="text-[10px] text-slate-500 hidden sm:block">
            Sign in with your GoDaddy account to access the builder
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={reload}
            title="Reload"
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
          <a
            href={BUILDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
          >
            <ExternalLink size={12} />
            Open Builder
          </a>
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
      <div className="relative flex-1 min-h-0 bg-white">

        {/* Loading spinner */}
        {loading && !blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-3">
            <Loader2 size={26} className="animate-spin text-violet-400" />
            <p className="text-sm text-slate-400">Loading GoDaddy login…</p>
          </div>
        )}

        {/* Blocked fallback */}
        {blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-5 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <AlertTriangle size={26} className="text-amber-400" />
            </div>
            <div className="max-w-sm">
              <p className="text-sm font-bold text-slate-100 mb-2">Login page blocked</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                GoDaddy is preventing this page from loading in an iframe.
                Open the builder directly in a new tab — your GoDaddy session will apply.
              </p>
            </div>
            <a
              href={BUILDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-all shadow-lg"
            >
              <ExternalLink size={14} />
              Open Airo Builder
            </a>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 max-w-sm w-full">
              <MonitorSmartphone size={12} className="text-slate-500 shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono truncate select-all">{BUILDER_URL}</span>
            </div>
            <button onClick={reload} className="text-xs text-slate-500 hover:text-slate-300 underline">
              Try again
            </button>
          </div>
        )}

        {/* iframe — GoDaddy login → redirects to builder after auth */}
        <iframe
          ref={iframeRef}
          src={GODADDY_LOGIN_URL}
          title="GoDaddy Builder Login"
          onLoad={handleLoad}
          onError={handleError}
          allow="clipboard-read; clipboard-write"
          className="w-full h-full border-0"
          style={{ display: loading || blocked ? 'none' : 'block' }}
        />
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900 border-t border-slate-700 shrink-0">
        <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
          <Code2 size={10} />
          IWILLBUILD · App ID: f38wenbvln · Platform owner only
        </span>
        <span className="text-[10px] text-slate-600">
          GoDaddy credentials required · Changes deploy to iwillbuild.com
        </span>
      </div>
    </div>
  );
}
