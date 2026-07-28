/**
 * DrawingsTab — Drawing register for a job.
 * Phase 1: PDF viewer with markup tools.
 * Phase 2: DWG upload + download (no preview).
 */
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import {
  FileText, Upload, Download, Eye, Pencil, Trash2, Loader2,
  Plus, ChevronDown, ChevronUp, AlertCircle, FolderOpen,
  Check, X, FileX,
} from 'lucide-react';
// Lazy-load the PDF viewer so react-pdf / pdfjs-dist are excluded from the
// SSR bundle (they are client-only and would OOM-kill the publish build).
const DrawingPdfViewer = lazy(() => import('./DrawingPdfViewer'));
import {
  fileServePath, fileIsPdf, fileIsDwg,
  DRAWING_DISCIPLINES, DRAWING_STATUSES, STATUS_BADGE,
} from './drawing-utils';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DrawingRecord {
  id: number;
  job_id: number;
  file_id: number;
  drawing_number: string | null;
  title: string;
  revision: string;
  discipline: string;
  status: string;
  original_file_id: number;
  marked_up_file_id: number | null;
  uploaded_by_user_id: string;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
  file_name: string | null;
  file_mime: string | null;
  file_stored_name: string | null;
  markup_file_name: string | null;
  markup_stored_name: string | null;
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function UploadModal({ jobId, onClose, onSaved }: { jobId: number; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [drawingNumber, setDrawingNumber] = useState('');
  const [title, setTitle] = useState('');
  const [revision, setRevision] = useState('A');
  const [discipline, setDiscipline] = useState<string>(DRAWING_DISCIPLINES[0]);
  const [status, setStatus] = useState<string>(DRAWING_STATUSES[0]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('jobId', String(jobId));
      const uploadRes = await fetch('/api/drawings/upload', { method: 'POST', credentials: 'include', body: fd });
      const uploadData = await uploadRes.json() as { file?: { id: number }; error?: string };
      if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Upload failed');
      const fileId = uploadData.file?.id;
      if (!fileId) throw new Error('No file ID returned');

      const regRes = await fetch('/api/drawings', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, fileId, drawingNumber: drawingNumber.trim() || null, title: title.trim(), revision, discipline, status }),
      });
      const regData = await regRes.json() as { drawing?: DrawingRecord; error?: string };
      if (!regRes.ok) throw new Error(regData.error ?? 'Register failed');
      onSaved(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-heading font-bold text-slate-900 text-base">Upload Drawing</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Drawing File <span className="text-red-500">*</span></label>
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-primary/50 hover:bg-violet-50/30'}`}>
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <Check size={16} className="text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700 truncate max-w-[280px]">{file.name}</span>
                  <span className="text-xs text-slate-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Upload size={20} className="text-slate-400" />
                  <p className="text-sm text-slate-500">Click to select PDF</p>
                  <p className="text-xs text-slate-400">Max 50 MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); } }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Drawing No.</label>
              <input type="text" value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)}
                placeholder="e.g. A-001" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Revision</label>
              <input type="text" value={revision} onChange={(e) => setRevision(e.target.value)}
                placeholder="A" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Title <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ground Floor Plan" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Discipline</label>
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {DRAWING_DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {DRAWING_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={uploading}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={uploading || !file}
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Uploading…' : 'Upload Drawing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Inline edit row ───────────────────────────────────────────────────────────
function EditRow({ drawing, onSave, onCancel, showDisciplineCol }: {
  drawing: DrawingRecord;
  onSave: (d: Partial<DrawingRecord>) => Promise<void>;
  onCancel: () => void;
  showDisciplineCol: boolean;
}) {
  const [drawingNumber, setDrawingNumber] = useState(drawing.drawing_number ?? '');
  const [title, setTitle] = useState(drawing.title);
  const [revision, setRevision] = useState(drawing.revision);
  const [discipline, setDiscipline] = useState(drawing.discipline);
  const [status, setStatus] = useState(drawing.status);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave({ drawingNumber, title, revision, discipline, status });
    setSaving(false);
  }

  return (
    <tr className="bg-violet-50/40">
      <td className="px-3 py-2"><input value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs" placeholder="No." /></td>
      <td className="px-3 py-2"><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs" /></td>
      <td className="px-3 py-2"><input value={revision} onChange={(e) => setRevision(e.target.value)} className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs" /></td>
      {showDisciplineCol && (
        <td className="px-3 py-2">
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
            {DRAWING_DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </td>
      )}
      <td className="px-3 py-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white">
          {DRAWING_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">—</td>
      <td className="px-3 py-2 text-xs text-slate-400">—</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => void save()} disabled={saving} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
          <button onClick={onCancel} className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300"><X size={12} /></button>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DrawingsTab({ jobId }: { jobId: number }) {
  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [viewerDrawing, setViewerDrawing] = useState<DrawingRecord | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [groupByDiscipline, setGroupByDiscipline] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/drawings?jobId=${jobId}`, { credentials: 'include' });
      const data = await res.json() as { drawings?: DrawingRecord[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setDrawings(data.drawings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  async function handleEdit(id: number, data: Partial<DrawingRecord>) {
    await fetch(`/api/drawings/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setEditingId(null);
    void load();
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Remove this drawing from the register? The file will not be deleted.')) return;
    setDeletingId(id);
    await fetch(`/api/drawings/${id}`, { method: 'DELETE', credentials: 'include' });
    setDeletingId(null);
    void load();
  }

  const grouped = groupByDiscipline
    ? DRAWING_DISCIPLINES.reduce<Record<string, DrawingRecord[]>>((acc, disc) => {
        const items = drawings.filter((d) => d.discipline === disc);
        if (items.length) acc[disc] = items;
        return acc;
      }, {})
    : { All: drawings };

  const hasDwgOnly = drawings.some((d) => fileIsDwg(d.file_mime, d.file_name) && !fileIsPdf(d.file_mime, d.file_name));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span className="text-sm">Loading drawings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-bold text-slate-900 text-base">Drawing Register</h3>
          <p className="text-xs text-slate-500 mt-0.5">{drawings.length} drawing{drawings.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setGroupByDiscipline((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            {groupByDiscipline ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {groupByDiscipline ? 'Flat list' : 'Group by discipline'}
          </button>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-xs font-bold transition-colors">
            <Plus size={13} /> Upload Drawing
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {drawings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <FolderOpen size={36} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No drawings yet</p>
          <p className="text-xs text-slate-400">Upload a PDF or DWG to start the drawing register.</p>
          <button onClick={() => setShowUpload(true)}
            className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-violet-700 text-white text-sm font-bold">
            <Upload size={14} /> Upload First Drawing
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(grouped).map(([disc, items]) => (
            <div key={disc}>
              {groupByDiscipline && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{disc}</span>
                  <span className="text-xs text-slate-400">({items.length})</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">No.</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Title</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Rev</th>
                        {!groupByDiscipline && <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Discipline</th>}
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Status</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">Uploaded by</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500 whitespace-nowrap">Date</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map((drawing) => {
                        const isEditing = editingId === drawing.id;
                        const isDeleting = deletingId === drawing.id;
                        const pdf = fileIsPdf(drawing.file_mime, drawing.file_name);
                        const dwg = fileIsDwg(drawing.file_mime, drawing.file_name);
                        const hasMarkup = !!drawing.marked_up_file_id;

                        if (isEditing) {
                          return (
                            <EditRow key={drawing.id} drawing={drawing} showDisciplineCol={!groupByDiscipline}
                              onSave={(data) => handleEdit(drawing.id, data)}
                              onCancel={() => setEditingId(null)} />
                          );
                        }

                        return (
                          <tr key={drawing.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-3 py-2.5">
                              <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                {drawing.drawing_number ?? '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                {pdf ? <FileText size={13} className="text-red-500 shrink-0" /> : <FileX size={13} className="text-slate-400 shrink-0" />}
                                <span className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">{drawing.title}</span>
                                {hasMarkup && <span className="text-[10px] bg-violet-100 text-violet-800 font-bold px-1.5 py-0.5 rounded-full shrink-0">Marked up</span>}
                              </div>
                              {drawing.file_name && <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">{drawing.file_name}</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{drawing.revision}</span>
                            </td>
                            {!groupByDiscipline && <td className="px-3 py-2.5 text-xs text-slate-600">{drawing.discipline}</td>}
                            <td className="px-3 py-2.5">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[drawing.status] ?? 'bg-slate-100 text-slate-600'}`}>
                                {drawing.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{drawing.uploaded_by_name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                              {new Date(drawing.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                {pdf && (
                                  <button onClick={() => setViewerDrawing(drawing)} title="Open viewer"
                                    className="p-1.5 rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary transition-colors">
                                    <Eye size={13} />
                                  </button>
                                )}
                                {dwg && !pdf && (
                                  <span className="text-[10px] text-slate-500 px-1.5 py-0.5 bg-slate-100 rounded-lg">DWG</span>
                                )}
                                <a href={fileServePath(drawing.original_file_id)} download title="Download original"
                                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
                                  <Download size={13} />
                                </a>
                                {hasMarkup && drawing.marked_up_file_id && (
                                  <a href={fileServePath(drawing.marked_up_file_id)} download title="Download marked-up copy"
                                    className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors">
                                    <Download size={13} />
                                  </a>
                                )}
                                <button onClick={() => setEditingId(drawing.id)} title="Edit metadata"
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => void handleDelete(drawing.id)} disabled={isDeleting} title="Remove from register"
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 transition-colors">
                                  {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasDwgOnly && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Preview not available for this file. Download to open in your viewer.
          </p>
        </div>
      )}

      {showUpload && (
        <UploadModal jobId={jobId} onClose={() => setShowUpload(false)} onSaved={() => void load()} />
      )}

      {viewerDrawing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}>
          <DrawingPdfViewer
            drawingId={viewerDrawing.id}
            fileUrl={fileServePath(viewerDrawing.original_file_id)}
            title={`${viewerDrawing.drawing_number ? viewerDrawing.drawing_number + ' — ' : ''}${viewerDrawing.title} Rev ${viewerDrawing.revision}`}
            onClose={() => setViewerDrawing(null)}
            onMarkupSaved={() => void load()}
          />
        </Suspense>
      )}
    </div>
  );
}
