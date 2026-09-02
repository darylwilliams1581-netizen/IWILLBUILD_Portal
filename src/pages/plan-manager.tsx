/**
 * /plan-manager — Plan Manager module page.
 * Drawings are grouped by job (file manager view).
 * No direct upload here — drawings are added via the job's Drawings tab.
 */
import { useState, useEffect, useCallback } from 'react';
// @seo-exempt — internal portal tool, noindex set in Helmet
import { Helmet } from '@dr.pogodin/react-helmet';
import { useNavigate } from 'react-router';
import { Map, Archive, Layers, AlertTriangle, RefreshCw, Upload, ChevronLeft } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import DesktopDock from '@/components/DesktopDock';
import JobContextTab from '@/components/JobContextTab';
import PlanManagerList from '@/components/PlanManager/PlanManagerList';
import DrawingViewer from '@/components/PlanManager/DrawingViewer';
import PlanUploadModal from '@/components/PlanManager/PlanUploadModal';
import { usePlanManager } from '@/components/PlanManager/usePlanManager';
import type { Drawing } from '@/components/PlanManager/types';
import { Skeleton } from '@/components/ui/skeleton';
type Tab = 'active' | 'archived';
interface JobGroup {
  jobId: number;
  jobName: string;
  jobNumber: string;
  jobStatus: string;
  drawings: Drawing[];
}
export default function PlanManagerPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('active');
  const [jobs, setJobs] = useState<JobGroup[]>([]);
  const [unassigned, setUnassigned] = useState<Drawing[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [highlightJobId, setHighlightJobId] = useState<number | null>(null);
  const hook = usePlanManager();
  const { state, loadDrawing, closeDrawing, createShareToken } = hook;
  const loadAll = useCallback(async (t: Tab) => {
    setListLoading(true);
    setListError(false);
    try {
      const res = await fetch(`/api/plan-manager/jobs-with-drawings?status=${t}`, {
        credentials: 'include'
      });
      const data = (await res.json()) as {
        jobs?: JobGroup[];
        unassigned?: Drawing[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setJobs(data.jobs ?? []);
      setUnassigned(data.unassigned ?? []);
    } catch {
      setJobs([]);
      setUnassigned([]);
      setListError(true);
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
    await fetch(`/api/plan-manager/drawings/${id}/archive`, {
      method: 'POST',
      credentials: 'include'
    });
    await loadAll(tab);
  }, [tab, loadAll]);
  const handleRestore = useCallback(async (id: number) => {
    await fetch(`/api/plan-manager/drawings/${id}/restore`, {
      method: 'POST',
      credentials: 'include'
    });
    await loadAll(tab);
  }, [tab, loadAll]);
  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Permanently delete this drawing? This cannot be undone.')) return;
    await fetch(`/api/plan-manager/drawings/${id}/permanent`, {
      method: 'DELETE',
      credentials: 'include'
    });
    await loadAll(tab);
  }, [tab, loadAll]);
  const handleReorder = useCallback(async (drawingId: number, direction: 'up' | 'down', jobId?: number) => {
    await fetch(`/api/plan-manager/drawings/${drawingId}/reorder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        direction,
        jobId
      })
    });
    await loadAll(tab);
  }, [tab, loadAll]);
  const handleViewerClose = useCallback(async () => {
    closeDrawing();
    await loadAll(tab);
  }, [closeDrawing, tab, loadAll]);

  // ── Upload success: refresh list, switch to active tab, highlight job ──────
  const handleUploadSaved = useCallback(async (_drawingId: number, jobId: number) => {
    setUploadOpen(false);
    setTab('active');
    setHighlightJobId(jobId);
    await loadAll('active');
    // Clear highlight after 4 s
    setTimeout(() => setHighlightJobId(null), 4000);
  }, [loadAll]);
  return <>
      <Helmet>
        <title>Plan Manager — IWILLBUILD</title>
        <meta name="description" content="Upload, annotate and share construction drawings with your team." />
        <link rel="canonical" href="https://iwillbuild.com/plan-manager" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="portal-page bg-[#F4F5F7] text-slate-900">
        <PortalSidebar />
        <DesktopDock />

        <div className="portal-content flex flex-col h-[100dvh] overflow-hidden">
          {/* Page header */}
          <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
            {/* Mobile back button */}
            <button
              onClick={() => window.history.length > 1 ? navigate(-1) : navigate(-1)}
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shrink-0"
              aria-label="Go back"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-600/20 flex items-center justify-center shrink-0">
              <Map size={18} className="text-violet-600" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold text-slate-900">Plan Manager</h1>
              <p className="text-xs text-slate-500 hidden sm:block">Browse and manage drawings across all jobs</p>
            </div>

            <div className="flex-1" />

            {/* Upload Plan — primary action */}
            <button onClick={() => setUploadOpen(true)} className="flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors shrink-0">
              <Upload size={15} />
              <span className="hidden sm:inline">Upload Plan</span>
              <span className="sm:hidden">Upload</span>
            </button>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
              <button onClick={() => setTab('active')} className={['flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors', tab === 'active' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:text-slate-700'].join(' ')}>
                <Layers size={12} /> Active
              </button>
              <button onClick={() => setTab('archived')} className={['flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors', tab === 'archived' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:text-slate-700'].join(' ')}>
                <Archive size={12} /> Archived
              </button>
            </div>
          </div>

          {/* List / loading / error */}
          <div className="flex-1 overflow-y-auto">
            {listLoading ? <div className="p-4 md:p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 rounded" />
                      <Skeleton className="h-3 w-32 rounded" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>)}
              </div> : listError ? <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={24} className="text-red-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Failed to load drawings</p>
                <button onClick={() => void loadAll(tab)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                  <RefreshCw size={13} /> Try again
                </button>
              </div> : <PlanManagerList jobs={jobs} unassigned={unassigned} loading={listLoading} tab={tab} onOpen={handleOpen} onArchive={handleArchive} onRestore={handleRestore} onDelete={handleDelete} onReorder={handleReorder} onCreateShareToken={createShareToken} highlightJobId={highlightJobId} />}
          </div>
        </div>
      </div>

      {/* Upload Plan modal */}
      <PlanUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSaved={(drawingId, jobId) => void handleUploadSaved(drawingId, jobId)} />

      {/* Full-screen viewer overlay */}
      {state.selected && <DrawingViewer detail={state.selected} hook={hook} onClose={handleViewerClose} />}
      <JobContextTab />
    </>;
}
