import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  ToggleLeft,
  ToggleRight,
  FileText,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  BookOpen,
  Settings2,
  Key,
  XCircle,
} from 'lucide-react';
import { DAZZA_DEFAULT_DISCLAIMER } from '@/lib/dazza-guardrails';
import DazzaKnowledgePanel from './DazzaKnowledgePanel';

interface DazzaSettings {
  enabled: boolean;
  knowledgeNotes: string;
  safetyNotes: string;
  preferredTone: string;
  disclaimer: string;
}

const DEFAULT_DAZZA: DazzaSettings = {
  enabled: false,
  knowledgeNotes: '',
  safetyNotes: '',
  preferredTone: '',
  disclaimer: DAZZA_DEFAULT_DISCLAIMER,
};

const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

export default function DazzaAITab({ isAdmin }: { isAdmin: boolean }) {
  const [settings, setSettings] = useState<DazzaSettings>(DEFAULT_DAZZA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'settings' | 'knowledge'>('settings');
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, keyRes] = await Promise.all([
        fetch('/api/company-settings', { credentials: 'include' }),
        isAdmin ? fetch('/api/dazza/key-status', { credentials: 'include' }) : Promise.resolve(null),
      ]);
      if (settingsRes.ok) {
        const json = await settingsRes.json() as { dazza?: Partial<DazzaSettings> };
        if (json.dazza && Object.keys(json.dazza).length > 0) {
          setSettings({ ...DEFAULT_DAZZA, ...json.dazza });
        }
      }
      if (keyRes && keyRes.ok) {
        const keyJson = await keyRes.json() as { configured: boolean };
        setKeyConfigured(keyJson.configured);
      }
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  function set<K extends keyof DazzaSettings>(key: K, value: DazzaSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    if (!isAdmin) return;
    setSaving(true);
    setErrorMsg('');
    setSaveState('idle');
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'dazza', data: settings }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Save failed');
      }
      setSaveState('saved');
      setLastSaved(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Save failed');
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-base text-slate-800 flex items-center gap-2">
            <Bot size={16} className="text-primary" />
            Dazza AI Settings
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure Dazza AI behaviour, company knowledge, and safety guardrails.
          </p>
        </div>
        {!isAdmin && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 font-semibold shrink-0">
            View only — Owner/Admin can edit
          </span>
        )}
      </div>

      {/* Sub-tab switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubTab('settings')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-all ${subTab === 'settings' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Settings2 size={13} />
          Settings
        </button>
        <button
          onClick={() => setSubTab('knowledge')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-all ${subTab === 'knowledge' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BookOpen size={13} />
          Knowledge / Learn
        </button>
      </div>

      {/* Knowledge sub-tab */}
      {subTab === 'knowledge' && (
        <DazzaKnowledgePanel isAdmin={isAdmin} />
      )}

      {/* Settings sub-tab */}
      {subTab === 'settings' && (
        <>
          {/* ── OpenAI Key Status (admin only) ── */}
          {isAdmin && keyConfigured !== null && (
            <div className={`border rounded-xl p-5 flex items-start gap-4 ${keyConfigured ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className={`p-2 rounded-xl shrink-0 ${keyConfigured ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                <Key size={16} className={keyConfigured ? 'text-emerald-600' : 'text-amber-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${keyConfigured ? 'text-emerald-800' : 'text-amber-800'}`}>
                  OpenAI API Key: {keyConfigured ? 'Configured ✓' : 'Not configured'}
                </p>
                <p className={`text-xs mt-0.5 ${keyConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {keyConfigured
                    ? 'Dazza can answer general AI questions, NCC guidance, construction advice, and more.'
                    : 'Without a key, Dazza can still answer portal lookups, maths, and GST calculations — but not general AI questions. Add OPENAI_API_KEY in Airo Secrets to unlock full AI responses.'}
                </p>
              </div>
              {keyConfigured
                ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                : <XCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
              }
            </div>
          )}

          {/* ── Dazza Enabled Status ── */}
          <div className={`border rounded-xl p-5 flex items-start gap-4 ${settings.enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className={`p-2 rounded-xl shrink-0 ${settings.enabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
              <Bot size={16} className={settings.enabled ? 'text-emerald-600' : 'text-slate-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${settings.enabled ? 'text-emerald-800' : 'text-slate-600'}`}>
                Dazza AI: {settings.enabled ? 'Enabled ✓' : 'Disabled'}
              </p>
              <p className={`text-xs mt-0.5 ${settings.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                {settings.enabled
                  ? 'Users with Dazza AI permission can access the assistant.'
                  : 'Dazza AI is currently disabled for all users. Enable it below.'}
              </p>
            </div>
            {settings.enabled
              ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              : <XCircle size={18} className="text-slate-400 shrink-0 mt-0.5" />
            }
          </div>

          {/* Enable toggle */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${settings.enabled ? 'bg-orange-50' : 'bg-slate-100'}`}>
                  <Bot size={16} className={settings.enabled ? 'text-primary' : 'text-slate-400'} />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-800">Enable Dazza AI</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow users with Dazza AI permission to access the AI assistant.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => isAdmin && set('enabled', !settings.enabled)}
                disabled={!isAdmin}
                className={`transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${settings.enabled ? 'text-primary' : 'text-slate-300'}`}
              >
                {settings.enabled
                  ? <ToggleRight size={36} />
                  : <ToggleLeft size={36} />
                }
              </button>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-500" />
              <label className={`${labelClass} mb-0`}>Disclaimer Text</label>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Shown to users when they open Dazza AI. Defaults to the standard IWILLBUILD disclaimer.
            </p>
            <textarea
              className={`${inputClass} resize-none`}
              rows={4}
              value={settings.disclaimer}
              onChange={(e) => set('disclaimer', e.target.value)}
              disabled={!isAdmin}
              placeholder={DAZZA_DEFAULT_DISCLAIMER}
            />
            {isAdmin && (
              <button
                type="button"
                onClick={() => set('disclaimer', DAZZA_DEFAULT_DISCLAIMER)}
                className="mt-2 text-xs text-slate-400 hover:text-primary transition-colors"
              >
                Reset to default
              </button>
            )}
          </div>

          {/* Disclaimer preview */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
            <Info size={15} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-orange-800 mb-1">Disclaimer preview (shown to users)</p>
              <p className="text-xs text-orange-700 leading-relaxed">{settings.disclaimer || DAZZA_DEFAULT_DISCLAIMER}</p>
            </div>
          </div>

          {/* Company knowledge */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <FileText size={14} className="text-primary" />
              <label className={`${labelClass} mb-0`}>Company Knowledge Notes</label>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Background about your company — services, specialisations, key projects, clients, regions. Dazza uses this to give more relevant answers.
            </p>
            <textarea
              className={`${inputClass} resize-none`}
              rows={5}
              value={settings.knowledgeNotes}
              onChange={(e) => set('knowledgeNotes', e.target.value)}
              disabled={!isAdmin}
              placeholder="e.g. We are a residential and commercial builder based in South East Queensland. We specialise in concrete slabs, framing and fit-out. Our main clients are developers and private owners..."
            />
          </div>

          {/* Safety notes */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck size={14} className="text-primary" />
              <label className={`${labelClass} mb-0`}>Safety & Process Notes</label>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Company-specific safety rules, SWMS requirements, induction procedures, or process notes. Dazza will reference these when answering safety-related questions.
            </p>
            <textarea
              className={`${inputClass} resize-none`}
              rows={5}
              value={settings.safetyNotes}
              onChange={(e) => set('safetyNotes', e.target.value)}
              disabled={!isAdmin}
              placeholder="e.g. All workers must complete site induction before starting. SWMS required for all high-risk work. PPE mandatory on all sites. Incident reporting within 4 hours..."
            />
          </div>

          {/* Preferred tone */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1.5">
              <MessageSquare size={14} className="text-primary" />
              <label className={`${labelClass} mb-0`}>Preferred Assistant Tone</label>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Describe how you want Dazza to communicate. Leave blank for the default (helpful, practical, plain Australian English).
            </p>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              value={settings.preferredTone}
              onChange={(e) => set('preferredTone', e.target.value)}
              disabled={!isAdmin}
              placeholder="e.g. Concise and direct. Use plain language. Avoid jargon. Bullet points where possible."
            />
          </div>

          {/* Guardrails info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-emerald-500" />
              Built-in Dazza AI Guardrails (always active)
            </p>
            <ul className="text-xs text-slate-500 flex flex-col gap-1 list-none">
              {[
                'Never invents or fabricates company, job, fleet, form, estimate or file data',
                'Clearly separates "From IWILLBUILD data" from "General guidance"',
                'Respects user module permissions — only answers from modules the user can access',
                'Hides dollar amounts for users without the "See Dollars" permission',
                'Always adds a verification reminder for WHS, building codes and compliance matters',
                'Never exposes inactive, deleted or other-company records',
                'Attributes answers to source modules (e.g. Source: Jobs)',
              ].map((rule, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* Save footer */}
          {isAdmin && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-400">
                {saveState === 'saved' && lastSaved && (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                    <CheckCircle2 size={13} />Saved at {lastSaved}
                  </span>
                )}
                {saveState === 'error' && errorMsg && (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <AlertCircle size={13} />{errorMsg}
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Dazza Settings
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
