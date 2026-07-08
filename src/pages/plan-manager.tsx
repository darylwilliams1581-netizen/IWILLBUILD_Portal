/**
 * /plan-manager — Plan Manager module page.
 * Drawings are grouped by job (file manager view).
 * No direct upload here — drawings are added via the job's Drawings tab.
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Map, Archive, Layers } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobContextTab from '@/components/JobContextTab';
import PlanManagerList from '@/components/PlanManager/PlanManagerList';
import DrawingViewer from '@/components/PlanManager/DrawingViewer';
import { usePlanManager } from '@/components/PlanManager/usePlanManager';
import type { Drawing } from '@/components/PlanManager/types';

type Tab = 'active' | 'archived';

interface JobGroup {
  jobId: number;
  jobName: string;
  jobNumber: string;
  jobStatus: string;
  drawings: Drawing[];
}

export default function PlanManagerPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [jobs, setJobs] = useState<JobGroup[]>([]);
  const [unassigned, setUnassigned] = useState<Drawing[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const hook = usePlanManager();
  const { state, loadDrawing, closeDrawing } = hook;

  const loadAll = useCallback(async (t: Tab) => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/plan-manager/jobs-with-drawings?status=${t}`, { credentials: 'include' });
      const data = await res.json() as { jobs?: JobGroup[]; unassigned?: Drawing[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setJobs(data.jobs ?? []);
      setUnassigned(data.unassigned ?? []);
    } catch {
      setJobs([]);
      setUnassigned([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(tab);
  }, [tab, loadAll]);

  const handleOpen = useCallback(async (id: number) => {
    await loadDrawing(id);
  }, [loadDrawing]);

  const handleArchive = useCallback(async (id: number) => {
    await fetch(`/api/plan-manager/drawings/${id}/archive`, { method: 'POST', credentials: 'include' });
    await loadAll(tab);
  }, [tab, loadAll]);

  const handleRestore = useCallback(async (id: number) => {
    await fetch(`/api/plan-manager/drawings/${id}/restore`, { method: 'POST', credentials: 'include' });
    await loadAll(tab);
  }, [tab, loadAll]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Permanently delete this drawing? This cannot be undone.')) return;
    await fetch(`/api/plan-manager/drawings/${id}/permanent`, { method: 'DELETE', credentials: 'include' });
    await loadAll(tab);
  }, [tab, loadAll]);

  const handleReorder = useCallback(async (drawingId: number, direction: 'up' | 'down', jobId?: number) => {
    await fetch(`/api/plan-manager/drawings/${drawingId}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ direction, jobId }),
    });
    await loadAll(tab);
  }, [tab, loadAll]);

  const handleViewerClose = useCallback(async () => {
    closeDrawing();
    await loadAll(tab);
  }, [closeDrawing, tab, loadAll]);

  return (
    <>
      <Helmet>
        <title>Plan Manager — IWILLBUILD</title>
        <meta name="description" content="Upload, annotate and share construction drawings with your team." />
        <link rel="canonical" href="https://iwillbuild.com/plan-manager" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
        <PortalSidebar />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Page header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-700/50 flex-shrink-0 bg-slate-900">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Map size={18} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">Plan Manager</h1>
              <p className="text-xs text-slate-500">Browse and manage drawings across all jobs</p>
            </div>

            <div className="flex-1" />

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1 border border-slate-700">
              <button
                onClick={() => setTab('active')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  tab === 'active' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                <Layers size={12} /> Active
              </button>
              <button
                onClick={() => setTab('archived')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  tab === 'archived' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                <Archive size={12} /> Archived
              </button>
            </div>
          </div>

          {/* List */}
          <PlanManagerList
            jobs={jobs}
            unassigned={unassigned}
            loading={listLoading}
            tab={tab}
            onOpen={handleOpen}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onDelete={handleDelete}
            onReorder={handleReorder}
          />
        </div>
      </div>

      {/* Full-screen viewer overlay */}
      {state.selected && (
        <DrawingViewer
          detail={state.selected}
          hook={hook}
          onClose={handleViewerClose}
        />
      )}
      <JobContextTab />
    </>
  );
}
