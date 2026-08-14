/**
 * BuilderTab — Owner Console tab (Platform Owner ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * GoDaddy blocks ALL their pages (login + builder) from iframe embedding via
 * X-Frame-Options: DENY. There is no workaround — we show a clean launcher
 * panel instead. The security model is:
 *   1. Your app auth (must be logged in)
 *   2. isPlatformOwner check (only your account sees this tab)
 *   3. GoDaddy SSO login required in the new tab
 */
import { useState } from 'react';
import {
  Code2, ExternalLink, Maximize2, Minimize2,
  ShieldCheck, Lock, MonitorSmartphone, ArrowUpRight,
} from 'lucide-react';

const GODADDY_LOGIN_URL = 'https://sso.godaddy.com/?realm=idp';
const BUILDER_URL       = 'https://airo-builder.godaddy.com/develop/f38wenbvln?siteId=f38wenbvln';

export default function BuilderTab() {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div className={`flex flex-col bg-slate-950 ${fullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2.5">
          <Code2 size={15} className="text-violet-400" />
          <span className="text-sm font-bold text-slate-100">GoDaddy Builder</span>
          <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500">
            <Lock size={9} />
            Platform owner only
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

      {/* ── Main body ── */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-8 px-8 bg-slate-950">

        {/* Shield icon */}
        <div className="w-20 h-20 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <ShieldCheck size={36} className="text-violet-400" />
        </div>

        {/* Heading */}
        <div className="text-center max-w-md">
          <p className="text-lg font-black text-slate-100 mb-2">GoDaddy Builder Access</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            GoDaddy blocks embedding for security. Sign in with your GoDaddy account
            in a new tab — your session is separate from this portal.
          </p>
        </div>

        {/* Two action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
          {/* Step 1 — GoDaddy login */}
          <a
            href={GODADDY_LOGIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-all border border-slate-600 hover:border-slate-500"
          >
            <Lock size={14} className="text-slate-300" />
            <span>1. GoDaddy Login</span>
            <ArrowUpRight size={13} className="text-slate-400 ml-auto" />
          </a>

          {/* Step 2 — Open builder */}
          <a
            href={BUILDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-all shadow-lg hover:shadow-violet-500/25"
          >
            <Code2 size={14} />
            <span>2. Open Builder</span>
            <ArrowUpRight size={13} className="ml-auto" />
          </a>
        </div>

        {/* Tip */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4 max-w-md w-full">
          <p className="text-xs font-bold text-slate-300 mb-1.5">Workflow tip</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Keep the builder pinned in a separate tab. When a bug report needs fixing,
            copy the <span className="text-violet-400 font-semibold">Airo Prompt</span> from
            the Bug Reports tab and paste it directly into the builder chat.
          </p>
        </div>

        {/* URL strip */}
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 max-w-md w-full">
          <MonitorSmartphone size={12} className="text-slate-500 shrink-0" />
          <span className="text-[10px] text-slate-400 font-mono truncate flex-1 select-all">{BUILDER_URL}</span>
        </div>
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
