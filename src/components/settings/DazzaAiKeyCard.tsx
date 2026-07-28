/**
 * DazzaAiKeyCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets the company owner save their own OpenAI API key so Dazza AI uses it
 * instead of the shared platform key. Prevents rate-limit collisions between
 * companies.
 *
 * Owner only — hidden from all other roles.
 */
import { useState, useEffect } from 'react';
import { Brain, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Trash2, ExternalLink } from 'lucide-react';

interface KeyStatus {
  configured: boolean;
  maskedKey: string | null;
}

interface DazzaAiKeyCardProps {
  isOwner: boolean;
}

export default function DazzaAiKeyCard({ isOwner }: DazzaAiKeyCardProps) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOwner) return;
    void load();
  }, [isOwner]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/dazza-ai-key', { credentials: 'include' });
      if (res.ok) setStatus(await res.json() as KeyStatus);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function handleSave() {
    const trimmed = keyInput.trim();
    if (!trimmed) { setError('Please enter an API key.'); return; }
    if (!trimmed.startsWith('sk-')) { setError('Invalid key format — must start with sk-'); return; }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/settings/dazza-ai-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; configured?: boolean; maskedKey?: string | null };
      if (!res.ok) { setError(data.error ?? 'Failed to save key.'); }
      else {
        setStatus({ configured: data.configured ?? true, maskedKey: data.maskedKey ?? null });
        setKeyInput('');
        setShowInput(false);
        setSuccess('API key saved. Dazza will now use your company key.');
      }
    } catch { setError('Could not reach the server.'); }
    setSaving(false);
  }

  async function handleRemove() {
    if (!confirm('Remove your company OpenAI key? Dazza will fall back to the shared platform key.')) return;
    setRemoving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/settings/dazza-ai-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '' }),
      });
      if (res.ok) {
        setStatus({ configured: false, maskedKey: null });
        setSuccess('Company key removed. Dazza will use the shared platform key.');
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Failed to remove key.');
      }
    } catch { setError('Could not reach the server.'); }
    setRemoving(false);
  }

  if (!isOwner) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
          <Brain size={20} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-900">Dazza AI — Company OpenAI Key</p>
          <p className="text-xs text-slate-500">Use your own key so your team doesn't share rate limits with other companies</p>
        </div>
        {status?.configured && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 shrink-0">
            <CheckCircle2 size={11} />
            Active
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            {/* Success */}
            {success && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                <span>{success}</span>
                <button onClick={() => setSuccess('')} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs">Dismiss</button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
                <AlertCircle size={14} className="shrink-0 text-red-500" />
                <span>{error}</span>
                <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600 text-xs">Dismiss</button>
              </div>
            )}

            {status?.configured ? (
              /* Key is saved */
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <Brain size={14} className="text-violet-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 font-medium">Active key</p>
                    <p className="text-sm font-mono text-slate-800">{status.maskedKey ?? 'sk-•••••••••••••••••'}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Dazza AI is using your company's OpenAI key. All AI requests from your team are billed to your OpenAI account and won't affect other companies' rate limits.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setShowInput(true); setKeyInput(''); setError(''); }}
                    className="text-sm text-violet-700 hover:text-violet-800 font-medium transition-colors"
                  >
                    Replace key
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => void handleRemove()}
                    disabled={removing}
                    className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
                  >
                    {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Remove key
                  </button>
                </div>

                {showInput && (
                  <div className="space-y-2 pt-1">
                    <div className="relative">
                      <input
                        type={showInput ? 'text' : 'password'}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder="sk-proj-..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono pr-10 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowInput((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800"
                      >
                        {showInput ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="flex items-center gap-2 bg-violet-500 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Save new key
                      </button>
                      <button
                        onClick={() => { setShowInput(false); setKeyInput(''); setError(''); }}
                        className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* No key saved */
              <div className="space-y-3">
                <p className="text-sm text-slate-600 leading-relaxed">
                  By default, Dazza AI uses a shared platform key. If multiple team members use Dazza heavily, you may hit rate limits. Add your own OpenAI key to get a dedicated quota.
                </p>

                <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <p className="font-semibold mb-0.5">How it works</p>
                    <ul className="space-y-0.5 text-blue-700">
                      <li>• Your key is stored securely and never exposed to users</li>
                      <li>• All Dazza AI requests from your company use your key</li>
                      <li>• Usage is billed directly to your OpenAI account</li>
                      <li>• You can remove it at any time to revert to the shared key</li>
                    </ul>
                  </div>
                </div>

                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Get an API key from OpenAI <ExternalLink size={10} />
                </a>

                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="sk-proj-..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving || !keyInput.trim()}
                    className="flex items-center gap-2 bg-violet-500 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                    Save company key
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
