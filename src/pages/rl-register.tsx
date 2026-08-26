/**
 * /rl-register — Job Site RL Register
 *
 * Workflow:
 *   1. Select a job
 *   2. Create / select a benchmark
 *   3. Add level points
 *   4. View calculated differences, tolerance results
 *   5. Export PDF / CSV
 *
 * Calculations are performed client-side using rl-calc.ts helpers.
 * All data is saved server-side, company-scoped.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Plus, Download, FileText, Search,
  ChevronDown, ChevronRight, Ruler, AlertTriangle,
  Edit2, Archive, Copy, Filter, X, CheckCircle,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import {
  calcDiffFromTarget, calcRiseFall, evalTolerance,
  formatDiffShort, formatMmShort, formatRL,
  metresToMm, parseRL, isValidRL,
  type ToleranceResult,
} from '@/lib/rl-calc';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job { id: number; name: string; job_number: string; }
interface Benchmark {
  id: number; jobId: number; name: string; rl: number;
  description?: string; location?: string; dateEstablished?: string;
  enteredBy?: string; notes?: string; pointCount: number;
  createdAt: string;
}
interface RLPoint {
  id: number; benchmarkId: number; pointName: string; location?: string;
  measuredRl: number; targetRl?: number | null; toleranceMm?: number | null;
  riseFall?: number | null; measurementDate?: string; enteredBy?: string;
  method: string; notes?: string; archivedAt?: string | null;
  createdAt: string;
}

const METHOD_LABELS: Record<string, string> = {
  laser_level: 'Laser level',
  dumpy: 'Dumpy/automatic level',
  total_station: 'Total station',
  gnss: 'GNSS',
  other: 'Other',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resultIcon(result: ToleranceResult) {
  if (result === 'HIGH') return <TrendingUp size={13} className="text-red-500 shrink-0" />;
  if (result === 'LOW')  return <TrendingDown size={13} className="text-blue-500 shrink-0" />;
  return <Minus size={13} className="text-green-600 shrink-0" />;
}

function resultBadge(result: ToleranceResult) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold';
  if (result === 'HIGH') return <span className={`${base} bg-red-100 text-red-700`}>{resultIcon(result)} HIGH</span>;
  if (result === 'LOW')  return <span className={`${base} bg-blue-100 text-blue-700`}>{resultIcon(result)} LOW</span>;
  return <span className={`${base} bg-green-100 text-green-700`}>{resultIcon(result)} ON LEVEL</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RlRegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState<Benchmark | null>(null);
  const [points, setPoints] = useState<RLPoint[]>([]);
  const [search, setSearch] = useState('');
  const [filterResult, setFilterResult] = useState<ToleranceResult | 'ALL'>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Modals
  const [showBmModal, setShowBmModal] = useState(false);
  const [showPointModal, setShowPointModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState<RLPoint | null>(null);

  // ── Load jobs ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/jobs/search?status=active&limit=100')
      .then(r => r.json())
      .then(d => setJobs(d.jobs ?? []))
      .catch(() => setError('Failed to load jobs'));
  }, []);

  // Pre-select job from URL param
  useEffect(() => {
    const jid = searchParams.get('jobId');
    if (jid && jobs.length) {
      const j = jobs.find(x => String(x.id) === jid);
      if (j) setSelectedJob(j);
    }
  }, [searchParams, jobs]);

  // ── Load benchmarks when job selected ─────────────────────────────────────
  const loadBenchmarks = useCallback(async (jobId: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/rl-register?jobId=${jobId}`);
      const d = await r.json();
      setBenchmarks(d.benchmarks ?? []);
    } catch { setError('Failed to load benchmarks'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (selectedJob) {
      loadBenchmarks(selectedJob.id);
      setSelectedBenchmark(null);
      setPoints([]);
    }
  }, [selectedJob, loadBenchmarks]);

  // ── Load points when benchmark selected ───────────────────────────────────
  const loadPoints = useCallback(async (bmId: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/rl-register/${bmId}/points`);
      const d = await r.json();
      setPoints(d.points ?? []);
    } catch { setError('Failed to load points'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (selectedBenchmark) loadPoints(selectedBenchmark.id);
  }, [selectedBenchmark, loadPoints]);

  // ── Filtered + searched points ─────────────────────────────────────────────
  const filteredPoints = points.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.pointName.toLowerCase().includes(q)
      || (p.location ?? '').toLowerCase().includes(q)
      || (p.enteredBy ?? '').toLowerCase().includes(q);

    let matchFilter = true;
    if (filterResult !== 'ALL' && p.targetRl !== null && p.targetRl !== undefined) {
      const result = evalTolerance(p.measuredRl, p.targetRl, p.toleranceMm ?? 0);
      matchFilter = result === filterResult;
    }
    return matchSearch && matchFilter;
  });

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportCsv() {
    if (!selectedJob) return;
    window.open(`/api/rl-register/export/${selectedJob.id}/csv`, '_blank');
  }
  function exportPdf() {
    if (!selectedJob) return;
    window.open(`/api/rl-register/export/${selectedJob.id}/pdf`, '_blank');
  }

  // ── Archive point ──────────────────────────────────────────────────────────
  async function archivePoint(id: number) {
    if (!confirm('Archive this point? It will be hidden from the register.')) return;
    await fetch(`/api/rl-register/points/${id}`, { method: 'DELETE' });
    if (selectedBenchmark) loadPoints(selectedBenchmark.id);
  }

  // ── Duplicate point ────────────────────────────────────────────────────────
  function duplicatePoint(p: RLPoint) {
    setEditingPoint({ ...p, id: 0, pointName: `${p.pointName} (copy)` });
    setShowPointModal(true);
  }

  return (
    <>
      <Helmet>
        <title>RL Register — IWILLBUILD</title>
        <meta name="description" content="Job Site RL Register — record site levels and calculate rise/fall differences." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="flex flex-col min-h-screen bg-background">
        {/* ── Header ── */}
        <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/?page=2')}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Ruler size={18} className="text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="font-bold text-sm text-foreground leading-tight">RL Register</h1>
              <p className="text-xs text-muted-foreground leading-tight">Job Site Level Register</p>
            </div>
          </div>
          {selectedJob && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                title="Export CSV"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={exportPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                title="Export PDF"
              >
                <FileText size={13} /> PDF
              </button>
            </div>
          )}
        </div>

        {/* ── Disclaimer ── */}
        <div className="mx-4 mt-3 mb-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">
            Calculation and record-keeping tool only. Accuracy depends on the measuring equipment and procedure used.
            Do not use phone GPS or AR measurements for survey, structural or compliance-critical set-out.
          </p>
        </div>

        {error && (
          <div className="mx-4 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
        )}

        <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-5xl w-full mx-auto">

          {/* ── Step 1: Job picker ── */}
          <section>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">1. Select Job</p>
            <div className="relative">
              <select
                value={selectedJob?.id ?? ''}
                onChange={e => {
                  const j = jobs.find(x => x.id === Number(e.target.value));
                  setSelectedJob(j ?? null);
                }}
                className="w-full appearance-none bg-card border border-border rounded-xl px-4 py-3 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— Select a job —</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.job_number} — {j.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </section>

          {selectedJob && (
            <>
              {/* ── Step 2: Benchmarks ── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">2. Benchmark</p>
                  <button
                    onClick={() => setShowBmModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
                  >
                    <Plus size={12} /> New Benchmark
                  </button>
                </div>

                {loading && !benchmarks.length ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
                ) : benchmarks.length === 0 ? (
                  <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center">
                    <p className="text-sm text-muted-foreground">No benchmarks yet. Create one to start recording levels.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {benchmarks.map(bm => (
                      <button
                        key={bm.id}
                        onClick={() => setSelectedBenchmark(bm.id === selectedBenchmark?.id ? null : bm)}
                        className={`flex items-start gap-3 bg-card border rounded-xl p-4 text-left transition-all ${
                          selectedBenchmark?.id === bm.id
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Ruler size={18} className="text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-foreground">{bm.name}</p>
                          <p className="text-xs text-primary font-mono font-bold">RL {formatRL(bm.rl)} m</p>
                          {bm.location && <p className="text-xs text-muted-foreground mt-0.5 truncate">{bm.location}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{bm.pointCount} point{bm.pointCount !== 1 ? 's' : ''}</p>
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Step 3: Points ── */}
              {selectedBenchmark && (
                <section>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">3. Level Points</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Benchmark: <span className="font-bold text-foreground">{selectedBenchmark.name}</span>
                        {' '}— RL <span className="font-mono text-primary">{formatRL(selectedBenchmark.rl)} m</span>
                      </p>
                    </div>
                    <button
                      onClick={() => { setEditingPoint(null); setShowPointModal(true); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
                    >
                      <Plus size={12} /> Add Point
                    </button>
                  </div>

                  {/* Search + filter */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <div className="relative flex-1 min-w-[160px]">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search points…"
                        className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Filter size={12} className="text-muted-foreground" />
                      {(['ALL', 'HIGH', 'LOW', 'ON_LEVEL'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setFilterResult(f)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            filterResult === f
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-card border border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {f === 'ON_LEVEL' ? 'On Level' : f === 'ALL' ? 'All' : f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/60 border-b border-border">
                          {['Point', 'Location', 'Measured RL', 'Target RL', 'Difference', 'Result', 'Date', 'Entered by', ''].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPoints.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                              {points.length === 0 ? 'No points recorded yet.' : 'No points match your filter.'}
                            </td>
                          </tr>
                        ) : filteredPoints.map(p => {
                          const hasDiff = p.targetRl !== null && p.targetRl !== undefined;
                          const diffM = hasDiff ? calcDiffFromTarget(p.measuredRl, p.targetRl!) : null;
                          const result = hasDiff ? evalTolerance(p.measuredRl, p.targetRl!, p.toleranceMm ?? 0) : null;
                          return (
                            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2.5 font-bold text-foreground">{p.pointName}</td>
                              <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{p.location ?? '—'}</td>
                              <td className="px-3 py-2.5 font-mono font-bold text-foreground">{formatRL(p.measuredRl)} m</td>
                              <td className="px-3 py-2.5 font-mono text-muted-foreground">
                                {hasDiff ? `${formatRL(p.targetRl!)} m` : '—'}
                                {p.toleranceMm ? <span className="text-muted-foreground/60 ml-1">±{p.toleranceMm}mm</span> : null}
                              </td>
                              <td className="px-3 py-2.5 font-mono">
                                {diffM !== null ? (
                                  <span className={diffM > 0 ? 'text-red-600' : diffM < 0 ? 'text-blue-600' : 'text-green-600'}>
                                    {formatDiffShort(diffM)}
                                    <span className="text-muted-foreground ml-1">({formatMmShort(diffM)})</span>
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-2.5">{result ? resultBadge(result) : '—'}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                                {p.measurementDate ? String(p.measurementDate).slice(0, 10) : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground">{p.enteredBy ?? '—'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => { setEditingPoint(p); setShowPointModal(true); }} className="p-1 rounded hover:bg-muted transition-colors" title="Edit"><Edit2 size={12} /></button>
                                  <button onClick={() => duplicatePoint(p)} className="p-1 rounded hover:bg-muted transition-colors" title="Duplicate"><Copy size={12} /></button>
                                  <button onClick={() => archivePoint(p.id)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground" title="Archive"><Archive size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden flex flex-col gap-3">
                    {filteredPoints.length === 0 ? (
                      <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          {points.length === 0 ? 'No points recorded yet.' : 'No points match your filter.'}
                        </p>
                      </div>
                    ) : filteredPoints.map(p => {
                      const hasDiff = p.targetRl !== null && p.targetRl !== undefined;
                      const diffM = hasDiff ? calcDiffFromTarget(p.measuredRl, p.targetRl!) : null;
                      const result = hasDiff ? evalTolerance(p.measuredRl, p.targetRl!, p.toleranceMm ?? 0) : null;
                      return (
                        <div key={p.id} className="bg-card border border-border rounded-xl p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="font-bold text-sm text-foreground">{p.pointName}</p>
                              {p.location && <p className="text-xs text-muted-foreground">{p.location}</p>}
                            </div>
                            {result && resultBadge(result)}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div>
                              <span className="text-muted-foreground">Measured RL</span>
                              <p className="font-mono font-bold text-foreground">{formatRL(p.measuredRl)} m</p>
                            </div>
                            {hasDiff && (
                              <div>
                                <span className="text-muted-foreground">Target RL</span>
                                <p className="font-mono text-muted-foreground">{formatRL(p.targetRl!)} m</p>
                              </div>
                            )}
                            {diffM !== null && (
                              <div>
                                <span className="text-muted-foreground">Difference</span>
                                <p className={`font-mono font-bold ${diffM > 0 ? 'text-red-600' : diffM < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                  {formatDiffShort(diffM)} ({formatMmShort(diffM)})
                                </p>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Method</span>
                              <p className="text-foreground">{METHOD_LABELS[p.method] ?? p.method}</p>
                            </div>
                            {p.enteredBy && (
                              <div>
                                <span className="text-muted-foreground">Entered by</span>
                                <p className="text-foreground">{p.enteredBy}</p>
                              </div>
                            )}
                            {p.measurementDate && (
                              <div>
                                <span className="text-muted-foreground">Date</span>
                                <p className="text-foreground">{String(p.measurementDate).slice(0, 10)}</p>
                              </div>
                            )}
                          </div>
                          {p.notes && <p className="text-xs text-muted-foreground mt-2 italic">{p.notes}</p>}
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                            <button onClick={() => { setEditingPoint(p); setShowPointModal(true); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"><Edit2 size={11} /> Edit</button>
                            <button onClick={() => duplicatePoint(p)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"><Copy size={11} /> Duplicate</button>
                            <button onClick={() => archivePoint(p.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors ml-auto"><Archive size={11} /> Archive</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Benchmark Modal ── */}
      {showBmModal && selectedJob && (
        <BenchmarkModal
          jobId={selectedJob.id}
          onClose={() => setShowBmModal(false)}
          onSaved={() => { setShowBmModal(false); loadBenchmarks(selectedJob.id); }}
        />
      )}

      {/* ── Point Modal ── */}
      {showPointModal && selectedBenchmark && (
        <PointModal
          benchmark={selectedBenchmark}
          editing={editingPoint}
          onClose={() => { setShowPointModal(false); setEditingPoint(null); }}
          onSaved={() => { setShowPointModal(false); setEditingPoint(null); loadPoints(selectedBenchmark.id); loadBenchmarks(selectedJob!.id); }}
        />
      )}
    </>
  );
}

// ── Benchmark Modal ───────────────────────────────────────────────────────────

function BenchmarkModal({ jobId, onClose, onSaved }: { jobId: number; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState({ name: '', rl: '', description: '', location: '', dateEstablished: '', enteredBy: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Rise/fall calculator
  const [rfBmRl, setRfBmRl] = useState('');
  const [rfValue, setRfValue] = useState('');
  const rfResult = rfBmRl && rfValue && isValidRL(rfBmRl) && isValidRL(rfValue)
    ? calcRiseFall(parseRL(rfBmRl), parseRL(rfValue))
    : null;

  async function save() {
    if (!form.name.trim()) return setErr('Benchmark name is required');
    if (!isValidRL(form.rl)) return setErr('Enter a valid RL (e.g. 100.000)');
    setSaving(true);
    try {
      const r = await fetch('/api/rl-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, ...form, rl: parseRL(form.rl) }),
      });
      if (!r.ok) { const d = await r.json(); return setErr(d.error ?? 'Failed to save'); }
      onSaved();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base">New Benchmark</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          <Field label="Benchmark name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Front boundary survey mark" />
          <Field label="Benchmark RL (m) *" value={form.rl} onChange={v => setForm(f => ({ ...f, rl: v }))} placeholder="e.g. 100.000" mono />
          <Field label="Description / location" value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} placeholder="e.g. Concrete nail in kerb, front boundary" />
          <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Additional description" />
          <Field label="Date established" value={form.dateEstablished} onChange={v => setForm(f => ({ ...f, dateEstablished: v }))} type="date" />
          <Field label="Entered by" value={form.enteredBy} onChange={v => setForm(f => ({ ...f, enteredBy: v }))} placeholder="Name" />
          <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Optional notes" multiline />

          {/* Rise/fall helper */}
          <div className="bg-muted/40 rounded-xl p-3 mt-1">
            <p className="text-xs font-bold text-muted-foreground mb-2">Rise/Fall Calculator (optional helper)</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Known RL (m)" value={rfBmRl} onChange={setRfBmRl} placeholder="100.000" mono />
              <Field label="Rise (+) / Fall (−)" value={rfValue} onChange={setRfValue} placeholder="+0.250 or −0.180" mono />
            </div>
            {rfResult !== null && (
              <div className="mt-2 flex items-center gap-2">
                <CheckCircle size={13} className="text-green-600" />
                <p className="text-xs font-mono font-bold text-green-700">
                  Calculated RL = {formatRL(rfResult)} m
                </p>
                <button
                  onClick={() => setForm(f => ({ ...f, rl: formatRL(rfResult) }))}
                  className="ml-auto text-xs text-primary underline underline-offset-2"
                >
                  Use this RL
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Benchmark'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Point Modal ───────────────────────────────────────────────────────────────

function PointModal({ benchmark, editing, onClose, onSaved }: {
  benchmark: Benchmark; editing: RLPoint | null;
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = editing !== null && editing.id !== 0;
  const [form, setForm] = useState({
    pointName: editing?.pointName ?? '',
    location: editing?.location ?? '',
    measuredRl: editing ? formatRL(editing.measuredRl) : '',
    targetRl: editing?.targetRl !== null && editing?.targetRl !== undefined ? formatRL(editing.targetRl) : '',
    toleranceMm: editing?.toleranceMm !== null && editing?.toleranceMm !== undefined ? String(editing.toleranceMm) : '',
    riseFall: editing?.riseFall !== null && editing?.riseFall !== undefined ? String(editing.riseFall) : '',
    measurementDate: editing?.measurementDate ? String(editing.measurementDate).slice(0, 16) : '',
    enteredBy: editing?.enteredBy ?? '',
    method: editing?.method ?? 'laser_level',
    notes: editing?.notes ?? '',
    correctionNote: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Rise/fall from benchmark helper
  const [rfValue, setRfValue] = useState('');
  const rfResult = rfValue && isValidRL(rfValue)
    ? calcRiseFall(benchmark.rl, parseRL(rfValue))
    : null;

  // Live diff preview
  const measuredNum = isValidRL(form.measuredRl) ? parseRL(form.measuredRl) : null;
  const targetNum = form.targetRl && isValidRL(form.targetRl) ? parseRL(form.targetRl) : null;
  const tolNum = form.toleranceMm ? parseInt(form.toleranceMm, 10) : 0;
  const diffPreview = measuredNum !== null && targetNum !== null
    ? calcDiffFromTarget(measuredNum, targetNum) : null;
  const resultPreview = diffPreview !== null && targetNum !== null && measuredNum !== null
    ? evalTolerance(measuredNum, targetNum, tolNum) : null;

  async function save() {
    if (!form.pointName.trim()) return setErr('Point name is required');
    if (!isValidRL(form.measuredRl)) return setErr('Enter a valid measured RL (e.g. 99.750)');
    if (form.targetRl && !isValidRL(form.targetRl)) return setErr('Target RL must be a valid number');

    setSaving(true);
    try {
      const body = {
        pointName: form.pointName,
        location: form.location || null,
        measuredRl: parseRL(form.measuredRl),
        targetRl: form.targetRl ? parseRL(form.targetRl) : null,
        toleranceMm: form.toleranceMm ? parseInt(form.toleranceMm, 10) : null,
        riseFall: form.riseFall ? parseFloat(form.riseFall) : null,
        measurementDate: form.measurementDate || null,
        enteredBy: form.enteredBy || null,
        method: form.method,
        notes: form.notes || null,
        ...(isEdit ? { correctionNote: form.correctionNote || null } : {}),
      };

      const url = isEdit
        ? `/api/rl-register/points/${editing!.id}`
        : `/api/rl-register/${benchmark.id}/points`;
      const method = isEdit ? 'PUT' : 'POST';

      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); return setErr(d.error ?? 'Failed to save'); }
      onSaved();
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-base">{isEdit ? 'Edit Point' : 'Add Level Point'}</h2>
            <p className="text-xs text-muted-foreground">Benchmark: {benchmark.name} — RL {formatRL(benchmark.rl)} m</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          <Field label="Point name / number *" value={form.pointName} onChange={v => setForm(f => ({ ...f, pointName: v }))} placeholder="e.g. FFL Slab NE corner" />
          <Field label="Location / description" value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} placeholder="e.g. North-east corner of slab" />

          {/* Rise/fall from benchmark helper */}
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-xs font-bold text-muted-foreground mb-2">Rise/Fall from Benchmark (optional helper)</p>
            <p className="text-xs text-muted-foreground mb-2">Benchmark RL: <span className="font-mono font-bold text-foreground">{formatRL(benchmark.rl)} m</span></p>
            <Field label="Rise (+) / Fall (−) in metres" value={rfValue} onChange={setRfValue} placeholder="+0.250 or −0.180" mono />
            {rfResult !== null && (
              <div className="mt-2 flex items-center gap-2">
                <CheckCircle size={13} className="text-green-600" />
                <p className="text-xs font-mono font-bold text-green-700">Point RL = {formatRL(rfResult)} m</p>
                <button
                  onClick={() => setForm(f => ({ ...f, measuredRl: formatRL(rfResult) }))}
                  className="ml-auto text-xs text-primary underline underline-offset-2"
                >
                  Use this RL
                </button>
              </div>
            )}
          </div>

          <Field label="Measured RL (m) *" value={form.measuredRl} onChange={v => setForm(f => ({ ...f, measuredRl: v }))} placeholder="e.g. 99.750" mono />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Target RL (m)" value={form.targetRl} onChange={v => setForm(f => ({ ...f, targetRl: v }))} placeholder="e.g. 99.500" mono />
            <Field label="Tolerance (mm)" value={form.toleranceMm} onChange={v => setForm(f => ({ ...f, toleranceMm: v }))} placeholder="e.g. 5" />
          </div>

          {/* Live diff preview */}
          {diffPreview !== null && resultPreview !== null && (
            <div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${
              resultPreview === 'HIGH' ? 'bg-red-50 border border-red-200'
              : resultPreview === 'LOW' ? 'bg-blue-50 border border-blue-200'
              : 'bg-green-50 border border-green-200'
            }`}>
              {resultIcon(resultPreview)}
              <div>
                <p className="text-xs font-bold">
                  {formatDiffShort(diffPreview)} ({formatMmShort(diffPreview)})
                </p>
                <p className="text-xs text-muted-foreground">
                  {resultPreview === 'ON_LEVEL' ? 'On level' : resultPreview === 'HIGH' ? 'Above target' : 'Below target'}
                  {tolNum > 0 ? ` — tolerance ±${tolNum} mm` : ''}
                </p>
              </div>
              {resultBadge(resultPreview)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Measurement date/time" value={form.measurementDate} onChange={v => setForm(f => ({ ...f, measurementDate: v }))} type="datetime-local" />
            <Field label="Entered by" value={form.enteredBy} onChange={v => setForm(f => ({ ...f, enteredBy: v }))} placeholder="Name" />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">Measurement method</label>
            <select
              value={form.method}
              onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Optional notes" multiline />

          {isEdit && (
            <Field
              label="Correction note (required if reading was signed off)"
              value={form.correctionNote}
              onChange={v => setForm(f => ({ ...f, correctionNote: v }))}
              placeholder="Reason for correction"
              multiline
            />
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Point'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, type = 'text', mono = false, multiline = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean; multiline?: boolean;
}) {
  const cls = `w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${mono ? 'font-mono' : ''}`;
  return (
    <div>
      <label className="block text-xs font-bold text-muted-foreground mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} className={`${cls} resize-none`} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} className={cls} />
      )}
    </div>
  );
}
