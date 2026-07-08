/**
 * /plan-manager — Plan Manager module page.
 * Drawings are grouped by job (file manager view).
 * No direct upload here — drawings are added via the job's Drawings tab.
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Map, Archive, Layers, Menu } from 'lucide-react';
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
  const { state, loadDrawing, closeDrawing, createShareToken } = hook;

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

      <div className="portal-page bg-[#F4F5F7] text-slate-900">
        <PortalSidebar />

        <div className="portal-main">
          {/* Page header */}
          <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
            <button
              onClick={() => window.dispatchEvent(new Event('portal:open-menu'))}
              className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
              <Map size={18} className="text-orange-500" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold text-slate-900">Plan Manager</h1>
              <p className="text-xs text-slate-500 hidden sm:block">Browse and manage drawings across all jobs</p>
            </div>

            <div className="flex-1" />

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
              <button
                onClick={() => setTab('active')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  tab === 'active' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                <Layers size={12} /> Active
              </button>
              <button
                onClick={() => setTab('archived')}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  tab === 'archived' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-slate-700',
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
            onCreateShareToken={createShareToken}
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
