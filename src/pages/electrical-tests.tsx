/**
 * /electrical-tests — Electrical Test Recorder
 * Job picker → record list with filters → cards (mobile) / table (desktop)
 * New/Edit record modal, Equipment register, Retest, Sign-off, PDF/CSV export.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Zap, Plus, Search, Filter, Download, FileText, Settings2,
  ChevronDown, AlertTriangle, CheckCircle2, Clock, XCircle,
  Camera, RotateCcw, ShieldCheck, Loader2, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/lib/usePermissions';
import ElecTestRecordModal from '@/components/electrical-tests/ElecTestRecordModal';
import ElecEquipmentModal from '@/components/electrical-tests/ElecEquipmentModal';
import ElecSignOffModal from '@/components/electrical-tests/ElecSignOffModal';
import ElecRetestModal from '@/components/electrical-tests/ElecRetestModal';
import { resultBadgeClass, conditionBadgeClass, formatAuDate, formatAuDateTime } from '@/lib/electrical-test-calc';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job { id: number; name: string; job_number: string; }
interface Equipment {
  id: number; owner: string | null; equipment_type: string; make_model: string;
  serial_number: string | null; calibration_expiry: string | null; calibrationExpired: boolean;
}
interface TestRecord {
  id: number; asset_id: string | null; template_name: string; circuit_feeder: string | null;
  phase: string | null; measured_value: number | null; unit: string;
  result: string; condition_class: string | null; standard_label: string | null;
  test_date: string | null; tester_name: string | null; status: string;
  photo_count: number; retest_count: number;
  equipment_make_model: string | null; equipment_cal_expiry: string | null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 border-gray-200',
    submitted: 'bg-blue-100 text-blue-700 border-blue-200',
    accepted: 'bg-green-100 text-green-700 border-green-200',
    review_required: 'bg-amber-100 text-amber-700 border-amber-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  };
  const labels: Record<string, string> = {
    draft: 'Draft', submitted: 'Submitted', accepted: 'Accepted',
    review_required: 'Review Required', rejected: 'Rejected',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ElectricalTestsPage() {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();

  // Job picker
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [showJobPicker, setShowJobPicker] = useState(false);

  // Records
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Equipment
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // Modals
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [editRecord, setEditRecord] = useState<TestRecord | null>(null);
  const [showEquipment, setShowEquipment] = useState(false);
  const [editEquipment, setEditEquipment] = useState<Equipment | null>(null);
  const [signOffRecord, setSignOffRecord] = useState<TestRecord | null>(null);
  const [retestRecord, setRetestRecord] = useState<TestRecord | null>(null);

  // Load jobs
  useEffect(() => {
    fetch('/api/jobs?status=active&limit=200')
      .then(r => r.json())
      .then(d => setJobs(d.jobs ?? d ?? []))
      .catch(() => {});
  }, []);

  // Load equipment
  const loadEquipment = useCallback(() => {
    fetch('/api/electrical-test-equipment')
      .then(r => r.json())
      .then(d => setEquipment(d.equipment ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadEquipment(); }, [loadEquipment]);

  // Load records
  const loadRecords = useCallback(() => {
    if (!selectedJob) return;
    setLoading(true);
    const params = new URLSearchParams({ jobId: String(selectedJob.id) });
    if (filterResult) params.set('result', filterResult);
    if (filterStatus) params.set('status', filterStatus);
    if (search) params.set('search', search);
    fetch(`/api/electrical-tests?${params}`)
      .then(r => r.json())
      .then(d => setRecords(d.records ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedJob, filterResult, filterStatus, search]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const filteredJobs = jobs.filter(j =>
    !jobSearch || j.name.toLowerCase().includes(jobSearch.toLowerCase()) || j.job_number.toLowerCase().includes(jobSearch.toLowerCase())
  );

  function exportCsv() {
    if (!selectedJob) return;
    window.open(`/api/electrical-tests/export/${selectedJob.id}/csv`, '_blank');
  }
  function exportPdf() {
    if (!selectedJob) return;
    window.open(`/api/electrical-tests/export/${selectedJob.id}/pdf`, '_blank');
  }

  return (
    <>
      <Helmet>
        <title>Electrical Test Recorder — IWILLBUILD</title>
        <meta name="description" content="Record electrical test results with equipment register, sign-off, and PDF report." />
        <link rel="canonical" href="https://iwillbuild.com/electrical-tests" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-20 safe-top">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => navigate('/?page=2')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
              aria-label="Back to Manage"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="p-2 rounded-lg bg-yellow-100">
              <Zap size={20} className="text-yellow-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-gray-900 text-base leading-tight">Electrical Test Recorder</h1>
              {selectedJob && (
                <p className="text-xs text-gray-500 truncate">{selectedJob.job_number} — {selectedJob.name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => { setEditEquipment(null); setShowEquipment(true); }}>
                  <Settings2 size={14} className="mr-1" />
                  <span className="hidden sm:inline">Equipment</span>
                </Button>
              )}
              {selectedJob && (
                <Button size="sm" onClick={() => setShowNewRecord(true)}>
                  <Plus size={14} className="mr-1" />
                  New Test
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Safety notice */}
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Electrical testing must only be performed by appropriately licensed and competent persons using an approved test procedure.</span>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">

          {/* Job picker */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Select Job</h2>
              {selectedJob && (
                <button onClick={() => setSelectedJob(null)} className="text-xs text-gray-400 hover:text-gray-600">Change</button>
              )}
            </div>
            {selectedJob ? (
              <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="p-2 rounded-lg bg-yellow-100"><Zap size={16} className="text-yellow-600" /></div>
                <div>
                  <p className="font-medium text-sm text-gray-900">{selectedJob.name}</p>
                  <p className="text-xs text-gray-500">{selectedJob.job_number}</p>
                </div>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search jobs…"
                  value={jobSearch}
                  onChange={e => setJobSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredJobs.slice(0, 20).map(j => (
                    <button
                      key={j.id}
                      onClick={() => { setSelectedJob(j); setJobSearch(''); }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900">{j.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{j.job_number}</span>
                    </button>
                  ))}
                  {filteredJobs.length === 0 && <p className="text-sm text-gray-400 px-3 py-2">No jobs found</p>}
                </div>
              </>
            )}
          </div>

          {/* Records */}
          {selectedJob && (
            <>
              {/* Filters */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-40">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search asset, type, tester…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 text-sm"
                  />
                </div>
                <select
                  value={filterResult}
                  onChange={e => setFilterResult(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">All Results</option>
                  <option value="PASS">Pass</option>
                  <option value="REVIEW">Review</option>
                  <option value="FAIL">Fail</option>
                  <option value="MANUAL">Manual</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="accepted">Accepted</option>
                  <option value="review_required">Review Required</option>
                </select>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download size={14} className="mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportPdf}>
                  <FileText size={14} className="mr-1" /> PDF
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : records.length === 0 ? (
                <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
                  <Zap size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">No test records yet for this job.</p>
                  <Button className="mt-4" onClick={() => setShowNewRecord(true)}>
                    <Plus size={14} className="mr-1" /> New Test Record
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3">
                    {records.map(r => (
                      <MobileCard
                        key={r.id}
                        record={r}
                        isAdmin={isAdmin}
                        onEdit={() => setEditRecord(r)}
                        onSignOff={() => setSignOffRecord(r)}
                        onRetest={() => setRetestRecord(r)}
                      />
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block bg-white rounded-xl border shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
                          <th className="text-left px-4 py-3">Asset / Connection</th>
                          <th className="text-left px-4 py-3">Test Type</th>
                          <th className="text-left px-4 py-3">Measured</th>
                          <th className="text-left px-4 py-3">Result</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-left px-4 py-3">Date</th>
                          <th className="text-left px-4 py-3">Tester</th>
                          <th className="text-left px-4 py-3">Photos</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {records.map(r => (
                          <DesktopRow
                            key={r.id}
                            record={r}
                            isAdmin={isAdmin}
                            onEdit={() => setEditRecord(r)}
                            onSignOff={() => setSignOffRecord(r)}
                            onRetest={() => setRetestRecord(r)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      {(showNewRecord || editRecord) && selectedJob && (
        <ElecTestRecordModal
          jobId={selectedJob.id}
          jobName={selectedJob.name}
          record={editRecord as Record<string, unknown> | null}
          equipment={equipment}
          onClose={() => { setShowNewRecord(false); setEditRecord(null); }}
          onSaved={() => { setShowNewRecord(false); setEditRecord(null); loadRecords(); }}
        />
      )}

      {showEquipment && (
        <ElecEquipmentModal
          equipment={editEquipment}
          onClose={() => { setShowEquipment(false); setEditEquipment(null); }}
          onSaved={() => { setShowEquipment(false); setEditEquipment(null); loadEquipment(); }}
        />
      )}

      {signOffRecord && (
        <ElecSignOffModal
          recordId={signOffRecord.id}
          currentStatus={signOffRecord.status}
          currentResult={signOffRecord.result}
          isAdmin={isAdmin}
          onClose={() => setSignOffRecord(null)}
          onSaved={() => { setSignOffRecord(null); loadRecords(); }}
        />
      )}

      {retestRecord && (
        <ElecRetestModal
          recordId={retestRecord.id}
          assetId={retestRecord.asset_id ?? ''}
          onClose={() => setRetestRecord(null)}
          onCreated={(newId) => { setRetestRecord(null); loadRecords(); }}
        />
      )}
    </>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileCard({ record: r, isAdmin, onEdit, onSignOff, onRetest }: {
  record: TestRecord; isAdmin: boolean;
  onEdit: () => void; onSignOff: () => void; onRetest: () => void;
}) {
  const mv = r.measured_value !== null ? `${r.measured_value} ${r.unit}`.trim() : '—';
  const canRetest = r.result === 'FAIL' || r.result === 'REVIEW';
  const canSignOff = r.status !== 'accepted';

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{r.asset_id ?? '—'}</p>
          <p className="text-xs text-gray-500">{r.template_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${resultBadgeClass(r.result as 'PASS' | 'REVIEW' | 'FAIL' | 'MANUAL')}`}>
            {r.result === 'MANUAL' ? 'Manual' : r.result}
          </span>
          {r.condition_class && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${conditionBadgeClass(r.condition_class as 'C4' | 'C3' | 'P2' | 'P1')}`}>
              {r.condition_class}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div><span className="text-gray-400">Measured</span><br /><span className="font-medium">{mv}</span></div>
        <div><span className="text-gray-400">Date</span><br /><span className="font-medium">{r.test_date ? formatAuDate(r.test_date.slice(0, 10)) : '—'}</span></div>
        <div><span className="text-gray-400">Tester</span><br /><span className="font-medium">{r.tester_name ?? '—'}</span></div>
        <div><span className="text-gray-400">Photos</span><br /><span className="font-medium">{r.photo_count}</span></div>
      </div>

      <div className="flex items-center justify-between">
        {statusBadge(r.status)}
        {r.retest_count > 0 && (
          <span className="text-xs text-gray-400">{r.retest_count} retest{r.retest_count > 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="flex gap-2 pt-1 border-t">
        <button onClick={onEdit} className="flex-1 text-xs text-center py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium transition-colors">Edit</button>
        {canSignOff && (
          <button onClick={onSignOff} className="flex-1 text-xs text-center py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors">Sign-off</button>
        )}
        {canRetest && (
          <button onClick={onRetest} className="flex-1 text-xs text-center py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium transition-colors">Retest</button>
        )}
      </div>
    </div>
  );
}

// ── Desktop row ───────────────────────────────────────────────────────────────

function DesktopRow({ record: r, isAdmin, onEdit, onSignOff, onRetest }: {
  record: TestRecord; isAdmin: boolean;
  onEdit: () => void; onSignOff: () => void; onRetest: () => void;
}) {
  const mv = r.measured_value !== null ? `${r.measured_value} ${r.unit}`.trim() : '—';
  const canRetest = r.result === 'FAIL' || r.result === 'REVIEW';
  const canSignOff = r.status !== 'accepted';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{r.asset_id ?? '—'}</p>
        {r.circuit_feeder && <p className="text-xs text-gray-400">{r.circuit_feeder}{r.phase ? ` / ${r.phase}` : ''}</p>}
      </td>
      <td className="px-4 py-3 text-gray-700">{r.template_name}</td>
      <td className="px-4 py-3 font-mono text-sm">{mv}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border w-fit ${resultBadgeClass(r.result as 'PASS' | 'REVIEW' | 'FAIL' | 'MANUAL')}`}>
            {r.result === 'MANUAL' ? 'Manual' : r.result}
          </span>
          {r.condition_class && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border w-fit ${conditionBadgeClass(r.condition_class as 'C4' | 'C3' | 'P2' | 'P1')}`}>
              {r.condition_class}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">{statusBadge(r.status)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{r.test_date ? formatAuDate(r.test_date.slice(0, 10)) : '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{r.tester_name ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{r.photo_count}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <button onClick={onEdit} className="px-2 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">Edit</button>
          {canSignOff && (
            <button onClick={onSignOff} className="px-2 py-1 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors">Sign-off</button>
          )}
          {canRetest && (
            <button onClick={onRetest} className="px-2 py-1 text-xs rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors">Retest</button>
          )}
        </div>
      </td>
    </tr>
  );
}
