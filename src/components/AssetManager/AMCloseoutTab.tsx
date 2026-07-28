/**
 * Induction & Completion Docs Tab — upload, attach to inspection, mark complete
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Upload, Loader2, AlertTriangle, X, CheckCircle2, FileText, ExternalLink,
} from 'lucide-react';

interface Inspection { id: number; report_title: string | null; report_no: string | null; asset_name: string; }
interface Closeout {
  id: number; inspection_id: number; form_type: string; source_file_path: string | null;
  completed_at: string | null; created_at: string;
}

const SELECT = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-600/30';
const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';

export default function AMCloseoutTab() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [closeouts, setCloseouts] = useState<Closeout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInspection, setSelectedInspection] = useState('');
  const [formType, setFormType] = useState('completion');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ir = await fetch('/api/asset-manager/inspections?status=active', { credentials: 'include' });
      const id = await ir.json() as { inspections?: Inspection[] };
      setInspections(id.inspections ?? []);

      const allCloseouts: Closeout[] = [];
      for (const insp of (id.inspections ?? []).slice(0, 30)) {
        const dr = await fetch(`/api/asset-manager/inspections/${insp.id}`, { credentials: 'include' });
        const dd = await dr.json() as { closeouts?: Closeout[] };
        allCloseouts.push(...(dd.closeouts ?? []));
      }
      setCloseouts(allCloseouts);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleUpload(file: File) {
    if (!selectedInspection) return setError('Select an inspection first');
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('form_type', formType);
      const r = await fetch(`/api/asset-manager/inspections/${selectedInspection}/closeout`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (!r.ok) {
        const d = await r.json() as { error?: string };
        throw new Error(d.error ?? 'Upload failed');
      }
      setSuccess('Document uploaded successfully.');
      setTimeout(() => setSuccess(''), 4000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function inspLabel(id: number) {
    const i = inspections.find((x) => x.id === id);
    return i ? `${i.report_title || i.report_no || `#${id}`} — ${i.asset_name}` : `#${id}`;
  }

  return (
    <div className="p-6 flex flex-col gap-5">
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />

      {/* Upload panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <BookOpen size={15} className="text-violet-600" />
          Upload Induction or Completion Document
        </h3>
        <p className="text-xs text-slate-500">Accepted formats: PDF, DOCX. Max 30 MB. The document will be attached to the selected inspection.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Inspection</label>
            <select value={selectedInspection} onChange={(e) => setSelectedInspection(e.target.value)} className={SELECT}>
              <option value="">Select inspection…</option>
              {inspections.map((i) => <option key={i.id} value={i.id}>{i.report_title || i.report_no || `#${i.id}`} — {i.asset_name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Document Type</label>
            <select value={formType} onChange={(e) => setFormType(e.target.value)} className={SELECT}>
              <option value="induction">Induction</option>
              <option value="completion">Completion</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !selectedInspection}
          className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-slate-200 hover:border-violet-400/50 rounded-xl text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Uploading…' : 'Click to upload PDF or DOCX'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={14} />{success}
        </div>
      )}

      {/* Uploaded docs list */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Uploaded Documents</h3>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
        ) : closeouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen size={28} className="text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {closeouts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.form_type === 'induction' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {c.form_type}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 truncate">{inspLabel(c.inspection_id)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Uploaded {new Date(c.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {c.completed_at && ` · Completed ${new Date(c.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                {c.source_file_path && (
                  <a href={c.source_file_path} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors">
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
