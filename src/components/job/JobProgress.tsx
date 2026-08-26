/**
 * JobProgress — Program of Works tab in the job workspace.
 * Renders ProgramOfWorksView with API wiring.
 * Zero financial fields, zero permSeeDollars dependency.
 */
import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Download, FileText } from 'lucide-react';
import type { ProgressSection, ProgressActivity } from '@/lib/pow-types';
import type { ActivityFormValues } from '@/components/pow/ActivityForm';
import type { SectionFormValues } from '@/components/pow/SectionForm';
import ProgramOfWorksView from '@/components/pow/ProgramOfWorksView';

interface Props { jobId: number; }

export default function JobProgress({ jobId }: Props) {
  const [sections, setSections] = useState<ProgressSection[]>([]);
  const [activities, setActivities] = useState<ProgressActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/progress`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { sections: ProgressSection[]; activities: ProgressActivity[] };
      setSections(data.sections ?? []);
      setActivities(data.activities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // ── Section handlers ──────────────────────────────────────────────────────────

  async function handleCreateSection(values: SectionFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  async function handleEditSection(sectionId: number, values: SectionFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections/${sectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  async function handleDeleteSection(sectionId: number) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections/${sectionId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  async function handleReorderSections(ids: number[]) {
    const res = await fetch(`/api/jobs/${jobId}/progress/sections/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { sections: ProgressSection[] };
    setSections(data.sections);
  }

  // ── Activity handlers ─────────────────────────────────────────────────────────

  async function handleCreateActivity(values: ActivityFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleEditActivity(activityId: number, values: ActivityFormValues) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/${activityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleDeleteActivity(activityId: number) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/${activityId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? `HTTP ${res.status}`);
    }
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  async function handleUpdatePct(activityId: number, pct: number) {
    const res = await fetch(`/api/jobs/${jobId}/progress/lines/${activityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percentComplete: pct }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { activities: ProgressActivity[] };
    setActivities(data.activities);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 border border-red-200 rounded-xl text-sm">
        <AlertCircle size={16} /> {error}
        <button onClick={load} className="ml-auto text-xs underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-bold text-foreground">Program of Works</h2>
        <div className="flex items-center gap-2">
          <a
            href={`/api/jobs/${jobId}/progress/export-csv`}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors"
          >
            <Download size={13} /> CSV
          </a>
          <a
            href={`/api/jobs/${jobId}/progress/report/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors"
          >
            <FileText size={13} /> PDF Report
          </a>
        </div>
      </div>

      <ProgramOfWorksView
        jobId={jobId}
        sections={sections}
        activities={activities}
        loading={loading}
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
    </div>
  );
}
