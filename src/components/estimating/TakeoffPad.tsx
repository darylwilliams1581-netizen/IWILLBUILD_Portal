import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Trash2, Loader2, CheckCircle2, AlertCircle, ClipboardList } from 'lucide-react';
import { getPlatform } from '@/lib/capacitor-plugins';

// ── Speech recognition types ──────────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  // WKWebView (iOS Capacitor) does not support the Web Speech API.
  // Returning null here causes the component to show the keyboard-mic tip instead.
  if (getPlatform() === 'ios') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// ── Autosave hook ─────────────────────────────────────────────────────────────
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── Main component ────────────────────────────────────────────────────────────
export default function TakeoffPad() {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [listening, setListening] = useState(false);
  const [micUnsupported, setMicUnsupported] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/takeoff-pad', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { pad?: { title: string; notes: string | null; updatedAt: string } | null }) => {
        if (d.pad) {
          setTitle(d.pad.title ?? '');
          setNotes(d.pad.notes ?? '');
          setSavedAt(new Date(d.pad.updatedAt));
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoadError('Could not load take-off pad.');
        setLoaded(true);
      });
  }, []);

  // ── Autosave ───────────────────────────────────────────────────────────────
  const save = useCallback(async (t: string, n: string) => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/takeoff-pad', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, notes: n }),
      });
      const data = await res.json() as { ok?: boolean; updatedAt?: string };
      if (data.ok) {
        setSaveStatus('saved');
        setSavedAt(data.updatedAt ? new Date(data.updatedAt) : new Date());
        setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, []);

  function scheduleAutosave(t: string, n: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(() => { void save(t, n); }, 800);
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    if (loaded) scheduleAutosave(v, notes);
  }

  function handleNotesChange(v: string) {
    setNotes(v);
    if (loaded) scheduleAutosave(title, v);
  }

  // ── Mic ────────────────────────────────────────────────────────────────────
  function toggleMic() {
    const SR = getSpeechRecognition();
    if (!SR) { setMicUnsupported(true); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-AU';

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = e.results.length - 1; i >= 0; i--) {
        if (e.results[i].isFinal) {
          transcript = e.results[i][0].transcript;
          break;
        }
      }
      if (transcript) {
        setNotes((prev) => {
          const updated = prev ? `${prev}\n${transcript}` : transcript;
          scheduleAutosave(title, updated);
          return updated;
        });
        // Scroll textarea to bottom
        setTimeout(() => {
          if (notesRef.current) {
            notesRef.current.scrollTop = notesRef.current.scrollHeight;
          }
        }, 50);
      }
    };

    rec.onerror = () => { setListening(false); };
    rec.onend = () => { setListening(false); };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setMicUnsupported(false);
  }

  // ── Clear pad ──────────────────────────────────────────────────────────────
  async function clearPad() {
    setClearConfirm(false);
    setTitle('');
    setNotes('');
    await save('', '');
  }

  // ── Save status display ────────────────────────────────────────────────────
  function SaveIndicator() {
    if (saveStatus === 'saving') return (
      <span className="flex items-center gap-1 text-xs text-slate-400">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
    if (saveStatus === 'saved') return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle2 size={11} /> Saved
      </span>
    );
    if (saveStatus === 'error') return (
      <span className="flex items-center gap-1 text-xs text-red-500">
        <AlertCircle size={11} /> Save failed
      </span>
    );
    if (savedAt) return (
      <span className="text-xs text-slate-400">
        Last saved {savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
      </span>
    );
    return null;
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10 shrink-0">
          <ClipboardList size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-700">Take-off Pad</h2>
          <p className="text-xs text-slate-400">Rough notes &amp; measurements — autosaved per user</p>
        </div>
        <SaveIndicator />
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          <AlertCircle size={13} /> {loadError}
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="e.g. 42 Smith St — Site Take-off"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
        />
      </div>

      {/* Notes area */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-500">Notes</label>
          {/* Mic button — hidden on iOS WebView where Web Speech API is unavailable */}
          {getPlatform() !== 'ios' && (
            <button
              onClick={toggleMic}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                listening
                  ? 'bg-red-500 border-red-500 text-white animate-pulse'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary'
              }`}
            >
              {listening ? <MicOff size={13} /> : <Mic size={13} />}
              {listening ? 'Stop listening' : 'Voice input'}
            </button>
          )}
        </div>

        {/* iOS: show keyboard mic tip instead of the Web Speech button */}
        {getPlatform() === 'ios' && (
          <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 flex items-start gap-2">
            <Mic size={13} className="shrink-0 mt-0.5 text-blue-500" />
            <span>Tap the <strong>microphone key</strong> on your keyboard to dictate notes.</span>
          </div>
        )}

        {micUnsupported && getPlatform() !== 'ios' && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            Voice input is not supported in this browser. Use your phone keyboard microphone for voice-to-text.
          </div>
        )}

        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Start typing your take-off notes here…&#10;&#10;e.g.&#10;Lounge: 4.2 x 3.6 = 15.12m²&#10;Kitchen: 3.0 x 2.8 = 8.4m²&#10;Hallway: 1.2 x 6.0 = 7.2m²"
          rows={22}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white resize-y min-h-[300px]"
          style={{ fontFamily: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace" }}
        />

        {listening && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Listening… speak clearly. Tap "Stop listening" when done.
          </div>
        )}
      </div>

      {/* Clear pad */}
      <div className="flex items-center justify-between pt-1">
        <div />
        {!clearConfirm ? (
          <button
            onClick={() => setClearConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-red-300 hover:text-red-600 text-xs font-semibold text-slate-500 transition-colors"
          >
            <Trash2 size={13} /> Clear Pad
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50">
            <span className="text-xs font-semibold text-red-700">Clear this take-off pad? This cannot be undone.</span>
            <button onClick={() => void clearPad()} className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors">
              Yes, clear
            </button>
            <button onClick={() => setClearConfirm(false)} className="px-3 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
