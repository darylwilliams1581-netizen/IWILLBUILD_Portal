import { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert, ClipboardList, Sparkles, RefreshCw, Bot,
  Users, Send, Loader2, Check, Copy,
} from 'lucide-react';

type AiMode = 'swms' | 'plan' | 'suggest';

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SwmsSuggestion {
  title: string;
  work_activity: string;
  reason: string;
}

const AI_MODES: Array<{ id: AiMode; label: string; icon: typeof Bot; desc: string; placeholder: string }> = [
  {
    id: 'swms',
    label: 'Draft SWMS',
    icon: ShieldAlert,
    desc: 'Describe a work activity and Dazza will draft a full SWMS with hazards, controls, PPE and legislation.',
    placeholder: 'e.g. Excavation work adjacent to existing services on a residential site in Queensland\u2026',
  },
  {
    id: 'suggest',
    label: 'Suggest SWMS',
    icon: Sparkles,
    desc: 'Paste your job scope or description and Dazza will identify which SWMS documents you need.',
    placeholder: 'e.g. Two-storey residential build including slab, framing, roofing, electrical rough-in, plumbing, tiling and painting\u2026',
  },
  {
    id: 'plan',
    label: 'Draft Safety Plan',
    icon: ClipboardList,
    desc: 'Get help drafting site rules, emergency procedures, high-risk activity lists and other safety plan sections.',
    placeholder: 'e.g. Write site rules for a commercial fitout in a live shopping centre with public access\u2026',
  },
];

export default function DazzaAiTab() {
  const [mode, setMode] = useState<AiMode>('swms');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<SwmsSuggestion[]>([]);
  const [draftJson, setDraftJson] = useState<Record<string, string> | null>(null);
  const [copyMsg, setCopyMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMode = AI_MODES.find((m) => m.id === mode)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  function clearChat() {
    setMessages([]);
    setSuggestions([]);
    setDraftJson(null);
    setCopyMsg('');
  }

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setInput('');
    setSuggestions([]);
    setDraftJson(null);

    const userMsg: AiMessage = { id: Date.now().toString(), role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/safety/ai/draft', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, prompt }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${err.error ?? 'Request failed'}` } : m));
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data) as { delta?: string; error?: string };
            if (parsed.delta) {
              fullText += parsed.delta;
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullText } : m));
            }
          } catch { /* skip */ }
        }
      }

      if (mode === 'suggest') {
        try {
          const jsonMatch = fullText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as SwmsSuggestion[];
            setSuggestions(parsed);
          }
        } catch { /* raw text fallback */ }
      } else if (mode === 'swms') {
        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
            setDraftJson(parsed);
          }
        } catch { /* raw text fallback */ }
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: 'Connection error. Please try again.' } : m));
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function copyDraft() {
    if (!draftJson) return;
    const text = Object.entries(draftJson).map(([k, v]) => `${k.replace(/_/g, ' ').toUpperCase()}\n${v}`).join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopyMsg('Copied!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex gap-2 flex-wrap">
        {AI_MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); clearChat(); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                mode === m.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon size={13} />
              {m.label}
            </button>
          );
        })}
        {messages.length > 0 && (
          <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors ml-auto">
            <RefreshCw size={12} />Clear
          </button>
        )}
      </div>

      <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-start gap-3">
        <Bot size={16} className="text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-900">{currentMode.label}</p>
          <p className="text-xs text-orange-700 mt-0.5">{currentMode.desc}</p>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="flex flex-col gap-3 bg-white border border-slate-200 rounded-xl p-4 max-h-[480px] overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-800' : 'bg-primary'}`}>
                {msg.role === 'user' ? <Users size={13} className="text-white" /> : <Bot size={13} className="text-white" />}
              </div>
              <div className={`flex-1 min-w-0 rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-slate-100 text-slate-800' : 'bg-slate-50 text-slate-700 border border-slate-200'
              }`}>
                {msg.content || (streaming && msg.role === 'assistant' ? (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Suggested SWMS Documents ({suggestions.length})</p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert size={12} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{s.title}</p>
                  {s.work_activity && <p className="text-xs text-slate-500 mt-0.5">{s.work_activity}</p>}
                  {s.reason && <p className="text-xs text-orange-700 mt-1 italic">{s.reason}</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">Go to SWMS Library &rarr; New SWMS to create each of these documents.</p>
        </div>
      )}

      {draftJson && (
        <div className="bg-white border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Draft SWMS Ready</p>
            <button onClick={() => void copyDraft()} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors">
              {copyMsg ? <Check size={12} /> : <Copy size={12} />}
              {copyMsg || 'Copy all'}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {Object.entries(draftJson).map(([key, val]) => (
              <div key={key}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{key.replace(/_/g, ' ')}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{val}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">Go to SWMS Library &rarr; New SWMS and paste this content to create the document.</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentMode.placeholder}
          rows={3}
          disabled={streaming}
          className="flex-1 resize-none text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 leading-relaxed"
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || streaming}
          className="flex items-center gap-1.5 bg-primary hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shrink-0"
        >
          {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {streaming ? 'Thinking\u2026' : 'Ask Dazza'}
        </button>
      </div>
      <p className="text-xs text-slate-400 -mt-2">Requires OpenAI API key configured in settings. Press Enter to send, Shift+Enter for new line.</p>
    </div>
  );
}
