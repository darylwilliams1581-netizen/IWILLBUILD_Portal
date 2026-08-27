/**
 * /jobs/:id/progress — Full-screen Program of Works page for a job.
 * Shows ProgramOfWorksView + Progress Report narrative section.
 * Zero financial fields, zero permSeeDollars dependency.
 * Path B standalone page — reached via Work & Field launcher.
 * @seo-exempt
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  TrendingUp, Loader2, Download, Save, CheckCircle2,
  FileText, AlertCircle, ClipboardList,
} from 'lucide-react';
import type { ProgressSection, ProgressActivity } from '@/lib/pow-types';
import type { ActivityFormValues } from '@/components/pow/ActivityForm';
import type { SectionFormValues } from '@/components/pow/SectionForm';
import ProgramOfWorksView from '@/components/pow/ProgramOfWorksView';
import JobFeatureShell from '@/components/job/JobFeatureShell';

interface Job { id: number; name: string; jobNumber?: string | null; }

interface ProgressReport {
  prepared_by: string;
  report_date: string;
  period_from: string;
  period_to: string;
  achievements: string;
  planned_next: string;
  outstanding_issues: string;
}

const EMPTY_REPORT: ProgressReport = {
  prepared_by: '', report_date: '', period_from: '', period_to: '',
  achievements: '', planned_next: '', outstanding_issues: '',
};

export default function JobProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = id ? parseInt(id, 10) : NaN;

  const [job, setJob] = useState<Job | null>(null);
  const [sections, setSections] = useState<ProgressSection[]>([]);
  const [activities, setActivities] = useState<ProgressActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Progress Report narrative
  const [report, setReport] = useState<ProgressReport>(EMPTY_REPORT);
  const [reportDirty, setReportDirty] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id || isNaN(jobId)) { setLoading(false); return; }
    try {
      const [jobRes, powRes, reportRes] = await Promise.all([
        fetch(`/api/jobs/${id}`, { credentials: 'include' }),
        fetch(`/api/jobs/${id}/progress`, { credentials: 'include' }),
        fetch(`/api/jobs/${id}/progress/report`, { credentials: 'include' }),
      ]);

      if (jobRes.ok) {
        const d = await jobRes.json() as { job?: Job } | Job;
        const j = d && typeof d === 'object' && 'job' in d ? d.job : d as Job;
        setJob(j ?? null);
      }

      if (powRes.ok) {
        const d = await powRes.json() as { sections: ProgressSection[]; activities: ProgressActivity[] };
        setSections(d.sections ?? []);
        setActivities(d.activities ?? []);
      }

      if (reportRes.ok) {
        const d = await reportRes.json() as { report?: Partial<ProgressReport> | null };
        if (d.report) {
          setReport({
            prepared_by: String(d.report.prepared_by ?? ''),
            report_date: String(d.report.report_date ?? '').slice(0, 10),
            period_from: String(d.report.period_from ?? '').slice(0, 10),
            period_to: String(d.report.period_to ?? '').slice(0, 10),
            achievements: String(d.report.achievements ?? ''),
            planned_next: String(d.report.planned_next ?? ''),
            outstanding_issues: String(d.report.outstanding_issues ?? ''),
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, jobId]);

  useEffect(() => { load(); }, [load]);

  // ── Report save ───────────────────────────────────────────────────────────────

  async function saveReport() {
    if (!id) return;
    setReportSaving(true); setReportError(null); setReportSaved(false);
    try {
      const res = await fetch(`/api/jobs/${id}/progress/report`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReportDirty(false); setReportSaved(true);
      setTimeout(() => setReportSaved(false), 3000);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setReportSaving(false);
    }
  }

  function updateReport(field: keyof ProgressReport, value: string) {
    setReport((r) => ({ ...r, [field]: value }));
    setReportDirty(true);
    setReportSaved(false);
  }

  // ── Section handlers ──────────────────────────────────────────────────────────

  async function handleCreateSection(values: SectionFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  async function handleEditSection(sectionId: number, values: SectionFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections/${sectionId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  async function handleDeleteSection(sectionId: number) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections/${sectionId}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  async function handleReorderSections(ids: number[]) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections/reorder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  // ── Activity handlers ─────────────────────────────────────────────────────────

  async function handleCreateActivity(values: ActivityFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleEditActivity(activityId: number, values: ActivityFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/${activityId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleDeleteActivity(activityId: number) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/${activityId}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleDuplicateActivity(activityId: number) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/${activityId}/duplicate`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleReorderActivities(ids: number[]) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/reorder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleUpdatePct(activityId: number, pct: number) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/${activityId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percentComplete: pct }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  function handleChangeJob() {
    navigate('/?picker=progress');
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const pageTitle = job ? `Progress — ${job.jobNumber ? `#${job.jobNumber} ` : ''}${job.name}` : 'Program of Works';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 border border-red-200 rounded-xl m-4 text-sm">
        <AlertCircle size={16} /> {error}
        <button onClick={load} className="ml-auto text-xs underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>{pageTitle} — IWILLBUILD</title>
        <meta name="description" content="Program of Works — manage activities, sections, progress and scheduling for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/progress`} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <h1 className="sr-only">{pageTitle}</h1>

      <div className="portal-content flex flex-col p-0">
        <JobFeatureShell
          Icon={TrendingUp}
          featureLabel="Progress"
          jobName={job?.name ?? 'Job'}
          jobNumber={job?.jobNumber}
          backTo="/home"
          onChangeJob={handleChangeJob}
        >
          <div className="flex flex-col gap-6 p-4 pb-safe max-w-6xl mx-auto w-full">
            {/* Export actions */}
            <div className="flex items-center gap-2 justify-end">
              <a
                href={`/api/jobs/${jobId}/progress/export-csv`}
                download
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors min-h-[44px]"
              >
                <Download size={13} /> CSV
              </a>
              <a
                href={`/api/jobs/${jobId}/progress/report/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors min-h-[44px]"
              >
                <FileText size={13} /> PDF Report
              </a>
            </div>

            {/* Program of Works */}
            <ProgramOfWorksView
              jobId={jobId}
              sections={sections}
              activities={activities}
              loading={false}
              onCreateSection={handleCreateSection}
              onEditSection={handleEditSection}
              onDeleteSection={handleDeleteSection}
              onReorderSections={handleReorderSections}
              onCreateActivity={handleCreateActivity}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivity}
              onDuplicateActivity={handleDuplicateActivity}
              onReorderActivities={handleReorderActivities}
              onUpdatePct={handleUpdatePct}
            />

            {/* ── Progress Report narrative ─────────────────────────────────────────── */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
                <ClipboardList size={15} className="text-primary" />
                <h2 className="text-sm font-bold text-foreground">Progress Report Narrative</h2>
                <span className="text-xs text-muted-foreground ml-1">— optional written summary</span>
              </div>

              <div className="p-4 flex flex-col gap-4">
                {/* Meta row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {([
                    ['prepared_by', 'Prepared by'],
                    ['report_date', 'Report date'],
                    ['period_from', 'Period from'],
                    ['period_to', 'Period to'],
                  ] as [keyof ProgressReport, string][]).map(([field, label]) => (
                    <div key={field}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>
                      <input
                        type={field === 'prepared_by' ? 'text' : 'date'}
                        value={report[field]}
                        onChange={(e) => updateReport(field, e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  ))}
                </div>

                {/* Narrative fields */}
                {([
                  ['achievements', 'Achievements this period'],
                  ['planned_next', 'Planned next period'],
                  ['outstanding_issues', 'Outstanding issues / risks'],
                ] as [keyof ProgressReport, string][]).map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>
                    <textarea
                      value={report[field]}
                      onChange={(e) => updateReport(field, e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  </div>
                ))}

                {/* Save button */}
                <div className="flex items-center gap-3 justify-end">
                  {reportError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={11} /> {reportError}
                    </p>
                  )}
                  {reportSaved && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Saved
                    </p>
                  )}
                  <button
                    onClick={saveReport}
                    disabled={!reportDirty || reportSaving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
                  >
                    {reportSaving
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Save size={13} />}
                    Save report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </JobFeatureShell>
      </div>
    </div>
  );
}
