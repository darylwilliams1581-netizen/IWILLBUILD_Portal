/**
 * JobPlanManagerTab — Plan Manager drawings scoped to a single job.
 * Replaces the old DrawingsTab. Uses the Plan Manager API + viewer.
 *
 * Upload flow delegates entirely to PlanUploadModal (shared component).
 * No duplicate upload orchestration here.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Layers, Upload, Loader2, AlertCircle, FolderOpen, FileText,
  Eye, Archive, Trash2, ChevronUp, ChevronDown,
  GitBranch, Lock, Clock,
} from 'lucide-react';
import DrawingViewer from './DrawingViewer';
import PlanUploadModal from './PlanUploadModal';
import { usePlanManager } from './usePlanManager';
import type { Drawing } from './types';

interface Props {
  jobId: number;
  jobName?: string;
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JobPlanManagerTab({ jobId, jobName }: Props) {
  const [drawings, setDrawings]   = useState<Drawing[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [reordering, setReordering] = useState<number | null>(null);
  const hook = usePlanManager();
  const { state, loadDrawing, closeDrawing } = hook;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/plan-manager/drawings?status=active&jobId=${jobId}`, { credentials: 'include' });
      const data = await res.json() as { drawings?: Drawing[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setDrawings(data.drawings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  async function handleReorder(drawingId: number, direction: 'up' | 'down') {
    setReordering(drawingId);
    try {
      await fetch(`/api/plan-manager/drawings/${drawingId}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ direction, jobId }),
      });
      await load();
    } finally {
      setReordering(null);
    }
  }

  async function handleArchive(id: number) {
    await fetch(`/api/plan-manager/drawings/${id}/archive`, { method: 'POST', credentials: 'include' });
    await load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Permanently delete this drawing? This cannot be undone.')) return;
    await fetch(`/api/plan-manager/drawings/${id}/permanent`, { method: 'DELETE', credentials: 'include' });
    await load();
  }

  // Called by PlanUploadModal on success — refresh the list
  function handleUploadSaved() {
    setShowUpload(false);
    void load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin text-violet-600" />
        <span className="text-sm">Loading drawings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-bold text-slate-900 text-base flex items-center gap-2">
            <Layers size={16} className="text-violet-600" />
            Drawings
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {drawings.length} drawing{drawings.length !== 1 ? 's' : ''} — managed in Plan Manager
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 hover:bg-violet-700 text-white text-xs font-bold transition-colors min-h-[44px]"
        >
          <Upload size={13} /> Upload Plan
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {drawings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <FolderOpen size={36} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No drawings yet</p>
          <p className="text-xs text-slate-400">Upload a PDF to start the drawing register for this job.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-700 text-white text-sm font-bold min-h-[44px]"
          >
            <Upload size={14} /> Upload First Plan
          </button>
        </div>
      ) : (
        <>
          {/* ── Mobile card list (< md) ──────────────────────────────────────── */}
          <div className="flex flex-col divide-y divide-slate-100 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm md:hidden">
            {drawings.map((drawing, idx) => (
              <div key={drawing.id} className="flex items-center gap-3 px-4 py-3">
                {/* Reorder */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => void handleReorder(drawing.id, 'up')}
                    disabled={idx === 0 || reordering === drawing.id}
                    className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                  >
                    {reordering === drawing.id ? <Loader2 size={11} className="animate-spin" /> : <ChevronUp size={11} />}
                  </button>
                  <button
                    onClick={() => void handleReorder(drawing.id, 'down')}
                    disabled={idx === drawings.length - 1 || reordering === drawing.id}
                    className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown size={11} />
                  </button>
                </div>
                {/* Icon */}
                <FileText size={18} className={drawing.source_file_path ? 'text-red-500 shrink-0' : 'text-slate-300 shrink-0'} />
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{drawing.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {drawing.drawing_number && (
                      <span className="text-[11px] text-slate-500 font-mono">{drawing.drawing_number}</span>
                    )}
                    {drawing.revision_name && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        <GitBranch size={9} /> {drawing.revision_name}
                      </span>
                    )}
                    {drawing.discipline && (
                      <span className="text-[11px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">{drawing.discipline}</span>
                    )}
                    {drawing.locked && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-600">
                        <Lock size={9} /> Locked
                      </span>
                    )}
                    {!drawing.source_file_path && (
                      <span className="text-[11px] text-slate-400 italic">No PDF</span>
                    )}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock size={9} /> {formatDate(drawing.updated_at)}
                    </span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {drawing.source_file_path && (
                    <button
                      onClick={() => void loadDrawing(drawing.id)}
                      title="Open viewer"
                      className="p-2 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                    >
                      <Eye size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => void handleArchive(drawing.id)}
                    title="Archive"
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                  >
                    <Archive size={13} />
                  </button>
                  <button
                    onClick={() => void handleDelete(drawing.id)}
                    title="Delete"
                    className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop table (≥ md) ─────────────────────────────────────────── */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500 w-16">Order</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Drawing</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">No.</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Revision</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Discipline</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">Updated</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {drawings.map((drawing, idx) => (
                    <tr key={drawing.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => void handleReorder(drawing.id, 'up')}
                            disabled={idx === 0 || reordering === drawing.id}
                            className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-colors"
                            title="Move up"
                          >
                            {reordering === drawing.id ? <Loader2 size={11} className="animate-spin" /> : <ChevronUp size={11} />}
                          </button>
                          <button
                            onClick={() => void handleReorder(drawing.id, 'down')}
                            disabled={idx === drawings.length - 1 || reordering === drawing.id}
                            className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-colors"
                            title="Move down"
                          >
                            <ChevronDown size={11} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={13} className={drawing.source_file_path ? 'text-red-500 shrink-0' : 'text-slate-300 shrink-0'} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate max-w-[220px]">{drawing.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {drawing.locked && <span className="flex items-center gap-1 text-[10px] text-amber-600"><Lock size={9} /> Locked</span>}
                              {(drawing.annotation_count ?? 0) > 0 && (
                                <span className="text-[10px] text-slate-500">
                                  {drawing.annotation_count} annotation{Number(drawing.annotation_count) !== 1 ? 's' : ''}
                                </span>
                              )}
                              {!drawing.source_file_path && <span className="text-[10px] text-slate-500 italic">No PDF</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-slate-500 font-mono">{drawing.drawing_number ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {drawing.revision_name
                          ? <span className="flex items-center gap-1 text-xs text-slate-500"><GitBranch size={10} /> {drawing.revision_name}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {drawing.discipline
                          ? <span className="text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">{drawing.discipline}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock size={10} /> {formatDate(drawing.updated_at)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {drawing.source_file_path && (
                            <button
                              onClick={() => void loadDrawing(drawing.id)}
                              title="Open viewer"
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => void handleArchive(drawing.id)}
                            title="Archive"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                          >
                            <Archive size={12} />
                          </button>
                          <button
                            onClick={() => void handleDelete(drawing.id)}
                            title="Delete permanently"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Shared upload modal — job is pre-selected, no job picker shown */}
      <PlanUploadModal
        open={showUpload}
        initialJobId={jobId}
        initialJobLabel={jobName}
        onClose={() => setShowUpload(false)}
        onSaved={handleUploadSaved}
      />

      {/* Full-screen Plan Manager viewer */}
      {state.selected && (
        <DrawingViewer
          detail={state.selected}
          hook={hook}
          onClose={async () => { closeDrawing(); await load(); }}
        />
      )}
    </div>
  );
}
