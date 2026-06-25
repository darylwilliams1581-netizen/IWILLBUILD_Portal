import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Bot,
  Send,
  User,
  Sparkles,
  HardHat,
  Truck,
  FileText,
  BarChart2,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const suggestions = [
  { icon: HardHat,   label: 'Summarise active jobs',         prompt: 'Give me a summary of all active jobs and their current progress.' },
  { icon: Truck,     label: 'Fleet attention items',          prompt: 'Which fleet assets need attention right now? List any issues or overdue services.' },
  { icon: FileText,  label: 'Check estimate completeness',    prompt: 'Review the estimates on active jobs and flag any that are missing approved values.' },
  { icon: BarChart2, label: 'Run a data health check',        prompt: 'Run a data health check across jobs, fleet, forms and files. What is missing or incomplete?' },
];

const dazzaResponses: Record<string, string> = {
  'Give me a summary of all active jobs and their current progress.':
    `Here's a summary of your 3 active jobs:\n\n**JOB-001 — Riverside Residential Build** (68%)\nFrame complete, roofing starts Monday. 6 crew on site. 14 forms completed, 87 photos uploaded. Due 15 Sep 2026.\n\n**JOB-002 — Commercial Fitout Level 3** (42%)\nElectrical rough-in underway, plumbing next week. 4 crew. 8 forms, 43 photos. Due 30 Jul 2026.\n\n**JOB-003 — Deck & Pergola Carindale** (85%)\nDecking boards down, pergola posts set. 2 crew. 5 forms, 31 photos. Due 5 Jul 2026 — this one is close, worth checking in.\n\nOverall the jobs look healthy. JOB-003 is your most urgent — due in 10 days.`,

  'Which fleet assets need attention right now? List any issues or overdue services.':
    `Two assets need your attention:\n\n**FLT-003 — Bobcat S650** ⚠️\n- Service is overdue by 3 days\n- Left track tension was flagged in yesterday's prestart\nRecommendation: Book service immediately and inspect track before next use.\n\n**FLT-004 — Ford Ranger XLT** 🔧\n- Currently with mechanic at Tingalpa\n- Brake pads replacement + AC regas in progress\nExpected back: check with mechanic for ETA.\n\nAll other assets have current prestarts and no flagged issues.`,

  'Review the estimates on active jobs and flag any that are missing approved values.':
    `I've reviewed the estimates across your active jobs:\n\n✅ **JOB-001** — Estimate approved at $420,000. Scope locked.\n✅ **JOB-002** — Estimate approved at $185,000. Scope locked.\n✅ **JOB-003** — Estimate approved at $38,500. Scope locked.\n\n⚠️ **JOB-004 — Warehouse Extension** — Estimate exists but scope is NOT locked. Job is pending DA approval, but you should lock the estimate now to protect the approved value before work starts.\n\nRecommendation: Lock JOB-004 estimate before the DA comes through.`,

  'Run a data health check across jobs, fleet, forms and files. What is missing or incomplete?':
    `Data health check complete. Here's what I found:\n\n**Jobs** ✅\n- 6 jobs in register. All have client names, locations and dates.\n- JOB-006 (Retaining Wall) is on hold — confirm this is intentional.\n\n**Fleet** ⚠️\n- FLT-003 service overdue. FLT-006 rego expires in 67 days — action needed.\n- FLT-005 is hired plant — confirm return date is logged.\n\n**Forms** ⚠️\n- JOB-004 only has 1 form completed. Consider adding a site setup form before work starts.\n\n**Files** ℹ️\n- No file register data loaded yet. Consider linking SharePoint folders to active jobs.\n\n**Overall score: 74/100** — Good foundation. Address fleet service and file register to improve.`,
};

function formatMessage(content: string) {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('**') && line.endsWith('**')) {
      return <p key={i} className="font-bold mt-2 mb-0.5">{line.replace(/\*\*/g, '')}</p>;
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className={line === '' ? 'mt-1' : ''}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.replace(/\*\*/g, '')}</strong>
            : part
        )}
      </p>
    );
  });
}

export default function DazzaAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: "G'day! I'm Dazza — your IWILLBUILD AI assistant. I'm young and still learning, but I can already help you check on jobs, fleet, estimates and data health. The more data you put into the portal, the smarter I get.\n\nWhat do you need today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  function sendMessage(text: string) {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response =
        dazzaResponses[text.trim()] ||
        "I don't have enough data loaded to answer that specifically yet. As you add more jobs, fleet records, forms and files to the portal, I'll be able to give you much better answers. Try one of the suggested prompts to see what I can do right now.";

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setIsTyping(false);
      setMessages((prev) => [...prev, assistantMsg]);
    }, 1200 + Math.random() * 600);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Dazza AI — IWILLBUILD Portal</title>
        <meta name="description" content="Ask Dazza AI about your jobs, fleet, estimates and data health in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/dazza-ai" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-base leading-none">Dazza AI</h1>
              <p className="text-xs text-slate-400 leading-none mt-0.5">Construction assistant</p>
            </div>
            <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse inline-block" />
              Online
            </span>
          </div>
          <button
            onClick={() => setMessages([{
              id: Date.now().toString(),
              role: 'assistant',
              content: "G'day! I'm Dazza — your IWILLBUILD AI assistant. I'm young and still learning, but I can already help you check on jobs, fleet, estimates and data health. The more data you put into the portal, the smarter I get.\n\nWhat do you need today?",
              timestamp: new Date(),
            }])}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 font-semibold transition-colors"
          >
            <RefreshCw size={13} />
            New chat
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Chat area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' as const }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      msg.role === 'assistant' ? 'bg-slate-900' : 'bg-primary'
                    }`}>
                      {msg.role === 'assistant'
                        ? <Bot size={15} className="text-white" />
                        : <User size={15} className="text-white" />
                      }
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'assistant'
                        ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                        : 'bg-primary text-white rounded-tr-sm'
                    }`}>
                      <div className="flex flex-col gap-0.5">
                        {formatMessage(msg.content)}
                      </div>
                      <div className={`text-xs mt-2 ${msg.role === 'assistant' ? 'text-slate-400' : 'text-white/60'}`}>
                        {msg.timestamp.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </motion.div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                      <Bot size={15} className="text-white" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-2 h-2 bg-slate-400 rounded-full inline-block"
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

            {/* Input */}
            <div className="px-6 pb-5 pt-3 bg-slate-100 border-t border-slate-200">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex items-end gap-3 px-4 py-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Dazza anything about your jobs, fleet, or data…"
                  className="flex-1 resize-none text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent leading-relaxed"
                  style={{ maxHeight: 120 }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                  className="w-8 h-8 bg-primary hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg flex items-center justify-center transition-colors shrink-0"
                >
                  <Send size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2 text-center">
                Dazza uses portal data only. Keys are never exposed to the browser.
              </p>
            </div>
          </div>

          {/* Right panel — suggestions */}
          <div className="w-64 shrink-0 border-l border-slate-200 bg-white overflow-y-auto hidden lg:flex flex-col">
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-primary" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quick prompts</span>
              </div>
              <p className="text-xs text-slate-400">Click to send a prompt to Dazza</p>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  onClick={() => sendMessage(s.prompt)}
                  disabled={isTyping}
                  className="flex items-center gap-3 text-left w-full bg-slate-50 hover:bg-orange-50 hover:border-primary/30 border border-slate-200 rounded-lg p-3 transition-all group disabled:opacity-50"
                >
                  <div className="w-7 h-7 bg-white border border-slate-200 rounded-md flex items-center justify-center shrink-0 group-hover:border-primary/30">
                    <s.icon size={13} className="text-slate-500 group-hover:text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 leading-tight flex-1">{s.label}</span>
                  <ChevronRight size={12} className="text-slate-300 group-hover:text-primary shrink-0" />
                </button>
              ))}
            </div>

            {/* About Dazza */}
            <div className="mt-auto p-4 border-t border-slate-100">
              <div className="bg-slate-900 rounded-xl p-4 text-white text-xs">
                <div className="font-bold mb-1">About Dazza</div>
                <p className="text-slate-400 leading-relaxed">
                  Dazza reads your live portal data. AI calls are made server-side — your API keys are never exposed to the browser.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
