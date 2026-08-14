/**
 * BuilderTab — Owner Console tab
 * ─────────────────────────────────────────────────────────────────────────────
 * GoDaddy's builder sets X-Frame-Options / CSP frame-ancestors which prevents
 * embedding in an iframe. We detect this immediately and show a clean fallback
 * with a prominent "Open in new tab" button plus a direct deep-link.
 */
import { useState } from 'react';
import {
  Code2, ExternalLink, Maximize2, Minimize2,
  AlertTriangle, MonitorSmartphone,
} from 'lucide-react';

const BUILDER_URL = 'https://airo-builder.godaddy.com/develop/f38wenbvln?siteId=f38wenbvln';

export default function BuilderTab() {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div
      className={`flex flex-col bg-slate-950 ${
        fullscreen ? 'fixed inset-0 z-50' : 'h-full'
      }`}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <Code2 size={15} className="text-violet-400" />
          <span className="text-sm font-bold text-slate-100">Airo Builder</span>
          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[300px] hidden sm:block select-all">
            {BUILDER_URL}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={BUILDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
          >
            <ExternalLink size={12} />
            Open in new tab
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

      {/* ── Body — blocked fallback ── */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 px-8 text-center bg-slate-950">

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <AlertTriangle size={28} className="text-amber-400" />
        </div>

        {/* Explanation */}
        <div className="max-w-md">
          <p className="text-base font-bold text-slate-100 mb-2">
            Builder can't be embedded here
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            GoDaddy's builder blocks iframe embedding for security reasons
            (<code className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">X-Frame-Options: DENY</code>).
            Open it in a new tab — your session carries over automatically.
          </p>
        </div>

        {/* Primary CTA */}
        <a
          href={BUILDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-all shadow-lg hover:shadow-violet-500/25 hover:scale-105 active:scale-95"
        >
          <ExternalLink size={15} />
          Open Airo Builder
        </a>

        {/* URL copy strip */}
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 max-w-md w-full">
          <MonitorSmartphone size={13} className="text-slate-500 shrink-0" />
          <span className="text-xs text-slate-400 font-mono truncate flex-1 select-all">
            {BUILDER_URL}
          </span>
        </div>

        {/* Tip */}
        <p className="text-xs text-slate-600 max-w-sm">
          Tip: keep the builder open in a pinned tab alongside this portal —
          copy the Airo Prompt from Bug Reports and paste it directly into the builder chat.
        </p>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900 border-t border-slate-700 shrink-0">
        <span className="text-[10px] text-slate-500">
          IWILLBUILD · App ID: f38wenbvln · Platform owner only
        </span>
        <span className="text-[10px] text-slate-600">
          Changes made in the builder deploy to iwillbuild.com
        </span>
      </div>
    </div>
  );
}
