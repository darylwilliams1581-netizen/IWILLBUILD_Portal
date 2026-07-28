/**
 * SystemAITab — Owner-only System AI panel inside Owner Console.
 *
 * Sections:
 *  1. AI Key & Model Configuration
 *  2. Dazza Console (chat)
 *  3. Annette Health Check
 *  4. Built-in Fallback Checks (no API key required)
 *  5. Company Analysis Selector
 *  6. Usage / Cost Visibility
 *  7. Prompt / Test Panel
 *  8. Module Inventory
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot, Activity, Cpu, Building2, BarChart3, FlaskConical,
  Key, CheckCircle2, XCircle, Loader2, Send, RefreshCw,
  AlertTriangle, ShieldCheck, Database, FileText, Truck,
  Users, ClipboardList, Receipt, ChevronDown, ChevronUp,
  Zap, Info, Settings2, Eye,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company {
  id: number;
  name: string;
  totalUsers: number;
}

interface BuiltinCheck {
  label: string;
  status: 'ok' | 'warn' | 'error' | 'info';
  detail: string;
}

interface BuiltinReport {
  companyId: number;
  companyName: string;
  checks: BuiltinCheck[];
  score: number;
  generatedAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BuiltinCheck['status'] }) {
  const map = {
    ok:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn:  'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    info:  'bg-blue-50 text-blue-700 border-blue-200',
  };
  const icons = {
    ok:    <CheckCircle2 size={12} />,
    warn:  <AlertTriangle size={12} />,
    error: <XCircle size={12} />,
    info:  <Info size={12} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${map[status]}`}>
      {icons[status]}
      {status.toUpperCase()}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-primary" />
        </div>
        <span className="font-bold text-slate-800 flex-1 text-left text-sm">{title}</span>
        {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

// ── AI Key Config ─────────────────────────────────────────────────────────────

function AIKeyConfig() {
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dazza/key-status', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { configured: boolean } | null) => { if (d) setKeyStatus(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SectionCard title="AI Key & Model Configuration" icon={Key}>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
          <Loader2 size={14} className="animate-spin" /> Checking key status…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className={`flex items-start gap-4 p-4 rounded-xl border ${keyStatus?.configured ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className={`p-2 rounded-xl shrink-0 ${keyStatus?.configured ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              <Key size={15} className={keyStatus?.configured ? 'text-emerald-600' : 'text-amber-600'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${keyStatus?.configured ? 'text-emerald-800' : 'text-amber-800'}`}>
                OpenAI API Key: {keyStatus?.configured ? 'Configured ✓' : 'Not configured'}
              </p>
              <p className={`text-xs mt-0.5 leading-relaxed ${keyStatus?.configured ? 'text-emerald-700' : 'text-amber-700'}`}>
                {keyStatus?.configured
                  ? 'Dazza and Annette can use full AI capabilities including GPT-4o analysis.'
                  : 'Without a key, System AI runs built-in checks only. Add OPENAI_API_KEY via Settings → Secrets to unlock full AI.'}
              </p>
            </div>
            {keyStatus?.configured
              ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              : <XCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            }
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Built-in only', desc: 'No API key needed. Module inventory, data quality, health scores.', icon: Cpu },
              { label: 'Low-cost model', desc: 'GPT-4o-mini. Fast, cheap, good for routine analysis.', icon: Zap },
              { label: 'Pro model', desc: 'GPT-4o. Deep analysis, Annette health checks, complex queries.', icon: Bot },
            ].map(({ label, desc, icon: Icon }) => (
              <div key={label} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-primary" />
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 flex items-start gap-2">
              <ShieldCheck size={13} className="text-emerald-500 shrink-0 mt-0.5" />
              API keys are stored server-side only and never exposed to the browser. All AI calls are made from the server.
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Built-in Fallback Checks ──────────────────────────────────────────────────

function BuiltinChecks({ companies }: { companies: Company[] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | ''>('');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<BuiltinReport | null>(null);
  const [error, setError] = useState('');

  const runChecks = useCallback(async () => {
    if (!selectedCompanyId) return;
    setRunning(true);
    setError('');
    setReport(null);
    try {
      const res = await fetch('/api/owner-console/system-ai/builtin-checks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });
      const d = await res.json() as BuiltinReport | { error: string };
      if (!res.ok) { setError((d as { error: string }).error ?? 'Check failed'); return; }
      setReport(d as BuiltinReport);
    } catch {
      setError('Network error running checks');
    } finally {
      setRunning(false);
    }
  }, [selectedCompanyId]);

  const scoreColor = (s: number) =>
    s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <SectionCard title="Built-in Fallback Checks" icon={ShieldCheck}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          Runs without an AI key. Checks module inventory, missing data, overdue items, storage usage, template gaps, and company health score.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value ? parseInt(e.target.value) : '')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white min-w-[200px]"
          >
            <option value="">Select company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={runChecks}
            disabled={!selectedCompanyId || running}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Run Checks
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle size={14} /> {error}
          </div>
        )}

        {report && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800 text-sm">{report.companyName}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Health score:</span>
                <span className={`text-2xl font-black ${scoreColor(report.score)}`}>{report.score}</span>
                <span className="text-xs text-slate-400">/100</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {report.checks.map((check, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <StatusBadge status={check.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{check.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">Generated {new Date(report.generatedAt).toLocaleString('en-AU')}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Dazza Console ─────────────────────────────────────────────────────────────

function DazzaConsole({ companies }: { companies: Company[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setSending(true);
    try {
      const res = await fetch('/api/dazza/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          supportCompanyId: selectedCompanyId,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${d.error ?? 'Error'}` }]);
        return;
      }
      // Stream SSE
      const reader = res.body?.getReader();
      if (!reader) return;
      let reply = '';
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data) as { content?: string };
              if (parsed.content) {
                reply += parsed.content;
                setMessages((m) => {
                  const updated = [...m];
                  updated[updated.length - 1] = { role: 'assistant', content: reply };
                  return updated;
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ Network error' }]);
    } finally {
      setSending(false);
    }
  }, [input, messages, sending, selectedCompanyId]);

  return (
    <SectionCard title="Dazza Console" icon={Bot}>
      <div className="flex flex-col gap-3">
        {/* Company selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-semibold text-slate-500 shrink-0">Analyse company:</label>
          <select
            value={selectedCompanyId ?? ''}
            onChange={(e) => setSelectedCompanyId(e.target.value ? parseInt(e.target.value) : null)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="">Own company (default)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Chat window */}
        <div className="border border-slate-200 rounded-xl bg-slate-50 h-72 overflow-y-auto p-3 flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="text-xs text-slate-400 text-center mt-8">
              Ask Dazza anything about the selected company's data.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary text-white'
                  : 'bg-white border border-slate-200 text-slate-700'
              }`}>
                {m.content || (sending && m.role === 'assistant' ? <Loader2 size={12} className="animate-spin inline" /> : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Ask Dazza about this company's data…"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>

        {/* Quick prompts */}
        <div className="flex flex-wrap gap-1.5">
          {[
            'What needs attention today?',
            'How many active jobs?',
            'Any fleet service overdue?',
            'Show overdue to-dos',
            'Jobs with no progress recorded',
            'Forms incomplete?',
          ].map((p) => (
            <button
              key={p}
              onClick={() => setInput(p)}
              className="text-[11px] bg-slate-100 hover:bg-violet-50 hover:text-primary border border-slate-200 text-slate-600 rounded-full px-2.5 py-1 transition-colors font-medium"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// ── Annette Health Check ──────────────────────────────────────────────────────

function AnnettePanel({ companies }: { companies: Company[] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    setRunning(true);
    setReport('');
    setError('');
    try {
      const res = await fetch('/api/dazza/annette', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportCompanyId: selectedCompanyId }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Annette check failed');
        return;
      }
      // Stream SSE
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data) as { content?: string };
              if (parsed.content) {
                text += parsed.content;
                setReport(text);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setError('Network error running Annette');
    } finally {
      setRunning(false);
    }
  }, [selectedCompanyId]);

  // Simple markdown-ish renderer
  function renderReport(text: string) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) return <h3 key={i} className="font-black text-slate-800 text-sm mt-4 mb-1">{line.slice(3)}</h3>;
      if (line.startsWith('# '))  return <h2 key={i} className="font-black text-slate-900 text-base mt-4 mb-1">{line.slice(2)}</h2>;
      if (line.startsWith('- ') || line.startsWith('• ')) return <li key={i} className="text-xs text-slate-700 ml-4 list-disc">{line.slice(2)}</li>;
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="text-xs font-bold text-slate-800">{line.slice(2, -2)}</p>;
      if (!line.trim()) return <div key={i} className="h-2" />;
      return <p key={i} className="text-xs text-slate-700 leading-relaxed">{line}</p>;
    });
  }

  return (
    <SectionCard title="Annette Health Check" icon={Activity}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          Deep structured health-check across all portal data — jobs, fleet, forms, estimates, to-dos, and files. Requires OpenAI API key for full analysis.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedCompanyId ?? ''}
            onChange={(e) => setSelectedCompanyId(e.target.value ? parseInt(e.target.value) : null)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white min-w-[200px]"
          >
            <option value="">Own company (default)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
            {running ? 'Running Annette…' : 'Run Annette Health Check'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle size={14} /> {error}
          </div>
        )}

        {report && (
          <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 max-h-96 overflow-y-auto">
            <div className="flex flex-col gap-0.5">{renderReport(report)}</div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Module Inventory ──────────────────────────────────────────────────────────

const MODULES = [
  { label: 'Projects / Jobs',   icon: FileText,     route: '/jobs' },
  { label: 'Scheduler',         icon: ClipboardList, route: '/scheduler' },
  { label: 'Fleet',             icon: Truck,         route: '/fleet' },
  { label: 'Safety',            icon: ShieldCheck,   route: '/safety' },
  { label: 'Forms',             icon: ClipboardList, route: '/forms' },
  { label: 'Files',             icon: Database,      route: '/files' },
  { label: 'Estimating',        icon: Receipt,       route: '/estimating' },
  { label: 'Invoices / Ledger', icon: Receipt,       route: '/invoices' },
  { label: 'Stakeholders',      icon: Users,         route: '/customers' },
  { label: 'Team',              icon: Users,         route: '/team' },
  { label: 'Settings',          icon: Settings2,     route: '/settings' },
  { label: 'Billing',           icon: Receipt,       route: '/billing' },
  { label: 'Owner Console',     icon: Eye,           route: '/owner-console' },
];

function ModuleInventory() {
  return (
    <SectionCard title="Module Inventory" icon={Cpu} defaultOpen={false}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {MODULES.map(({ label, icon: Icon, route }) => (
          <div key={route} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon size={13} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{label}</p>
              <p className="text-[10px] text-slate-500 font-mono">{route}</p>
            </div>
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Prompt / Test Panel ───────────────────────────────────────────────────────

function PromptTestPanel({ companies }: { companies: Company[] }) {
  const [prompt, setPrompt] = useState('');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setResult('');
    setError('');
    try {
      const res = await fetch('/api/dazza/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          supportCompanyId: companyId,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Error');
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data) as { content?: string };
              if (parsed.content) { text += parsed.content; setResult(text); }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setError('Network error');
    } finally {
      setRunning(false);
    }
  }, [prompt, companyId]);

  return (
    <SectionCard title="Prompt / Test Panel" icon={FlaskConical} defaultOpen={false}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500">Test any prompt against the Dazza engine with full context for a selected company.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={companyId ?? ''}
            onChange={(e) => setCompanyId(e.target.value ? parseInt(e.target.value) : null)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="">Own company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Enter a test prompt…"
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
        <button
          onClick={run}
          disabled={!prompt.trim() || running}
          className="self-start flex items-center gap-2 px-4 py-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Run Prompt
        </button>
        {error && <p className="text-xs text-red-600 flex items-center gap-1"><XCircle size={12} />{error}</p>}
        {result && (
          <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
            {result}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Usage / Cost Visibility ───────────────────────────────────────────────────

function UsagePanel() {
  return (
    <SectionCard title="Usage & Cost Visibility" icon={BarChart3} defaultOpen={false}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500">
          AI usage tracking is logged server-side via the Dazza audit log. View the Activity Log tab for a full record of AI calls, modules accessed, and company data reads.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Audit logging', detail: 'Every AI call is logged with user, company, modules accessed, and whether dollar data was included.', icon: ShieldCheck },
            { label: 'Company isolation', detail: 'Each AI session is scoped to a single company. Cross-company data access is blocked at the API layer.', icon: Building2 },
            { label: 'Cost control', detail: 'Set monthly usage limits via OPENAI_API_KEY quota in your OpenAI dashboard. No per-user billing.', icon: BarChart3 },
          ].map(({ label, detail, icon: Icon }) => (
            <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-primary" />
                <span className="text-xs font-bold text-slate-700">{label}</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SystemAITab({ companies }: { companies: Company[] }) {
  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1A1D23] to-slate-800 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Bot size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-white text-lg leading-tight">System AI</p>
          <p className="text-sm text-white/60 mt-0.5">
            Owner-only. Dazza console, Annette health checks, data quality scans, and platform analysis tools.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5 shrink-0">
          <ShieldCheck size={12} className="text-emerald-400" />
          <span className="text-[11px] font-bold text-white/80">Owner only</span>
        </div>
      </div>

      <AIKeyConfig />
      <BuiltinChecks companies={companies} />
      <DazzaConsole companies={companies} />
      <AnnettePanel companies={companies} />
      <ModuleInventory />
      <PromptTestPanel companies={companies} />
      <UsagePanel />
    </div>
  );
}
