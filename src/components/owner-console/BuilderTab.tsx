/**
 * BuilderTab — Owner Console tab (Platform Owner ONLY)
 * Opens GoDaddy SSO login in a new tab — no iframe attempt.
 */
import {
  Code2, ExternalLink, ShieldCheck, Lock, MonitorSmartphone, ArrowUpRight,
} from 'lucide-react';

const GODADDY_LOGIN_URL = 'https://sso.godaddy.com/?realm=idp';
const BUILDER_URL       = 'https://airo-builder.godaddy.com/develop/f38wenbvln?siteId=f38wenbvln';

export default function BuilderTab() {
  return (
    <div className="flex flex-col h-full bg-slate-950">

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
        {/* Single action — open GoDaddy login in new tab */}
        <a
          href={GODADDY_LOGIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
        >
          <ExternalLink size={12} />
          Open GoDaddy
        </a>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 text-center">

        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <ShieldCheck size={36} className="text-violet-400" />
        </div>

        {/* Heading */}
        <div className="max-w-md">
          <p className="text-lg font-black text-slate-100 mb-2">GoDaddy Builder Access</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            Sign in with your GoDaddy account, then navigate to the builder.
            Both links open in a new tab.
          </p>
        </div>

        {/* Two step buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
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
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-4 max-w-md w-full text-left">
          <p className="text-xs font-bold text-slate-300 mb-1.5">Workflow tip</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Keep the builder pinned in a separate tab. Copy the{' '}
            <span className="text-violet-400 font-semibold">Airo Prompt</span> from
            the Bug Reports tab and paste it directly into the builder chat to apply fixes.
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
          IWIllBUIlD · App ID: f38wenbvln · Platform owner only
        </span>
        <span className="text-[10px] text-slate-600">
          GoDaddy credentials required · Changes deploy to iwillbuild.com
        </span>
      </div>
    </div>
  );
}
