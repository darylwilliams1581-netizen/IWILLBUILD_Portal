/**
 * /jobs/:id/progress — Full-screen progress page for a job.
 * Shows progress lines with % complete sliders, inline note editing, export CSV.
 * Cyan theme to match the Progress icon tile.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, TrendingUp, Loader2, Download, Save,
  CheckCircle2,
} from 'lucide-react';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

interface ProgressLine {
  id: number;
  description: string;
  quantity: string;
  unit?: string | null;
  rate: string;
  percentComplete: number;
  progressNote?: string | null;
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-cyan-500' : 'bg-amber-400';
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

export default function JobProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [dirty, setDirty] = useState<Map<number, Partial<ProgressLine>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/jobs/${id}`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ job?: Job } | Job>)
        .then(data => {
          const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
          setJob(j ?? null);
        }),
      fetch(`/api/jobs/${id}/progress`, { credentials: 'include' })
        .then(r => r.json() as Promise<{ lines: ProgressLine[] }>)
        .then(data => setLines(data.lines ?? [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const updateLine = useCallback((lineId: number, field: keyof ProgressLine, value: number | string) => {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
    setDirty(prev => {
      const next = new Map(prev);
      const existing = next.get(lineId) ?? {};
      next.set(lineId, { ...existing, [field]: value });
      return next;
    });
    setSaved(false);
  }, []);

  const saveAll = async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    try {
      const updates = Array.from(dirty.entries()).map(([lineId, changes]) => ({
        id: lineId,
        percentComplete: changes.percentComplete,
        progressNote: changes.progressNote,
      }));
      const res = await fetch(`/api/jobs/${id}/progress`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json() as { lines?: ProgressLine[] };
      if (data.lines) setLines(data.lines);
      setDirty(new Map());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* silent */ } finally { setSaving(false); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/jobs/${id}/progress/export-csv`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `job-${id}-progress.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ } finally { setExporting(false); }
  };

  const overallPct = lines.length
    ? Math.round(lines.reduce((sum, l) => sum + l.percentComplete, 0) / lines.length)
    : 0;

  const title = job ? `${job.name} — Progress` : 'Job Progress';
  const hasDirty = dirty.size > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="Track and update progress for this job." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/progress`} />
      </Helmet>

      {/* ── Desktop top bar ── */}
      <div className="hidden md:flex bg-white border-b border-gray-100 px-4 py-3 items-center gap-3 shrink-0" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
            <TrendingUp size={15} className="text-cyan-600" />
          </div>
          <div className="min-w-0">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate">{job?.name ?? 'Job Progress'}</h1>
                {job?.jobNumber && <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>}
              </>
            )}
          </div>
        </div>
        {hasDirty && (
          <button onClick={saveAll} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Changes
          </button>
        )}
        {saved && !hasDirty && (
          <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
            <CheckCircle2 size={13} /> Saved
          </span>
        )}
        <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold text-gray-600 rounded-lg transition-colors">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Export CSV
        </button>
      </div>

      {/* ── Mobile: back arrow ── */}
      <button onClick={() => navigate('/home')} className="md:hidden fixed top-3 left-3 z-20 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors" aria-label="Back">
        <ArrowLeft size={18} />
      </button>

      {/* ── Mobile: save + export top-right ── */}
      <div className="md:hidden fixed top-3 right-3 z-20 flex items-center gap-2">
        {hasDirty && (
          <button onClick={saveAll} disabled={saving} className="h-9 px-3 rounded-xl bg-cyan-500 shadow-sm flex items-center gap-1.5 text-xs font-semibold text-white active:bg-cyan-600 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
        )}
        <button onClick={exportCsv} disabled={exporting} className="h-9 px-3 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-semibold text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          CSV
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="px-4 py-4 pb-24 md:pb-6 max-w-3xl mx-auto w-full space-y-4">

            {/* Overall progress card */}
            <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-600 text-sm font-semibold">Overall Progress</p>
                <span className={`text-2xl font-bold ${overallPct === 100 ? 'text-emerald-600' : 'text-cyan-600'}`}>{overallPct}%</span>
              </div>
              <ProgressBar pct={overallPct} />
              <p className="text-gray-400 text-xs mt-1.5">{lines.length} line{lines.length !== 1 ? 's' : ''} · {lines.filter(l => l.percentComplete === 100).length} complete</p>
            </div>

            {/* Lines */}
            {lines.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div className="w-12 h-12 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-3">
                  <TrendingUp size={22} className="text-cyan-400" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">No progress lines</p>
                <p className="text-gray-400 text-xs mt-1">Progress lines are synced from job estimates</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-white rounded-2xl border border-gray-100 px-4 py-4"
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <p className="text-gray-900 font-semibold text-sm flex-1 leading-snug">{line.description}</p>
                      <span className={`text-sm font-bold shrink-0 ${line.percentComplete === 100 ? 'text-emerald-600' : 'text-cyan-600'}`}>
                        {line.percentComplete}%
                      </span>
                    </div>

                    {/* Qty / unit / rate */}
                    <div className="flex items-center gap-3 mb-3">
                      {line.quantity && line.quantity !== '1' && (
                        <span className="text-gray-400 text-xs">{line.quantity}{line.unit ? ` ${line.unit}` : ''}</span>
                      )}
                      {line.rate && line.rate !== '0' && (
                        <span className="text-gray-400 text-xs">@ ${line.rate}</span>
                      )}
                    </div>

                    {/* Slider */}
                    <div className="mb-3">
                      <ProgressBar pct={line.percentComplete} />
                      <input
                        type="range"
                        min={0} max={100} step={5}
                        value={line.percentComplete}
                        onChange={e => updateLine(line.id, 'percentComplete', parseInt(e.target.value))}
                        className="w-full mt-1 accent-cyan-500 cursor-pointer"
                        style={{ height: '4px' }}
                      />
                      <div className="flex justify-between text-gray-300 text-[10px] mt-0.5">
                        <span>0%</span><span>50%</span><span>100%</span>
                      </div>
                    </div>

                    {/* Note */}
                    <textarea
                      rows={2}
                      placeholder="Progress note (optional)…"
                      value={line.progressNote ?? ''}
                      onChange={e => updateLine(line.id, 'progressNote', e.target.value)}
                      className="w-full text-xs text-gray-700 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300 transition"
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100" style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
            <TrendingUp size={15} className="text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : (
              <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">{job?.name ?? 'Job Progress'}</p>
                {job?.jobNumber && <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>}
              </>
            )}
          </div>
          <span className={`text-sm font-bold ${overallPct === 100 ? 'text-emerald-600' : 'text-cyan-600'}`}>{overallPct}%</span>
        </div>
      </div>
    </div>
  );
}
