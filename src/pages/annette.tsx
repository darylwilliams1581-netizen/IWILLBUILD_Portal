/**
 * Annette Protocol v1 — Structured health-check report page.
 * Accessible to any user with Dazza AI permission.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Activity,
  Play,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
  Clock,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';

// ── Markdown-lite renderer ────────────────────────────────────────────────────
// Renders the Annette report (headings, bullets, bold) without a full MD lib.
function renderReport(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H2 heading
    if (line.startsWith('## ')) {
      const content = line.slice(3);
      const emoji = content.slice(0, 8).match(/^([\u{1F300}-\u{1FFFF}]|[\u2600-\u27BF]|\u{1F004}|\u{1F0CF})/u)?.[0] ?? '';
      const rest = emoji ? content.slice(emoji.length).trim() : content;
      nodes.push(
        <div key={key++} className="flex items-center gap-2 mt-6 mb-2 pb-2 border-b border-slate-200">
          {emoji && <span className="text-lg leading-none">{emoji}</span>}
          <h2 className="font-heading font-black text-sm text-slate-800 uppercase tracking-wider">{rest}</h2>
        </div>
      );
      continue;
    }

    // H3 heading
    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={key++} className="font-bold text-sm text-slate-700 mt-3 mb-1">{line.slice(4)}</h3>
      );
      continue;
    }

    // Bullet
    if (line.startsWith('- ') || line.startsWith('• ')) {
      const content = line.slice(2);
      nodes.push(
        <div key={key++} className="flex items-start gap-2 py-0.5 pl-1">
          <span className="text-primary mt-1.5 shrink-0 text-[8px]">●</span>
          <span className="text-sm text-slate-700 leading-relaxed">{renderInline(content)}</span>
        </div>
      );
      continue;
    }

    // Indented bullet (sub-item)
    if (line.startsWith('  - ') || line.startsWith('  • ')) {
      const content = line.slice(4);
      nodes.push(
        <div key={key++} className="flex items-start gap-2 py-0.5 pl-6">
          <span className="text-slate-400 mt-1.5 shrink-0 text-[8px]">○</span>
          <span className="text-sm text-slate-600 leading-relaxed">{renderInline(content)}</span>
        </div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      nodes.push(<div key={key++} className="h-1" />);
      continue;
    }

    // Normal paragraph
    nodes.push(
      <p key={key++} className="text-sm text-slate-700 leading-relaxed">{renderInline(line)}</p>
    );
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text** — cap length before splitting to prevent regex DoS.
  const safe = text.length > 5_000 ? text.slice(0, 5_000) : text;
  const parts = safe.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return safe;
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-slate-800">{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </>
  );
}



// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnnettePage() {
  const { can, loading: permsLoading, me } = usePermissions();

  // Support mode: fetch supportCompanyId from the server context (same as dazza-ai.tsx).
  // me?.profile does NOT have a supportCompanyId field — it must come from the server.
  const [supportCompanyId, setSupportCompanyId] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/dazza/context', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { supportCompanyId?: number | null } | null) => {
        setSupportCompanyId(d?.supportCompanyId ?? null);
      })
      .catch(() => { /* non-critical */ });
  }, []);

  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [reportText, setReportText] = useState('');
  const [runAt, setRunAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const runAnnette = useCallback(async () => {
    setStatus('running');
    setReportText('');
    setWarnings([]);
    setRunAt(null);

    try {
      const res = await fetch('/api/dazza/annette', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportCompanyId }),
      });

      if (!res.ok || !res.body) {
        const d = await res.json() as { error?: string };
        setReportText(`⚠️ Error: ${d.error ?? 'Failed to start Dazza Health Check'}`);
        setStatus('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as {
              text?: string;
              done?: boolean;
              warnings?: string[];
              error?: boolean;
            };
            if (parsed.text) {
              fullText += parsed.text;
              setReportText(fullText);
            }
            if (parsed.done) {
              setWarnings(parsed.warnings ?? []);
              setRunAt(new Date().toLocaleString('en-AU', {
                weekday: 'short', day: 'numeric', month: 'short',
                year: 'numeric', hour: '2-digit', minute: '2-digit',
              }));
              setStatus(parsed.error ? 'error' : 'done');
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setReportText(`⚠️ Network error: ${e instanceof Error ? e.message : String(e)}`);
      setStatus('error');
    }
  }, [supportCompanyId]);

  async function copyReport() {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canDazza = !permsLoading && can('dazzaAi');

  return (
    <>
      <Helmet>
        <title>Dazza Health Check — IWILLBUILD</title>
        <meta name="description" content="Dazza Health Check — structured company health check across jobs, fleet, forms, estimates and to-dos." />
        <link rel="canonical" href="https://iwillbuild.com/annette" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="portal-page">
        <PortalSidebar />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">

            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-sm">
                  <Activity size={18} className="text-white" />
                </div>
                <div>
                  <h1 className="font-heading font-black text-xl text-slate-900">Dazza Health Check</h1>
                  <p className="text-xs text-slate-500">v1 — Company health check</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mt-3">
                Dazza Health Check analyses your live portal data and produces a prioritised action report — urgent items, things needing attention, missing information, and suggested next steps.
              </p>
            </div>

            {/* Permission gate */}
            {!permsLoading && !canDazza && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
                <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-amber-800">Dazza AI access required</p>
                  <p className="text-xs text-amber-700 mt-1">Ask your admin to enable Dazza AI for your account to use Dazza Health Check.</p>
                </div>
              </div>
            )}

            {canDazza && (
              <>
                {/* Run card */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-bold text-sm text-slate-800">Run health check</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Analyses jobs, to-dos, fleet, estimates, and forms. Takes 10–20 seconds.
                      </p>
                      {runAt && (
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <Clock size={10} />
                          Last run: {runAt}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={runAnnette}
                      disabled={status === 'running'}
                      className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shrink-0"
                    >
                      {status === 'running' ? (
                        <><Loader2 size={14} className="animate-spin" />Running…</>
                      ) : status === 'done' ? (
                        <><RefreshCw size={14} />Run again</>
                      ) : (
                        <><Play size={14} />Run Health Check</>
                      )}
                    </button>
                  </div>

                  {/* Progress bar */}
                  {status === 'running' && (
                    <div className="mt-4">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full animate-pulse w-3/4" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">Analysing portal data…</p>
                    </div>
                  )}
                </div>

                {/* Streaming report */}
                {(status === 'running' || status === 'done' || status === 'error') && reportText && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {/* Report toolbar */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                      <div className="flex items-center gap-2">
                        {status === 'done' && <CheckCircle2 size={13} className="text-emerald-500" />}
                        {status === 'running' && <Loader2 size={13} className="text-violet-500 animate-spin" />}
                        {status === 'error' && <AlertTriangle size={13} className="text-red-500" />}
                        <span className="text-xs font-semibold text-slate-600">
                          {status === 'running' ? 'Generating report…' : status === 'error' ? 'Report completed with errors' : 'Report complete'}
                        </span>
                      </div>
                      {status === 'done' && (
                        <button
                          onClick={copyReport}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
                        >
                          {copied ? <><Check size={11} className="text-emerald-500" />Copied</> : <><Copy size={11} />Copy</>}
                        </button>
                      )}
                    </div>

                    {/* Report body */}
                    <div ref={reportRef} className="px-5 py-4 flex flex-col gap-0.5">
                      {renderReport(reportText)}
                      {status === 'running' && (
                        <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse rounded-sm ml-0.5" />
                      )}
                    </div>

                    {/* Warnings */}
                    {warnings.length > 0 && (
                      <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-1.5">
                          <Info size={11} />
                          {warnings.length} module{warnings.length > 1 ? 's' : ''} failed to load
                        </p>
                        {warnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-600 font-mono">{w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Idle state */}
                {status === 'idle' && (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
                    <Activity size={28} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">No report yet</p>
                    <p className="text-xs text-slate-400 mt-1">Click "Run Health Check" to analyse your company data.</p>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
                  <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Dazza Health Check reports are based on data currently in your IWILLBUILD portal. For WHS, building code, or legal compliance matters, always verify with a competent person or the current official standard. Dazza Health Check does not provide legal or professional advice.
                  </p>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
