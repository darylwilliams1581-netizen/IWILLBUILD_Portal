/**
 * Settings → Data & Backup
 * ─────────────────────────────────────────────────────────────────────────────
 * Action-first backup/export experience. No external cloud setup required.
 * Four primary actions: Full Backup, Company Data, Job ZIP, CSV Pack.
 */
import { useState, useEffect } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Archive,
  FileText,
  Database,
  Briefcase,
  TableProperties,
  Clock,
  BarChart3,
  ChevronDown,
  X,
} from 'lucide-react';
import UsageCards from './UsageCards';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  job_number: string | null;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <Icon size={15} className="text-violet-600 shrink-0" />
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const inputCls = (disabled: boolean) =>
  `w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 ${
    disabled ? 'opacity-50 bg-slate-50 cursor-not-allowed' : 'bg-white'
  }`;

// ─── Download action button ───────────────────────────────────────────────────

function DownloadAction({
  icon: Icon,
  label,
  description,
  filename,
  onDownload,
  loading,
  accent = 'violet',
  children,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  filename: string;
  onDownload: () => void;
  loading: boolean;
  accent?: 'violet' | 'blue' | 'emerald' | 'amber';
  children?: React.ReactNode;
}) {
  const accents = {
    violet: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100',
    blue:   'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
    emerald:'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
    amber:  'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
  };
  const btnAccents = {
    violet: 'bg-violet-600 hover:bg-violet-700 text-white',
    blue:   'bg-blue-600 hover:bg-blue-700 text-white',
    emerald:'bg-emerald-600 hover:bg-emerald-700 text-white',
    amber:  'bg-amber-600 hover:bg-amber-700 text-white',
  };

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${accents[accent]}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center shrink-0 shadow-sm">
          <Icon size={16} className="text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
          <p className="text-xs text-slate-400 mt-1 font-mono">{filename}</p>
        </div>
      </div>
      {children}
      <button
        type="button"
        onClick={onDownload}
        disabled={loading}
        className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${btnAccents[accent]}`}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {loading ? 'Preparing…' : `Download ${label}`}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DataBackupTab({ isAdmin }: { isAdmin: boolean }) {
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [loadingJobZip, setLoadingJobZip] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Job picker for Job ZIP
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [showJobPicker, setShowJobPicker] = useState(false);

  useEffect(() => {
    // Load last backup timestamp
    fetch('/api/settings/backup')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.lastBackup) setLastBackup(data.lastBackup); })
      .catch(() => {});

  }, []);

  // Load jobs when picker opens
  useEffect(() => {
    if (!showJobPicker || jobs.length) return;
    setJobsLoading(true);
    fetch('/api/jobs?limit=500&status=active')
      .then(r => r.ok ? r.json() : [])
      .then(data => setJobs(Array.isArray(data) ? data : (data.jobs ?? [])))
      .catch(() => {})
      .finally(() => setJobsLoading(false));
  }, [showJobPicker, jobs.length]);

  const filteredJobs = jobSearch.trim()
    ? jobs.filter(j =>
        j.name.toLowerCase().includes(jobSearch.toLowerCase()) ||
        (j.job_number ?? '').toLowerCase().includes(jobSearch.toLowerCase())
      )
    : jobs;

  async function triggerDownload(url: string, fallbackFilename: string, setLoading: (v: boolean) => void) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Download failed');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? fallbackFilename;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
      setLastBackup(new Date().toISOString());
      setSuccessMsg('Download started.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const handleFullBackup = () =>
    void triggerDownload('/api/settings/backup/export', `iwillbuild-backup-${today()}.zip`, setLoadingFull);

  const handleCompanyData = () =>
    void triggerDownload('/api/settings/backup/company-data', `iwillbuild-company-data-${today()}.zip`, setLoadingCompany);

  const handleCsvPack = () =>
    void triggerDownload('/api/settings/backup/csv-pack', `iwillbuild-csv-pack-${today()}.zip`, setLoadingCsv);

  const handleJobZip = () => {
    if (!selectedJob) { setShowJobPicker(true); return; }
    void triggerDownload(
      `/api/jobs/${selectedJob.id}/export-zip`,
      `iwillbuild-job-${selectedJob.job_number ?? selectedJob.id}-${today()}.zip`,
      setLoadingJobZip,
    );
  };

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Data & Backup</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Download your data anytime — no cloud setup required.
          </p>
        </div>
        {lastBackup && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 shrink-0">
            <Clock size={11} />
            Last backup {new Date(lastBackup).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* ── Feedback banners ── */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          <span className="flex-1">{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-600"><X size={13} /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <AlertCircle size={14} className="shrink-0 text-red-500" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={13} /></button>
        </div>
      )}

      {/* ── Primary download actions ── */}
      <SectionCard icon={Download} title="Download & Export">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* 1. Full Backup */}
          <DownloadAction
            icon={Archive}
            label="Full Backup"
            description="Everything — jobs, estimates, forms, fleet, users, settings, and file manifests."
            filename={`iwillbuild-backup-${today()}.zip`}
            onDownload={handleFullBackup}
            loading={loadingFull}
            accent="violet"
          />

          {/* 2. Company Data */}
          <DownloadAction
            icon={Database}
            label="Company Data"
            description="System records only — company profile, users, fleet, settings, form templates, cost guide."
            filename={`iwillbuild-company-data-${today()}.zip`}
            onDownload={handleCompanyData}
            loading={loadingCompany}
            accent="blue"
          />

          {/* 3. Job ZIP */}
          <DownloadAction
            icon={Briefcase}
            label="Job ZIP"
            description="Complete job pack — tasks, notes, attendance, delays, costs, photos & files manifests."
            filename={selectedJob
              ? `iwillbuild-job-${selectedJob.job_number ?? selectedJob.id}-${today()}.zip`
              : `iwillbuild-job-{number}-${today()}.zip`}
            onDownload={handleJobZip}
            loading={loadingJobZip}
            accent="emerald"
          >
            {/* Job selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowJobPicker(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 transition-colors"
              >
                <span className={selectedJob ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                  {selectedJob
                    ? `${selectedJob.job_number ? `#${selectedJob.job_number} · ` : ''}${selectedJob.name}`
                    : 'Select a job…'}
                </span>
                <ChevronDown size={13} className="text-slate-400 shrink-0" />
              </button>

              {showJobPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      autoFocus
                      type="text"
                      value={jobSearch}
                      onChange={e => setJobSearch(e.target.value)}
                      placeholder="Search jobs…"
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {jobsLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 size={18} className="animate-spin text-slate-300" />
                      </div>
                    ) : filteredJobs.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No jobs found</p>
                    ) : filteredJobs.map(j => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => { setSelectedJob(j); setShowJobPicker(false); setJobSearch(''); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-violet-50 transition-colors flex items-center gap-2"
                      >
                        <Briefcase size={12} className="text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700 truncate">
                          {j.job_number ? `#${j.job_number} · ` : ''}{j.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DownloadAction>

          {/* 4. CSV Pack */}
          <DownloadAction
            icon={TableProperties}
            label="CSV Pack"
            description="All major records as CSV — jobs, tasks, notes, attendance, delays, costs, fleet, users, incidents, risks."
            filename={`iwillbuild-csv-pack-${today()}.zip`}
            onDownload={handleCsvPack}
            loading={loadingCsv}
            accent="amber"
          />
        </div>

        {/* What's included note */}
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">Job ZIP contents</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs text-slate-500 font-mono">
            {[
              'job-summary.json', 'job-details.csv', 'tasks.csv',
              'notes.csv', 'attendance.csv', 'delays.csv',
              'costs.csv', 'photos/ manifest', 'files/ manifest',
              'drawings/ manifest', 'forms/ manifest',
            ].map(f => (
              <span key={f} className="flex items-center gap-1">
                <FileText size={9} className="text-slate-300 shrink-0" /> {f}
              </span>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── Plan Usage ── */}
      <SectionCard icon={BarChart3} title="Plan Usage">
        <UsageCards />
      </SectionCard>

      {/* ── CSV Import Templates ── */}
      <SectionCard icon={FileText} title="CSV Import Templates">
        <p className="text-sm text-slate-500 mb-4">
          Download template files to use with the CSV import feature in Cost Guide and Estimate Editor.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              const csv = 'description,unit,rate\nFix out labour,hr,92\n';
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'cost-guide-template.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Cost Guide Template (.csv)
          </button>
          <button
            type="button"
            onClick={() => {
              const csv = 'description,quantity,unit,rate\nSupply and install internal door,1,each,183\n';
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'estimate-template.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Estimate Lines Template (.csv)
          </button>
        </div>
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500 font-mono space-y-1">
          <p className="font-semibold text-slate-600 font-sans not-italic">Cost Guide columns:</p>
          <p>description, unit, rate</p>
          <p className="font-semibold text-slate-600 font-sans not-italic mt-2">Estimate columns:</p>
          <p>description, quantity, unit, rate</p>
        </div>
      </SectionCard>

    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
