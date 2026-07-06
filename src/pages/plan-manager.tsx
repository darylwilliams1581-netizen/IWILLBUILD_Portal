/**
 * /plan-manager — Plan Manager module page.
 * Tabs: Active drawings | Archived
 * Opens DrawingViewer in full-screen overlay when a drawing is selected.
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Map, Archive, Layers } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import PlanManagerList from '@/components/PlanManager/PlanManagerList';
import DrawingViewer from '@/components/PlanManager/DrawingViewer';
import { usePlanManager } from '@/components/PlanManager/usePlanManager';

type Tab = 'active' | 'archived';

export default function PlanManagerPage() {
  const [tab, setTab] = useState<Tab>('active');
  const hook = usePlanManager();
  const { state, loadDrawings, loadDrawing, closeDrawing } = hook;

  useEffect(() => {
    loadDrawings(tab);
  }, [tab, loadDrawings]);

  // ── CRUD helpers ──────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (title: string, file?: File): Promise<number | null> => {
    try {
      const res = await fetch('/api/plan-manager/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json() as { id?: number; error?: string };
      if (!res.ok || !data.id) return null;
      const id = data.id;

      // If a PDF was selected, upload it immediately before opening the viewer
      if (file) {
        await hook.uploadPdf(id, file);
      }

      await loadDrawings(tab);
      return id;
    } catch { return null; }
  }, [tab, loadDrawings, hook]);

  const handleOpen = useCallback(async (id: number) => {
    await loadDrawing(id);
  }, [loadDrawing]);

  const handleArchive = useCallback(async (id: number) => {
    await fetch(`/api/plan-manager/drawings/${id}/archive`, { method: 'POST' });
    await loadDrawings(tab);
  }, [tab, loadDrawings]);

  const handleRestore = useCallback(async (id: number) => {
    await fetch(`/api/plan-manager/drawings/${id}/restore`, { method: 'POST' });
    await loadDrawings(tab);
  }, [tab, loadDrawings]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Permanently delete this drawing? This cannot be undone.')) return;
    await fetch(`/api/plan-manager/drawings/${id}/permanent`, { method: 'DELETE' });
    await loadDrawings(tab);
  }, [tab, loadDrawings]);

  const handleViewerClose = useCallback(async () => {
    closeDrawing();
    await loadDrawings(tab);
  }, [closeDrawing, tab, loadDrawings]);

  return (
    <>
      <Helmet>
        <title>Plan Manager — IWILLBUILD</title>
        <meta name="description" content="Upload, annotate and share construction drawings with your team." />
        <link rel="canonical" href="https://iwillbuild.com/plan-manager" />
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
              <p className="text-xs text-slate-500">Upload, annotate and share construction drawings</p>
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
            drawings={state.drawings}
            loading={state.listLoading}
            tab={tab}
            onOpen={handleOpen}
            onCreate={handleCreate}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onDelete={handleDelete}
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
    </>
  );
}
