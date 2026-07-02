import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Bot, Send, User, HardHat, Truck, BarChart2,
  RefreshCw, Calculator, Wrench, AlertTriangle,
  CheckSquare, DollarSign, MessageSquare, ChevronDown, ChevronUp,
  Loader2, Download, ClipboardList, TrendingUp, Info, ShieldAlert,
  Brain, Bug, Copy, Check, X,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';
import {
  calcPier, calcSlab, calcPit, calcTrench, calcGstAdd, calcGstRemove,
  calcFall, calcFallFromGrade, calcSimple,
} from '@/lib/dazza-calcs';
import DazzaBrainStatus from '@/components/DazzaBrainStatus';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system-info';
  content: string;
  timestamp: Date;
  isCalc?: boolean;
}

// Lightweight summary returned by GET /api/dazza/context (for the right panel)
interface DazzaContextSummary {
  user?: { name: string; email: string; role: string };
  permissions?: {
    canJobs: boolean; canFleet: boolean; canForms: boolean;
    canEstimating: boolean; canFiles: boolean; seeDollars: boolean; isAdmin: boolean;
  };
  companyName?: string;
  supportMode?: boolean;
  supportCompanyId?: number | null;
  jobs?: unknown[];
  openTodos?: unknown[];
  fleet?: unknown[];
  fleetFlags?: unknown[];
  estimates?: unknown[];
  formTemplates?: unknown[];
  formSubmissions?: unknown[];
  files?: unknown[];
}

// ── Quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: AlertTriangle, label: 'What needs attention?',  prompt: 'Run a full data health check. What needs attention across jobs, fleet, forms, and estimates right now?' },
  { icon: HardHat,       label: 'Summarise active jobs',  prompt: 'Give me a summary of all active jobs and their current progress.' },
  { icon: Truck,         label: 'Fleet issues',           prompt: 'Which fleet assets need attention right now? List any issues, overdue services, or rego due soon.' },
  { icon: ClipboardList, label: 'Incomplete forms',       prompt: 'Which jobs have incomplete or draft forms? List them with the job name and form name.' },
  { icon: BarChart2,     label: 'Estimate review',        prompt: 'Review estimates on active jobs. Flag any that are missing approved values or still in draft.' },
  { icon: CheckSquare,   label: 'Open to-dos',            prompt: 'List all open to-dos across all jobs. Group by job and highlight any that are overdue.' },
  { icon: MessageSquare, label: 'Write client SMS',       prompt: 'Help me draft a professional SMS to send to a client about their job progress. Ask me for the job name and what to say.' },
  { icon: TrendingUp,    label: 'Job progress overview',  prompt: 'Give me a progress overview of all active jobs. Which are on track and which need attention?' },
];

// ── Calculator definitions ────────────────────────────────────────────────────

type CalcField = { key: string; label: string; placeholder: string; unit?: string };

interface CalcDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  fields: CalcField[];
  run: (vals: Record<string, number>) => { value: number; unit: string; label: string; detail?: string } | null;
}

const CALCULATORS: CalcDef[] = [
  {
    id: 'pier',
    label: 'Pier Volume',
    icon: Calculator,
    fields: [
      { key: 'diam', label: 'Diameter', placeholder: '450', unit: 'mm' },
      { key: 'depth', label: 'Depth', placeholder: '1.2', unit: 'm' },
      { key: 'qty', label: 'Quantity', placeholder: '1', unit: 'pcs' },
    ],
    run: (v) => calcPier(v.diam, v.depth, v.qty || 1),
  },
  {
    id: 'slab',
    label: 'Slab Volume',
    icon: Calculator,
    fields: [
      { key: 'length', label: 'Length', placeholder: '10', unit: 'm' },
      { key: 'width', label: 'Width', placeholder: '6', unit: 'm' },
      { key: 'thick', label: 'Thickness', placeholder: '100', unit: 'mm' },
    ],
    run: (v) => calcSlab(v.length, v.width, v.thick),
  },
  {
    id: 'pit',
    label: 'Pit / Box',
    icon: Calculator,
    fields: [
      { key: 'length', label: 'Length', placeholder: '1.5', unit: 'm' },
      { key: 'width', label: 'Width', placeholder: '1.5', unit: 'm' },
      { key: 'depth', label: 'Depth', placeholder: '1.0', unit: 'm' },
    ],
    run: (v) => calcPit(v.length, v.width, v.depth),
  },
  {
    id: 'trench',
    label: 'Trench / Footing',
    icon: Calculator,
    fields: [
      { key: 'length', label: 'Length', placeholder: '20', unit: 'm' },
      { key: 'width', label: 'Width', placeholder: '0.4', unit: 'm' },
      { key: 'depth', label: 'Depth', placeholder: '0.6', unit: 'm' },
    ],
    run: (v) => calcTrench(v.length, v.width, v.depth),
  },
  {
    id: 'gst-add',
    label: 'Add GST',
    icon: DollarSign,
    fields: [{ key: 'amount', label: 'Ex-GST Amount', placeholder: '1000', unit: '$' }],
    run: (v) => calcGstAdd(v.amount),
  },
  {
    id: 'gst-remove',
    label: 'Remove GST',
    icon: DollarSign,
    fields: [{ key: 'amount', label: 'Inc-GST Amount', placeholder: '1100', unit: '$' }],
    run: (v) => calcGstRemove(v.amount),
  },
  {
    id: 'fall',
    label: 'Fall / Grade',
    icon: TrendingUp,
    fields: [
      { key: 'run', label: 'Run', placeholder: '10', unit: 'm' },
      { key: 'fall', label: 'Fall', placeholder: '100', unit: 'mm' },
    ],
    run: (v) => calcFall(v.run, v.fall),
  },
  {
    id: 'grade-fall',
    label: 'Grade → Fall',
    icon: TrendingUp,
    fields: [
      { key: 'run', label: 'Run', placeholder: '10', unit: 'm' },
      { key: 'ratio', label: 'Grade ratio (1:X)', placeholder: '100', unit: '1:X' },
    ],
    run: (v) => calcFallFromGrade(v.run, v.ratio),
  },
];

// ── Message formatter ─────────────────────────────────────────────────────────

// ── Structured answer section definitions ─────────────────────────────────────

const ANSWER_SECTIONS: Array<{
  prefix: string;
  label: string;
  icon: string;
  chipClass: string;
  borderClass: string;
  bgClass: string;
}> = [
  {
    prefix: '📋 From IWILLBUILD data:',
    label: 'From IWILLBUILD data',
    icon: '📋',
    chipClass: 'bg-blue-600 text-white',
    borderClass: 'border-blue-200',
    bgClass: 'bg-blue-50',
  },
  {
    prefix: '🧠 AI reasoning:',
    label: 'AI reasoning',
    icon: '🧠',
    chipClass: 'bg-violet-600 text-white',
    borderClass: 'border-violet-200',
    bgClass: 'bg-violet-50',
  },
  {
    prefix: '📦 Source modules:',
    label: 'Source modules',
    icon: '📦',
    chipClass: 'bg-slate-600 text-white',
    borderClass: 'border-slate-200',
    bgClass: 'bg-slate-50',
  },
  {
    prefix: '📊 Confidence:',
    label: 'Confidence',
    icon: '📊',
    chipClass: 'bg-emerald-600 text-white',
    borderClass: 'border-emerald-200',
    bgClass: 'bg-emerald-50',
  },
  {
    prefix: '💡 Suggested next action:',
    label: 'Suggested next action',
    icon: '💡',
    chipClass: 'bg-amber-500 text-white',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50',
  },
  {
    prefix: '⚠️ Verification reminder:',
    label: 'Verification reminder',
    icon: '⚠️',
    chipClass: 'bg-red-600 text-white',
    borderClass: 'border-red-200',
    bgClass: 'bg-red-50',
  },
];

// ── Inline text formatter (bold, plain) ───────────────────────────────────────

function formatInline(text: string, key: string | number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span key={key}>
      {parts.map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j} className="font-semibold text-slate-900">{part.replace(/\*\*/g, '')}</strong>
          : part
      )}
    </span>
  );
}

// ── Main message formatter ────────────────────────────────────────────────────

function formatMessage(content: string) {
  // Split into structured sections first
  type Section = { def: typeof ANSWER_SECTIONS[number]; body: string[] } | { def: null; body: string[] };
  const sections: Section[] = [];
  let currentSection: Section = { def: null, body: [] };

  for (const rawLine of content.split('\n')) {
    const line = rawLine;

    // Check if this line starts a known section
    const matchedDef = ANSWER_SECTIONS.find((s) => line.trimStart().startsWith(s.prefix));
    if (matchedDef) {
      // Save previous section
      if (currentSection.body.length > 0 || currentSection.def !== null) {
        sections.push(currentSection);
      }
      // Remainder of the line after the prefix is the first body line
      const remainder = line.trimStart().slice(matchedDef.prefix.length).trim();
      currentSection = { def: matchedDef, body: remainder ? [remainder] : [] };
    } else {
      currentSection.body.push(line);
    }
  }
  // Push last section
  if (currentSection.body.length > 0 || currentSection.def !== null) {
    sections.push(currentSection);
  }

  // If no structured sections were found, fall back to the legacy renderer
  const hasStructured = sections.some((s) => s.def !== null);
  if (!hasStructured) {
    return renderLegacyLines(content.split('\n'));
  }

  return (
    <div className="flex flex-col gap-2.5">
      {sections.map((section, si) => {
        if (section.def === null) {
          // Plain text before any section header
          const trimmed = section.body.filter((l) => l.trim() !== '');
          if (trimmed.length === 0) return null;
          return (
            <div key={si} className="flex flex-col gap-0.5">
              {renderLegacyLines(section.body)}
            </div>
          );
        }

        const { def } = section;
        const bodyText = section.body.join('\n').trim();
        if (!bodyText) return null;

        return (
          <div
            key={si}
            className={`rounded-xl border ${def.borderClass} ${def.bgClass} overflow-hidden`}
          >
            {/* Section header chip */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 ${def.bgClass}`}>
              <span className="text-xs leading-none">{def.icon}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${def.chipClass}`}>
                {def.label}
              </span>
            </div>
            {/* Section body */}
            <div className="px-3 pb-3 pt-1 text-[13px] text-slate-700 leading-relaxed flex flex-col gap-0.5">
              {renderLegacyLines(bodyText.split('\n'))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Legacy line renderer (headings, bold, plain) ──────────────────────────────

function renderLegacyLines(lines: string[]) {
  return lines.map((line, i) => {
    if (line.startsWith('## ')) {
      return <p key={i} className="font-bold text-slate-900 mt-3 mb-1 text-sm border-b border-slate-100 pb-1">{line.replace('## ', '')}</p>;
    }
    if (line.startsWith('# ')) {
      return <p key={i} className="font-bold text-slate-900 mt-2 mb-1">{line.replace('# ', '')}</p>;
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <p key={i} className="leading-relaxed flex gap-1.5">
          <span className="text-slate-400 shrink-0 mt-0.5">•</span>
          <span>{formatInline(line.replace(/^[-•]\s*/, ''), `${i}-inner`)}</span>
        </p>
      );
    }
    return (
      <p key={i} className={line.trim() === '' ? 'mt-1' : 'leading-relaxed'}>
        {formatInline(line, i)}
      </p>
    );
  });
}

// ── Calculator widget ─────────────────────────────────────────────────────────

function CalcWidget({ calc, onSendToChat }: { calc: CalcDef; onSendToChat: (msg: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ value: number; unit: string; label: string; detail?: string } | null>(null);

  function run() {
    const nums: Record<string, number> = {};
    for (const f of calc.fields) {
      const n = parseFloat(vals[f.key] ?? '');
      if (isNaN(n) || n <= 0) return;
      nums[f.key] = n;
    }
    const r = calc.run(nums);
    setResult(r);
  }

  function sendToChat() {
    if (!result) return;
    const msg = `Calculator result — ${result.label}: **${result.value} ${result.unit}**${result.detail ? `. ${result.detail}` : ''}`;
    onSendToChat(msg);
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <calc.icon size={13} className="text-primary shrink-0" />
        <span className="text-xs font-bold text-slate-700">{calc.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {calc.fields.map((f) => (
          <div key={f.key}>
            <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">{f.label} {f.unit && <span className="text-slate-300">({f.unit})</span>}</label>
            <input
              type="number"
              value={vals[f.key] ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 bg-white"
            />
          </div>
        ))}
      </div>
      <button
        onClick={run}
        className="w-full bg-primary hover:bg-orange-600 text-white text-xs font-bold py-1.5 rounded-lg transition-colors"
      >
        Calculate
      </button>
      {result && (
        <div className="bg-white border border-primary/20 rounded-lg p-2.5">
          <div className="text-base font-black text-primary">{result.value} <span className="text-sm font-bold">{result.unit}</span></div>
          <div className="text-[10px] text-slate-500 mt-0.5">{result.label}</div>
          {result.detail && <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">{result.detail}</div>}
          <button
            onClick={sendToChat}
            className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-orange-700 transition-colors"
          >
            <Send size={9} /> Send to chat
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const WELCOME_MSG = `Hi, I'm Dazza AI — your IWILLBUILD helper.

I'm young and still learning. The more real data you add to IWILLBUILD, the more useful I become.

I can help summarise jobs, check fleet issues, review forms, look at estimates, find missing information, help with construction calculators, and draft simple wording.

**Always verify important building, safety, legal and compliance decisions with a competent person.**

What do you need today?`;

export default function DazzaAIPage() {
  const { me, isAdmin, platformRole } = usePermissions();
  const isDeveloper = platformRole === 'developer';
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'assistant', content: WELCOME_MSG, timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [dazzaCtx, setDazzaCtx] = useState<DazzaContextSummary | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [noApiKey, setNoApiKey] = useState(false);
  const [showCalcs, setShowCalcs] = useState(false);
  const [activeCalc, setActiveCalc] = useState<string | null>(null);
  const [simpleExpr, setSimpleExpr] = useState('');
  const [simpleResult, setSimpleResult] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'chat' | 'brain'>('chat');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Bug Fix Mode (Developer only) ─────────────────────────────────────────
  type BugFixStep = 'idle' | 'page' | 'clicked' | 'happened' | 'expected' | 'role' | 'error' | 'done';
  interface BugReport {
    page: string;
    clicked: string;
    happened: string;
    expected: string;
    role: string;
    error: string;
  }
  const [bugStep, setBugStep] = useState<BugFixStep>('idle');
  const [bugReport, setBugReport] = useState<Partial<BugReport>>({});
  const [bugInput, setBugInput] = useState('');
  const [bugCopied, setBugCopied] = useState(false);

  // Load Dazza context summary on mount (for right panel display only)
  const loadContext = useCallback(async () => {
    setCtxLoading(true);
    try {
      const [ctxRes, keyRes] = await Promise.all([
        fetch('/api/dazza/context', { credentials: 'include' }),
        fetch('/api/dazza/key-status', { credentials: 'include' }),
      ]);
      if (ctxRes.ok) {
        const data = await ctxRes.json() as DazzaContextSummary;
        setDazzaCtx(data);
      }
      if (keyRes.ok) {
        const keyData = await keyRes.json() as { configured: boolean };
        // Only show the banner if key is NOT configured
        setNoApiKey(!keyData.configured);
      }
    } catch {
      // silent — right panel will show zeros
    } finally {
      setCtxLoading(false);
    }
  }, []);
  useEffect(() => { void loadContext(); }, [loadContext]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  async function sendMessage(text: string) {
    if (!text.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const chatHistory = [...messages, userMsg]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // NOTE: We send messages only — NO context payload.
      // The server re-fetches context from the session on every request.
      const res = await fetch('/api/dazza/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          // Support mode: pass supportCompanyId if active (owner only)
          supportCompanyId: dazzaCtx?.supportCompanyId ?? null,
        }),
      });

      if (!res.ok) {
        // Try to get a meaningful error from the server response
        let serverDetail = '';
        try {
          const errData = await res.json() as { error?: string; detail?: string };
          serverDetail = errData.detail ?? errData.error ?? '';
        } catch { /* ignore parse error */ }
        throw new Error(`HTTP ${res.status}${serverDetail ? `: ${serverDetail}` : ''}`);
      }

      const data = await res.json() as {
        reply: string;
        noApiKey?: boolean;
        localTool?: boolean;
        contextDebug?: string;
        supportMode?: boolean;
        supportCompanyName?: string;
        tokens?: number;
      };

      if (data.noApiKey) {
        setNoApiKey(true);
      } else {
        // Key is working — clear the banner if it was showing
        setNoApiKey(false);
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        isCalc: data.localTool,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Admin/owner debug line — append as system-info message
      if (data.contextDebug) {
        setMessages((prev) => [...prev, {
          id: (Date.now() + 2).toString(),
          role: 'system-info',
          content: data.contextDebug!,
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      const errMsg = String((err as Error)?.message ?? err);
      // Only show "trouble connecting" for genuine network failures (TypeError = fetch failed)
      const isNetworkError = err instanceof TypeError;
      const displayMsg = isNetworkError
        ? "I had trouble connecting. Please check your internet connection and try again."
        : `Something went wrong on the server (${errMsg}). Please try again or contact support if this persists.`;
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: displayMsg,
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function clearChat() {
    setMessages([{ id: Date.now().toString(), role: 'assistant', content: WELCOME_MSG, timestamp: new Date() }]);
    setNoApiKey(false);
  }

  function runSimple() {
    const r = calcSimple(simpleExpr);
    setSimpleResult(r ? `= ${r.value}` : 'Invalid expression');
  }

  function exportChat() {
    const lines = messages.map((m) =>
      `[${m.timestamp.toLocaleTimeString('en-AU')}] ${m.role === 'user' ? (me?.user?.name ?? 'You') : 'Dazza'}:\n${m.content}`
    );
    const blob = new Blob([lines.join('\n\n---\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dazza-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Bug Fix Mode helpers ───────────────────────────────────────────────────

  function startBugFix() {
    setBugStep('page');
    setBugReport({});
    setBugInput('');
  }

  function cancelBugFix() {
    setBugStep('idle');
    setBugReport({});
    setBugInput('');
  }

  const BUG_STEP_PROMPTS: Record<string, string> = {
    page:     '1 of 6 — Which page or module did this happen on? (e.g. Fleet, Job Detail, Settings → Team)',
    clicked:  '2 of 6 — What did you click or do? (e.g. "Clicked Save on the fleet asset form")',
    happened: '3 of 6 — What actually happened? (e.g. "Page went blank", "Got a 401 error", "Nothing happened")',
    expected: '4 of 6 — What should have happened?',
    role:     '5 of 6 — What user role and company was this on? (e.g. "Owner, ACME Constructions")',
    error:    '6 of 6 — Any error message, console output, or screenshot description? (type "none" to skip)',
  };

  const BUG_STEP_ORDER: BugFixStep[] = ['page', 'clicked', 'happened', 'expected', 'role', 'error', 'done'];

  function advanceBugStep(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    const updated = { ...bugReport };
    if (bugStep === 'page')     updated.page     = trimmed;
    if (bugStep === 'clicked')  updated.clicked  = trimmed;
    if (bugStep === 'happened') updated.happened = trimmed;
    if (bugStep === 'expected') updated.expected = trimmed;
    if (bugStep === 'role')     updated.role     = trimmed;
    if (bugStep === 'error')    updated.error    = trimmed === 'none' ? 'None provided' : trimmed;

    setBugReport(updated);
    setBugInput('');

    const currentIdx = BUG_STEP_ORDER.indexOf(bugStep);
    const nextStep = BUG_STEP_ORDER[currentIdx + 1];
    setBugStep(nextStep ?? 'done');

    if (nextStep === 'done') {
      // Build the full report and send to Dazza
      const r = updated as BugReport;
      const prompt = `[BUG FIX REQUEST — DEVELOPER MODE]

Page/Module: ${r.page}
What was clicked: ${r.clicked}
What happened: ${r.happened}
What should have happened: ${r.expected}
User role/company: ${r.role}
Error or screenshot: ${r.error}

Analyse this bug report and respond with EXACTLY this format:

**Likely cause:**
[Your analysis here]

**Priority:** Critical / High / Medium / Low
[Brief reason]

**Files likely involved:**
- [file1]
- [file2]
- [file3]

**Airo prompt:**
\`\`\`
[A clean, copy-paste ready prompt that a developer can paste into Airo to fix this bug. Be specific about the file, the problem, and the fix. Do not include secrets or database credentials.]
\`\`\`

**Test steps after fix:**
- [step 1]
- [step 2]
- [step 3]

**Publish risk:** Safe / Needs caution / Do not publish yet
[Brief reason]

**Additional notes:**
[Any logs needed, edge cases, or caveats. If more information is needed to diagnose, say so here.]

Rules: Do not pretend you changed any code. Do not expose secrets. Prefer small targeted fixes over large refactors. Only suggest database changes if truly necessary.`;

      void sendMessage(prompt);
      setTimeout(() => setBugStep('idle'), 500);
    }
  }

  function copyBugPrompt() {
    if (!messages.length) return;
    // Find the last assistant message that contains "Airo prompt:"
    const last = [...messages].reverse().find(
      (m) => m.role === 'assistant' && m.content.includes('Airo prompt:')
    );
    if (!last) return;
    // Extract the code block content
    const match = last.content.match(/```[\s\S]*?```/);
    const toCopy = match ? match[0].replace(/```/g, '').trim() : last.content;
    void navigator.clipboard.writeText(toCopy).then(() => {
      setBugCopied(true);
      setTimeout(() => setBugCopied(false), 2000);
    });
  }

  const perms = dazzaCtx?.permissions;
  const supportMode = dazzaCtx?.supportMode ?? false;

  return (
    <div className="portal-page">
      <Helmet>
        <title>Dazza AI — IWILLBUILD Portal</title>
        <meta name="description" content="Ask Dazza AI about your jobs, fleet, estimates and data health in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/dazza-ai" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Dazza AI — IWILLBUILD Portal" />
        <meta property="og:description" content="Ask Dazza AI about your jobs, fleet, estimates and data health in the IWILLBUILD portal." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/dazza-ai" />
        <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Dazza AI — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Ask Dazza AI about your jobs, fleet, estimates and data health in the IWILLBUILD portal." />
        <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top bar ── */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-sm leading-none">Dazza AI</h1>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                {ctxLoading ? 'Loading context…' : `${dazzaCtx?.companyName ?? 'IWILLBUILD'} · ${dazzaCtx?.user?.role ?? ''}`}
              </p>
            </div>
            <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
              Online
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all ${
                    activeTab === 'chat'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Bot size={12} /> Chat
                </button>
                <button
                  onClick={() => setActiveTab('brain')}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all ${
                    activeTab === 'brain'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Brain size={12} /> Brain
                </button>
              </div>
            )}
            <button
              onClick={exportChat}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 font-semibold transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-50"
              title="Export chat"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 font-semibold transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-50"
            >
              <RefreshCw size={13} />
              <span className="hidden sm:inline">New chat</span>
            </button>
          </div>
        </header>

        {/* ── No API key banner ── */}
        {noApiKey && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-800 shrink-0">
            <Info size={13} className="shrink-0 text-amber-600" />
            <span>
              <strong>OpenAI API key not configured.</strong> Dazza needs an API key to answer questions.
              {isAdmin && <> Go to <strong>Settings → Dazza AI</strong> to add your key.</>}
            </span>
          </div>
        )}

        {/* ── Support Mode banner ── */}
        {supportMode && (
          <div className="bg-violet-50 border-b border-violet-200 px-4 py-2.5 flex items-center gap-2 text-xs text-violet-800 shrink-0">
            <ShieldAlert size={13} className="shrink-0 text-violet-600" />
            <span>
              <strong>Support Mode:</strong> Dazza is answering from <strong>{dazzaCtx?.companyName}</strong> — not your own company. Data is isolated to this company only.
            </span>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* ── Brain Status tab ── */}
          {activeTab === 'brain' && isAdmin && (
            <div className="flex-1 overflow-y-auto bg-slate-50">
              <DazzaBrainStatus supportCompanyId={dazzaCtx?.supportCompanyId} />
            </div>
          )}

          {/* ── Main chat column + right panel ── */}
          {activeTab === 'chat' && (
          <>
          <div className="portal-main">

            {/* Quick actions */}
            <div className="px-4 pt-3 pb-2 bg-white border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => void sendMessage(a.prompt)}
                    disabled={isTyping || ctxLoading}
                    className="flex items-center gap-1.5 shrink-0 bg-slate-50 hover:bg-orange-50 hover:border-primary/30 border border-slate-200 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all disabled:opacity-40 whitespace-nowrap"
                  >
                    <a.icon size={11} className="text-slate-400 group-hover:text-primary" />
                    {a.label}
                  </button>
                ))}

                {/* Developer-only: Suggest bug fix */}
                {isDeveloper && (
                  <button
                    onClick={startBugFix}
                    disabled={isTyping || ctxLoading || bugStep !== 'idle'}
                    className="flex items-center gap-1.5 shrink-0 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-300 rounded-full px-3 py-1.5 text-xs font-semibold text-red-700 hover:text-red-900 transition-all disabled:opacity-40 whitespace-nowrap"
                  >
                    <Bug size={11} />
                    Suggest bug fix
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' as const }}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    {/* System-info debug line */}
                    {msg.role === 'system-info' ? (
                      <div className="w-full flex items-center gap-2 px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-xl">
                        <Info size={11} className="text-slate-400 shrink-0" />
                        <span className="text-[11px] text-slate-400 font-mono">{msg.content}</span>
                      </div>
                    ) : (
                      <>
                        {/* Avatar */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          msg.role === 'assistant' ? 'bg-slate-900' : 'bg-primary'
                        }`}>
                          {msg.role === 'assistant'
                            ? <Bot size={13} className="text-white" />
                            : <User size={13} className="text-white" />
                          }
                        </div>

                        {/* Bubble */}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === 'assistant'
                            ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
                            : 'bg-primary text-white rounded-tr-sm'
                        }`}>
                          <div className="flex flex-col gap-0.5 text-[13px]">
                            {msg.role === 'assistant' ? formatMessage(msg.content) : <p>{msg.content}</p>}
                          </div>
                          <div className={`text-[10px] mt-1.5 ${msg.role === 'assistant' ? 'text-slate-300' : 'text-white/50'}`}>
                            {msg.timestamp.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-2.5"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                      <Bot size={13} className="text-white" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1 shadow-sm">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 bg-slate-400 rounded-full inline-block"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>

            {/* ── Bug Fix Intake Panel (Developer only) ── */}
            <AnimatePresence>
              {isDeveloper && bugStep !== 'idle' && bugStep !== 'done' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden shrink-0"
                >
                  <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Bug size={13} className="text-red-600" />
                        <span className="text-xs font-bold text-red-800">Bug Fix Mode</span>
                        <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-semibold">Developer only</span>
                      </div>
                      <button
                        onClick={cancelBugFix}
                        className="text-red-400 hover:text-red-700 transition-colors"
                        title="Cancel bug report"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-red-700 mb-2.5 font-medium">
                      {BUG_STEP_PROMPTS[bugStep] ?? ''}
                    </p>
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={bugInput}
                        onChange={(e) => setBugInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); advanceBugStep(bugInput); }
                          if (e.key === 'Escape') cancelBugFix();
                        }}
                        placeholder="Type your answer and press Enter…"
                        className="flex-1 border border-red-200 bg-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 text-slate-800 placeholder:text-slate-400"
                      />
                      <button
                        onClick={() => advanceBugStep(bugInput)}
                        disabled={!bugInput.trim()}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-3 rounded-lg transition-colors"
                      >
                        Next
                      </button>
                    </div>
                    {/* Progress dots */}
                    <div className="flex items-center gap-1 mt-2.5">
                      {(['page', 'clicked', 'happened', 'expected', 'role', 'error'] as BugFixStep[]).map((s, i) => (
                        <div
                          key={s}
                          className={`h-1 rounded-full transition-all ${
                            BUG_STEP_ORDER.indexOf(bugStep) > i
                              ? 'bg-red-500 w-4'
                              : bugStep === s
                              ? 'bg-red-400 w-4'
                              : 'bg-red-200 w-2'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="px-4 pb-4 pt-2 bg-slate-100 border-t border-slate-200 shrink-0">
              {/* Copy Airo prompt button — shown after a bug fix response */}
              {isDeveloper && messages.some((m) => m.role === 'assistant' && m.content.includes('Airo prompt:')) && (
                <div className="mb-2 flex justify-end">
                  <button
                    onClick={copyBugPrompt}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600 hover:text-red-800 bg-red-50 border border-red-200 hover:border-red-300 rounded-lg px-2.5 py-1 transition-all"
                  >
                    {bugCopied ? <Check size={11} /> : <Copy size={11} />}
                    {bugCopied ? 'Copied!' : 'Copy Airo prompt'}
                  </button>
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex items-end gap-2 px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Dazza anything about your jobs, fleet, or data…"
                  className="flex-1 resize-none text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent leading-relaxed"
                  style={{ maxHeight: 120, minHeight: 24 }}
                />
                <button
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                  className="w-8 h-8 bg-primary hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg flex items-center justify-center transition-colors shrink-0"
                >
                  {isTyping ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                Dazza uses your live portal data only. AI calls are server-side — keys are never exposed to the browser.
              </p>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="w-64 xl:w-72 shrink-0 border-l border-slate-200 bg-white overflow-y-auto hidden lg:flex flex-col">

            {/* Context summary */}
            <div className="p-3 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Info size={12} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data loaded</span>
              </div>
              {ctxLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin" /> Loading…
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {[
                    { label: 'Jobs', count: (dazzaCtx?.jobs as unknown[])?.length, ok: perms?.canJobs },
                    { label: 'Open to-dos', count: (dazzaCtx?.openTodos as unknown[])?.length, ok: perms?.canJobs },
                    { label: 'Fleet assets', count: (dazzaCtx?.fleet as unknown[])?.length, ok: perms?.canFleet },
                    { label: 'Fleet flags', count: (dazzaCtx?.fleetFlags as unknown[])?.length, ok: perms?.canFleet },
                    { label: 'Estimates', count: (dazzaCtx?.estimates as unknown[])?.length, ok: perms?.canEstimating },
                    { label: 'Form templates', count: (dazzaCtx?.formTemplates as unknown[])?.length, ok: perms?.canForms },
                    { label: 'Submissions', count: (dazzaCtx?.formSubmissions as unknown[])?.length, ok: perms?.canForms },
                    { label: 'Files', count: (dazzaCtx?.files as unknown[])?.length, ok: perms?.canFiles },
                  ].map(({ label, count, ok }) => (
                    <div key={label} className="flex items-center justify-between text-[10px]">
                      <span className={ok === false ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
                      <span className={`font-bold ${ok === false ? 'text-slate-300' : count ? 'text-slate-700' : 'text-slate-300'}`}>
                        {ok === false ? 'No access' : (count ?? 0)}
                      </span>
                    </div>
                  ))}
                  {perms?.seeDollars === false && (
                    <div className="mt-1 text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-1 border border-amber-100">
                      Dollar amounts hidden (permission)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Calculators */}
            <div className="border-b border-slate-100">
              <button
                onClick={() => setShowCalcs((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Calculator size={12} className="text-primary" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Calculators</span>
                </div>
                {showCalcs ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
              </button>

              <AnimatePresence>
                {showCalcs && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 flex flex-col gap-2">
                      {/* Simple math */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Calculator size={12} className="text-primary" />
                          <span className="text-xs font-bold text-slate-700">Quick Math</span>
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={simpleExpr}
                            onChange={(e) => setSimpleExpr(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && runSimple()}
                            placeholder="e.g. 12.5 * 3.6"
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 bg-white"
                          />
                          <button onClick={runSimple} className="bg-primary text-white text-xs font-bold px-2.5 rounded-lg hover:bg-orange-600 transition-colors">=</button>
                        </div>
                        {simpleResult && (
                          <div className="mt-1.5 text-sm font-black text-primary">{simpleResult}</div>
                        )}
                      </div>

                      {/* Calc selector */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {CALCULATORS.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setActiveCalc(activeCalc === c.id ? null : c.id)}
                            className={`text-[10px] font-semibold px-2 py-1.5 rounded-lg border transition-colors text-left ${
                              activeCalc === c.id
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-primary/30 hover:text-slate-900'
                            }`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>

                      {/* Active calc */}
                      <AnimatePresence>
                        {activeCalc && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            {CALCULATORS.filter((c) => c.id === activeCalc).map((c) => (
                              <CalcWidget
                                key={c.id}
                                calc={c}
                                onSendToChat={(msg) => void sendMessage(msg)}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* About Dazza */}
            <div className="mt-auto p-3">
              <div className="bg-slate-900 rounded-xl p-3 text-white">
                <div className="flex items-center gap-2 mb-1.5">
                  <Bot size={13} className="text-white/60" />
                  <span className="text-xs font-bold">About Dazza</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Dazza reads your live portal data. AI calls are server-side — your API keys are never exposed to the browser.
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed mt-1.5">
                  Always verify building, safety, legal and compliance decisions with a competent person.
                </p>
                {isAdmin && (
                  <a
                    href="/settings"
                    className="mt-2 flex items-center gap-1 text-[10px] text-primary font-semibold hover:text-orange-400 transition-colors"
                  >
                    <Wrench size={9} /> Configure in Settings
                  </a>
                )}
              </div>
            </div>
          </div>
          </> /* end activeTab === 'chat' Fragment */
          )}
        </div>
      </div>
    </div>
  );
}
