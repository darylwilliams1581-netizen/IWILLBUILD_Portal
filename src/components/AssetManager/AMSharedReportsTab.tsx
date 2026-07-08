/**
 * Shared Reports Tab — generate share tokens, view active shares, revoke
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Share2, Plus, Loader2, AlertTriangle, X, Copy, ExternalLink, CheckCircle2,
} from 'lucide-react';

interface Inspection { id: number; report_title: string | null; report_no: string | null; asset_name: string; }

const SELECT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30';
const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AMSharedReportsTab() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInspection, setSelectedInspection] = useState('');
  const [expireDays, setExpireDays] = useState('30');
  const [generating, setGenerating] = useState(false);
  const [shareLinks, setShareLinks] = useState<Array<{ inspectionId: number; url: string; expiresAt: string; label: string }>>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ir = await fetch('/api/asset-manager/inspections?status=active', { credentials: 'include' });
      const id = await ir.json() as { inspections?: Inspection[] };
      setInspections(id.inspections ?? []);
    } catch { setError('Failed to load inspections'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleGenerate() {
    if (!selectedInspection) return setError('Select an inspection');
    setGenerating(true);
    setError('');
    try {
      const r = await fetch(`/api/asset-manager/inspections/${selectedInspection}/report/share`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_days: parseInt(expireDays, 10) || 30 }),
      });
      const d = await r.json() as { shareUrl?: string; expiresAt?: string; error?: string };
      if (!r.ok || !d.shareUrl) throw new Error(d.error ?? 'Failed to generate link');

      const insp = inspections.find((i) => String(i.id) === selectedInspection);
      const label = insp ? (insp.report_title || insp.report_no || `Inspection #${insp.id}`) + ` — ${insp.asset_name}` : `Inspection #${selectedInspection}`;
      const fullUrl = `${window.location.origin}${d.shareUrl}`;

      setShareLinks((prev) => [{ inspectionId: parseInt(selectedInspection, 10), url: fullUrl, expiresAt: d.expiresAt ?? '', label }, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setGenerating(false);
    }
  }

  function copyLink(url: string) {
    void navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Generate panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Share2 size={15} className="text-orange-500" />
          Generate Shared Report Link
        </h3>
        <p className="text-xs text-slate-500">
          Creates a read-only, token-protected link for external stakeholders. No login required.
          Generating a new link revokes any previous link for the same inspection.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Inspection</label>
            <select value={selectedInspection} onChange={(e) => setSelectedInspection(e.target.value)} className={SELECT}>
              <option value="">Select inspection…</option>
              {inspections.map((i) => <option key={i.id} value={i.id}>{i.report_title || i.report_no || `#${i.id}`} — {i.asset_name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Expires in (days)</label>
            <select value={expireDays} onChange={(e) => setExpireDays(e.target.value)} className={SELECT}>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
        </div>

        <button onClick={() => void handleGenerate()} disabled={generating || !selectedInspection}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 self-start">
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Generate link
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* Generated links */}
      {shareLinks.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Generated this session</h3>
          {shareLinks.map((link) => (
            <div key={link.url} className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-emerald-700 truncate">{link.label}</p>
                {link.expiresAt && (
                  <span className="text-[10px] text-slate-500 flex-shrink-0">
                    Expires {new Date(link.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 truncate font-mono">{link.url}</code>
                <button onClick={() => copyLink(link.url)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors flex-shrink-0">
                  {copied === link.url ? <CheckCircle2 size={11} className="text-emerald-600" /> : <Copy size={11} />}
                  {copied === link.url ? 'Copied' : 'Copy'}
                </button>
                <a href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors flex-shrink-0">
                  <ExternalLink size={11} />
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
      )}

      {!loading && shareLinks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Share2 size={28} className="text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">No shared links generated yet</p>
          <p className="text-xs text-slate-400 mt-1">Select an inspection above and click Generate link</p>
        </div>
      )}
    </div>
  );
}
