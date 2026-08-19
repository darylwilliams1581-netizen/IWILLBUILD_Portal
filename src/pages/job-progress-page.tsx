/**
 * /jobs/:id/progress — Full-screen progress page for a job.
 * Shows progress lines with % complete sliders, inline note editing, export CSV.
 * Cyan theme to match the Progress icon tile.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { TrendingUp, Loader2, Download, Save, CheckCircle2, FileText, User, Calendar, AlertTriangle, Star, ClipboardList, Home, ArrowLeft } from 'lucide-react';
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
interface ProgressReport {
  prepared_by: string;
  report_date: string;
  period_from: string;
  period_to: string;
  achievements: string;
  planned_next: string;
  outstanding_issues: string;
}
function ProgressBar({
  pct
}: {
  pct: number;
}) {
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-cyan-500' : 'bg-amber-400';
  return <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{
      width: `${pct}%`
    }} />
    </div>;
}
export default function JobProgressPage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [dirty, setDirty] = useState<Map<number, Partial<ProgressLine>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const emptyReport: ProgressReport = {
    prepared_by: '',
    report_date: '',
    period_from: '',
    period_to: '',
    achievements: '',
    planned_next: '',
    outstanding_issues: ''
  };
  const [report, setReport] = useState<ProgressReport>(emptyReport);
  const [reportDirty, setReportDirty] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([fetch(`/api/jobs/${id}`, {
      credentials: 'include'
    }).then(r => r.json() as Promise<{
      job?: Job;
    } | Job>).then(data => {
      const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
      setJob(j ?? null);
    }), fetch(`/api/jobs/${id}/progress`, {
      credentials: 'include'
    }).then(r => r.json() as Promise<{
      lines: ProgressLine[];
    }>).then(data => setLines(data.lines ?? [])), fetch(`/api/jobs/${id}/progress/report`, {
      credentials: 'include'
    }).then(r => r.json() as Promise<{
      report?: Partial<ProgressReport> | null;
    }>).then(data => {
      if (data.report) {
        setReport({
          prepared_by: String(data.report.prepared_by ?? ''),
          report_date: String(data.report.report_date ?? '').slice(0, 10),
          period_from: String(data.report.period_from ?? '').slice(0, 10),
          period_to: String(data.report.period_to ?? '').slice(0, 10),
          achievements: String(data.report.achievements ?? ''),
          planned_next: String(data.report.planned_next ?? ''),
          outstanding_issues: String(data.report.outstanding_issues ?? '')
        });
      }
    })]).catch(() => setError('Failed to load progress data. Check your connection.')).finally(() => setLoading(false));
  }, [id]);
  function updateReport(field: keyof ProgressReport, value: string) {
    setReport(prev => ({
      ...prev,
      [field]: value
    }));
    setReportDirty(true);
    setReportSaved(false);
    setReportError(null);
  }
  const saveReport = async () => {
    if (!reportDirty) return;
    setReportSaving(true);
    setReportError(null);
    try {
      const res = await fetch(`/api/jobs/${id}/progress/report`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prepared_by: report.prepared_by,
          report_date: report.report_date || null,
          period_from: report.period_from || null,
          period_to: report.period_to || null,
          achievements: report.achievements,
          planned_next: report.planned_next,
          outstanding_issues: report.outstanding_issues,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      setReportDirty(false);
      setReportSaved(true);
      setTimeout(() => setReportSaved(false), 2500);
    } catch (e) {
      // Keep dirty so the user knows the save did not succeed
      setReportError(e instanceof Error ? e.message : 'Failed to save report');
    } finally {
      setReportSaving(false);
    }
  };
  const exportPdf = async () => {
    // Auto-save report first so PDF has latest data.
    // If the save fails, abort PDF generation — do not use stale data.
    if (reportDirty) {
      await saveReport();
      // saveReport sets reportError on failure and keeps reportDirty=true
      if (reportDirty) {
        // Still dirty means save failed — abort
        return;
      }
    }
    setExportingPdf(true);
    try {
      const res = await fetch(`/api/jobs/${id}/progress/report/pdf`, {
        credentials: 'include'
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('PDF export failed:', res.status, text);
        throw new Error(`PDF failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `progress-report-job-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };
  const updateLine = useCallback((lineId: number, field: keyof ProgressLine, value: number | string) => {
    setLines(prev => prev.map(l => l.id === lineId ? {
      ...l,
      [field]: value
    } : l));
    setDirty(prev => {
      const next = new Map(prev);
      const existing = next.get(lineId) ?? {};
      next.set(lineId, {
        ...existing,
        [field]: value
      });
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
        progressNote: changes.progressNote
      }));
      const res = await fetch(`/api/jobs/${id}/progress`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const data = (await res.json()) as { lines?: ProgressLine[] };
      if (data.lines) setLines(data.lines);
      setDirty(new Map());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save progress');
    } finally {
      setSaving(false);
    }
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/jobs/${id}/progress/export-csv`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${id}-progress.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {/* silent */} finally {
      setExporting(false);
    }
  };
  const overallPct = lines.length ? Math.round(lines.reduce((sum, l) => sum + l.percentComplete, 0) / lines.length) : 0;
  const title = job ? `${job.name} — Progress` : 'Job Progress';
  const hasDirty = dirty.size > 0;
  const anyDirty = hasDirty || reportDirty;
  return <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="Track and update progress for this job." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/progress`} />
      </Helmet>

      {/* ── Desktop top bar ── */}
      <div className="hidden md:flex bg-white border-b border-gray-100 px-4 py-3 items-center gap-3 shrink-0" style={{
      boxShadow: '0 1px 0 rgba(0,0,0,0.05)'
    }}>
        <button onClick={() => navigate(`/jobs/${id}`)} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors shrink-0">
          <ArrowLeft size={18} />
        </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => navigate('/home')} className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors touch-manipulation shadow-sm" title="Dashboard"><Home size={18} /></button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate text-center w-full">{job?.name ?? 'Job Progress'}</h1>
                <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
                  <button onClick={() => navigate('/jobs')} className="hover:text-violet-600 transition-colors">Jobs</button>
                  <span>/</span>
                  <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-violet-600 transition-colors truncate max-w-[80px]">{job?.name ?? '...'}</button>
                  <span>/</span>
                  <span className="text-gray-500 font-medium">Progress</span>
                </div>
              </>}
          </div>
        {anyDirty && <button onClick={() => {
        void saveAll();
        void saveReport();
      }} disabled={saving || reportSaving} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
            {saving || reportSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Changes
          </button>}
        {(saved || reportSaved) && !anyDirty && <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
            <CheckCircle2 size={13} /> Saved
          </span>}
        <button onClick={exportPdf} disabled={exportingPdf} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
          {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
          Export PDF
        </button>
        <button onClick={exportCsv} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold text-gray-600 rounded-lg transition-colors">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          CSV
        </button>
      </div>

      {/* ── Mobile: Home button only (no back arrow — home navigates to /home) ── */}
      <button onClick={() => navigate('/home')} className="md:hidden fixed z-20 w-9 h-9 rounded-xl bg-violet-50/90 backdrop-blur-sm shadow-sm border border-violet-200 flex items-center justify-center text-violet-600 active:bg-violet-100 transition-colors" style={{
      top: 'max(calc(env(safe-area-inset-top) + 8px), 12px)',
      left: '12px'
    }} aria-label="Home">
        <Home size={16} />
      </button>

      {/* ── Mobile: save + export top-right ── */}
      <div className="md:hidden fixed z-20 flex items-center gap-2" style={{
      top: 'max(calc(env(safe-area-inset-top) + 8px), 12px)',
      right: '12px'
    }}>
        {anyDirty && <button onClick={() => {
        void saveAll();
        void saveReport();
      }} disabled={saving || reportSaving} className="h-9 px-3 rounded-xl bg-cyan-500 shadow-sm flex items-center gap-1.5 text-xs font-semibold text-white active:bg-cyan-600 disabled:opacity-40 transition-colors">
            {saving || reportSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>}
        <button onClick={exportPdf} disabled={exportingPdf} className="h-9 px-3 rounded-xl bg-violet-500 shadow-sm flex items-center gap-1.5 text-xs font-semibold text-white active:bg-violet-700 disabled:opacity-40 transition-colors">
          {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
          PDF
        </button>
        <button onClick={exportCsv} disabled={exporting} className="h-9 px-3 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center gap-1.5 text-xs font-semibold text-gray-600 active:bg-gray-100 disabled:opacity-40 transition-colors">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          CSV
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-cyan-400" />
          </div> : <div className="px-4 pt-16 pb-24 md:pt-4 md:pb-6 max-w-3xl mx-auto w-full space-y-4">

            {error && <div className="flex items-center gap-2 mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertTriangle size={14} className="shrink-0" />
                {error}
              </div>}

            {/* ── Report header form ── */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
              {reportError && (
                <div className="flex items-center gap-2 mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertTriangle size={14} className="shrink-0" />
                  {reportError}
                </div>
              )}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <ClipboardList size={14} className="text-cyan-500" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Report Details</span>
              </div>
              <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><User size={10} /> Prepared By</label>
                  <input type="text" value={report.prepared_by} onChange={e => updateReport('prepared_by', e.target.value)} placeholder="Your name" className="w-full text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Calendar size={10} /> Report Date</label>
                  <input type="date" value={report.report_date} onChange={e => updateReport('report_date', e.target.value)} className="w-full text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Calendar size={10} /> Period</label>
                  <div className="flex items-center gap-1">
                    <input type="date" value={report.period_from} onChange={e => updateReport('period_from', e.target.value)} className="flex-1 min-w-0 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition" />
                    <span className="text-gray-300 text-xs shrink-0">→</span>
                    <input type="date" value={report.period_to} onChange={e => updateReport('period_to', e.target.value)} className="flex-1 min-w-0 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Achievements ── */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-100 bg-emerald-50">
                <Star size={14} className="text-emerald-500" />
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Achievements</span>
              </div>
              <div className="px-4 py-3">
                <textarea rows={3} value={report.achievements} onChange={e => updateReport('achievements', e.target.value)} placeholder="What has been completed or achieved this period…" className="w-full text-xs text-gray-800 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 transition" />
              </div>
            </div>

            {/* ── Planned Next ── */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-100 bg-blue-50">
                <Calendar size={14} className="text-blue-500" />
                <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">Planned Next</span>
              </div>
              <div className="px-4 py-3">
                <textarea rows={3} value={report.planned_next} onChange={e => updateReport('planned_next', e.target.value)} placeholder="Work planned for the next period…" className="w-full text-xs text-gray-800 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 transition" />
              </div>
            </div>

            {/* ── Outstanding Issues ── */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-red-100 bg-red-50">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-xs font-bold text-red-700 uppercase tracking-widest">Outstanding Issues</span>
              </div>
              <div className="px-4 py-3">
                <textarea rows={3} value={report.outstanding_issues} onChange={e => updateReport('outstanding_issues', e.target.value)} placeholder="Blockers, risks, or issues requiring attention…" className="w-full text-xs text-gray-800 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
              </div>
            </div>

            {/* Overall progress card */}
            <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-600 text-sm font-semibold">Overall Progress</p>
                <span className={`text-2xl font-bold ${overallPct === 100 ? 'text-emerald-600' : 'text-cyan-600'}`}>{overallPct}%</span>
              </div>
              <ProgressBar pct={overallPct} />
              <p className="text-gray-400 text-xs mt-1.5">{lines.length} line{lines.length !== 1 ? 's' : ''} · {lines.filter(l => l.percentComplete === 100).length} complete</p>
            </div>

            {/* Lines */}
            {lines.length === 0 ? <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
                <div className="w-12 h-12 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-3">
                  <TrendingUp size={22} className="text-cyan-400" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">No progress lines</p>
                <p className="text-gray-400 text-xs mt-1">Progress lines are synced from job estimates</p>
              </div> : <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
        }}>
                {/* Header row */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scope Description</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest w-28 text-center">Progress</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notes</span>
                </div>
                {lines.map((line, i) => <div key={line.id} className={`grid grid-cols-[1fr_auto_1fr] gap-3 px-4 py-2 items-center ${i !== lines.length - 1 ? 'border-b border-gray-100' : ''} ${dirty.has(line.id) ? 'bg-cyan-50/50' : ''}`}>
                    {/* Col 1: description */}
                    <p className="text-gray-800 text-xs font-medium leading-snug">{line.description}</p>

                    {/* Col 2: % badge + thin slider */}
                    <div className="w-28 flex flex-col items-center gap-1">
                      <span className={`text-xs font-bold tabular-nums ${line.percentComplete === 100 ? 'text-emerald-600' : 'text-cyan-600'}`}>
                        {line.percentComplete}%
                      </span>
                      <div className="relative w-full h-4 flex items-center">
                        <div className="absolute inset-x-0 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-200 ${line.percentComplete === 100 ? 'bg-emerald-500' : line.percentComplete >= 50 ? 'bg-cyan-500' : 'bg-amber-400'}`} style={{
                    width: `${line.percentComplete}%`
                  }} />
                        </div>
                        <input type="range" min={0} max={100} step={5} value={line.percentComplete} onChange={e => updateLine(line.id, 'percentComplete', parseInt(e.target.value))} className="absolute inset-x-0 w-full opacity-0 cursor-pointer h-4" />
                      </div>
                    </div>

                    {/* Col 3: notes */}
                    <input type="text" placeholder="Add note…" value={line.progressNote ?? ''} onChange={e => updateLine(line.id, 'progressNote', e.target.value)} className="w-full text-xs text-gray-700 placeholder-gray-300 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition" />
                  </div>)}
              </div>}
          </div>}
      </div>

      {/* ── Mobile bottom bar ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100 safe-bottom" style={{
      boxShadow: '0 -1px 0 rgba(0,0,0,0.05)'
    }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
            <TrendingUp size={15} className="text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /> : <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">{job?.name ?? 'Job Progress'}</p>
                {job?.jobNumber && <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>}
              </>}
          </div>
          <span className={`text-sm font-bold ${overallPct === 100 ? 'text-emerald-600' : 'text-cyan-600'}`}>{overallPct}%</span>
        </div>
      </div>
    </div>;
}
