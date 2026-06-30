import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert, Plus, Loader2, X, AlertCircle, Users, UserCheck,
  Printer, Wand2, Trash2, CheckSquare, Square, Search, ClipboardList,
  Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { escapeHtml, safeUrl } from '@/lib/html-escape';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwmsTemplate {
  id: number;
  title: string;
  work_activity: string | null;
  status: string;
}

interface SafetyPlanTemplate {
  id: number;
  title: string;
  status: string;
  site_address: string | null;
}

interface Signoff {
  id: number;
  worker_name: string;
  company_name: string | null;
  role: string | null;
  white_card_number: string | null;
  signature_data: string | null;
  signed_at: string;
}

interface JobSwmsRecord {
  id: number;
  job_id: number;
  template_id: number | null;
  title: string;
  work_activity: string | null;
  hazards: string | null;
  risks: string | null;
  controls: string | null;
  ppe: string | null;
  plant_equipment: string | null;
  training_competency: string | null;
  emergency_controls: string | null;
  environmental_controls: string | null;
  sign_off_requirements: string | null;
  permits_approvals: string | null;
  monitoring_review: string | null;
  notes: string | null;
  revision_number: string;
  review_date: string | null;
  status: string;
  reviewed_at: string | null;
  approved_at: string | null;
  job_name: string | null;
  job_number: string | null;
  client_name: string | null;
  job_site_address: string | null;
  supervisor: string | null;
  created_at: string;
  updated_at: string;
  signoffs?: Signoff[];
}

interface JobSafetyPlan {
  id: number;
  job_id: number;
  title: string;
  status: string;
  site_address: string | null;
  site_supervisor: string | null;
  first_aid_officer: string | null;
  emergency_contact: string | null;
  nearest_hospital: string | null;
  emergency_assembly_point: string | null;
  evacuation_notes: string | null;
  site_rules: string | null;
  high_risk_activities: string | null;
  required_posters: string | null;
  created_at: string;
  updated_at: string;
}

interface JobInfo {
  id: number;
  name: string;
  jobNumber?: string | null;
  job_number?: string | null;
  client?: string | null;
  client_name?: string | null;
  address?: string | null;
  site_address?: string | null;
  supervisor?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(s: string) {
  if (s === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'reviewed') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s === 'draft')    return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s === 'active')   return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

// ── Sign-on Modal ─────────────────────────────────────────────────────────────

function SignonModal({ jobSwmsId, swmsTitle, onClose, onSigned }: {
  jobSwmsId: number;
  swmsTitle: string;
  onClose: () => void;
  onSigned: (signoff: Signoff) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [form, setForm] = useState({ workerName: '', companyName: '', role: '', whiteCard: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Canvas drawing
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setHasSig(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function stopDraw() { setDrawing(false); }

  function clearSig() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.workerName.trim()) { setError('Worker name is required'); return; }
    setSaving(true); setError('');
    try {
      const signatureData = hasSig ? canvasRef.current?.toDataURL('image/png') : undefined;
      const r = await fetch(`/api/safety/job-swms/${jobSwmsId}/signoffs`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerName: form.workerName.trim(),
          companyName: form.companyName.trim() || undefined,
          role: form.role.trim() || undefined,
          whiteCardNumber: form.whiteCard.trim() || undefined,
          signatureData,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onSigned(d.signoff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign on');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const labelCls = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[95vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-50 rounded-md"><UserCheck size={15} className="text-emerald-600" /></div>
            <div>
              <h2 className="font-heading font-bold text-sm">Sign onto SWMS</h2>
              <p className="text-xs text-slate-400 truncate max-w-xs">{swmsTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                <input value={form.workerName} onChange={(e) => set('workerName', e.target.value)} className={inputCls} placeholder="John Smith" />
              </div>
              <div>
                <label className={labelCls}>Company / Employer</label>
                <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} className={inputCls} placeholder="ABC Constructions" />
              </div>
              <div>
                <label className={labelCls}>Role / Trade</label>
                <input value={form.role} onChange={(e) => set('role', e.target.value)} className={inputCls} placeholder="Carpenter, Electrician…" />
              </div>
              <div>
                <label className={labelCls}>White Card No. <span className="text-slate-400 font-normal">(optional)</span></label>
                <input value={form.whiteCard} onChange={(e) => set('whiteCard', e.target.value)} className={inputCls} placeholder="WC-XXXXXXXX" />
              </div>
            </div>

            {/* Signature canvas */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls + ' mb-0'}>Signature</label>
                {hasSig && (
                  <button type="button" onClick={clearSig} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Clear</button>
                )}
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-xl overflow-hidden bg-slate-50 touch-none">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={150}
                  className="w-full h-28 cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
              </div>
              {!hasSig && <p className="text-xs text-slate-400 mt-1">Draw your signature above</p>}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-xs text-amber-800 leading-relaxed">
                By signing, I confirm I have read, understood, and agree to comply with all controls listed in this SWMS before commencing work.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                <AlertCircle size={13} className="shrink-0" />{error}
              </div>
            )}
          </div>

          <div className="px-5 pb-5 flex gap-3 border-t border-slate-100 pt-4 shrink-0">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
              Sign On
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Add SWMS from Library Modal ───────────────────────────────────────────────

function AddSwmsModal({ jobId, onClose, onAdded }: {
  jobId: number;
  onClose: () => void;
  onAdded: (items: JobSwmsRecord[]) => void;
}) {
  const [templates, setTemplates] = useState<SwmsTemplate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/safety/swms', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setTemplates((d.swms ?? []).filter((s: SwmsTemplate) => s.status !== 'archived')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = templates.filter((t) =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) { setError('Select at least one SWMS template'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/safety/job-swms', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, templateIds: Array.from(selected) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onAdded(d.jobSwms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-orange-50 rounded-md"><ShieldAlert size={15} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-sm">Add SWMS from Library</h2>
              <p className="text-xs text-slate-400">Select one or more templates to copy into this job</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
          </div>

          {loading && <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-primary" /></div>}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-2">No SWMS templates found.</p>
              <Link to="/safety" className="text-xs text-primary font-semibold hover:underline">Create templates in Safety Library →</Link>
            </div>
          )}

          {!loading && filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${selected.has(t.id) ? 'border-primary bg-orange-50' : 'border-slate-200 hover:border-primary/40 hover:bg-orange-50/30'}`}
            >
              <div className="flex items-center gap-3">
                {selected.has(t.id)
                  ? <CheckSquare size={15} className="text-primary shrink-0" />
                  : <Square size={15} className="text-slate-300 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{t.title}</p>
                  {t.work_activity && <p className="text-xs text-slate-500 truncate">{t.work_activity}</p>}
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${statusBadge(t.status)}`}>{t.status}</span>
              </div>
            </button>
          ))}

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={13} className="shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3 border-t border-slate-100 pt-4 shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={handleAdd} disabled={saving || selected.size === 0} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add {selected.size > 0 ? `${selected.size} SWMS` : 'SWMS'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── SWMS Edit Modal ───────────────────────────────────────────────────────────

function SwmsEditModal({ initial, onClose, onSaved }: {
  initial: JobSwmsRecord;
  onClose: () => void;
  onSaved: (updated: JobSwmsRecord) => void;
}) {
  const [form, setForm] = useState({
    title: initial.title ?? '',
    workActivity: initial.work_activity ?? '',
    hazards: initial.hazards ?? '',
    risks: initial.risks ?? '',
    controls: initial.controls ?? '',
    ppe: initial.ppe ?? '',
    plantEquipment: initial.plant_equipment ?? '',
    trainingCompetency: initial.training_competency ?? '',
    emergencyControls: initial.emergency_controls ?? '',
    environmentalControls: initial.environmental_controls ?? '',
    signOffRequirements: initial.sign_off_requirements ?? '',
    permitsApprovals: initial.permits_approvals ?? '',
    monitoringReview: initial.monitoring_review ?? '',
    notes: initial.notes ?? '',
    revisionNumber: initial.revision_number ?? '1',
    reviewDate: initial.review_date?.slice(0, 10) ?? '',
    status: initial.status ?? 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/safety/job-swms/${initial.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onSaved(d.jobSwms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const labelCls = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';
  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const textareaCls = `${inputCls} resize-y`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-orange-50 rounded-md"><Wand2 size={15} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-base">Edit Job SWMS</h2>
              <p className="text-xs text-slate-400">Changes apply to this job copy only — master template is unchanged</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>SWMS Title <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                  {['draft', 'reviewed', 'approved', 'archived'].map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Revision Number</label>
                <input value={form.revisionNumber} onChange={(e) => set('revisionNumber', e.target.value)} className={inputCls} placeholder="1" />
              </div>
              <div>
                <label className={labelCls}>Review Date</label>
                <input type="date" value={form.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Work Activity / Scope</label>
              <textarea value={form.workActivity} onChange={(e) => set('workActivity', e.target.value)} rows={3} className={textareaCls} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Hazards Identified</label>
                <textarea value={form.hazards} onChange={(e) => set('hazards', e.target.value)} rows={5} className={textareaCls} placeholder="• One hazard per line" />
              </div>
              <div>
                <label className={labelCls}>Risks</label>
                <textarea value={form.risks} onChange={(e) => set('risks', e.target.value)} rows={5} className={textareaCls} placeholder="• One risk per line" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Control Measures</label>
              <textarea value={form.controls} onChange={(e) => set('controls', e.target.value)} rows={5} className={textareaCls} placeholder="• One control per line" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>PPE Required</label>
                <textarea value={form.ppe} onChange={(e) => set('ppe', e.target.value)} rows={4} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Plant & Equipment</label>
                <textarea value={form.plantEquipment} onChange={(e) => set('plantEquipment', e.target.value)} rows={4} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Training & Competency</label>
                <textarea value={form.trainingCompetency} onChange={(e) => set('trainingCompetency', e.target.value)} rows={4} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Emergency Controls</label>
                <textarea value={form.emergencyControls} onChange={(e) => set('emergencyControls', e.target.value)} rows={4} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Environmental Controls</label>
                <textarea value={form.environmentalControls} onChange={(e) => set('environmentalControls', e.target.value)} rows={4} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Sign-off Requirements</label>
                <textarea value={form.signOffRequirements} onChange={(e) => set('signOffRequirements', e.target.value)} rows={4} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Permits & Approvals</label>
                <textarea value={form.permitsApprovals} onChange={(e) => set('permitsApprovals', e.target.value)} rows={3} className={textareaCls} />
              </div>
              <div>
                <label className={labelCls}>Monitoring & Review</label>
                <textarea value={form.monitoringReview} onChange={(e) => set('monitoringReview', e.target.value)} rows={3} className={textareaCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Notes</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={textareaCls} />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                <AlertCircle size={13} className="shrink-0" />{error}
              </div>
            )}
          </div>

          <div className="px-6 pb-6 flex gap-3 border-t border-slate-100 pt-4 shrink-0">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save Changes
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── SWMS Print Modal ──────────────────────────────────────────────────────────

function nl2bullets(text: string | null | undefined): string[] | null {
  if (!text?.trim()) return null;
  const lines = text.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  return lines.length ? lines : null;
}

function SwmsPrintModal({ swms, signoffs, job, onClose }: {
  swms: JobSwmsRecord;
  signoffs: Signoff[];
  job: JobInfo | null;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const safeTitle = swms.title.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
    // eslint-disable-next-line no-unsanitized/method
    win.document.write(`<!DOCTYPE html><html><head>
      <title>SWMS — ${safeTitle}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 20mm 18mm; }
        .print-root { max-width: 100%; }
        .header-bar { background: #0f172a; color: #fff; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
        .header-bar h1 { font-size: 16px; font-weight: 800; }
        .header-bar .sub { font-size: 10px; opacity: 0.7; margin-top: 2px; }
        .header-bar .badge { background: #f97316; color: #fff; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
        .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .meta-cell { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; }
        .meta-cell .label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 2px; }
        .meta-cell .value { font-size: 11px; font-weight: 600; color: #1e293b; }
        .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; margin-top: 14px; }
        ul.bullets { list-style: none; padding: 0; }
        ul.bullets li { display: flex; gap: 6px; margin-bottom: 3px; font-size: 10.5px; color: #334155; }
        ul.bullets li::before { content: "•"; color: #94a3b8; flex-shrink: 0; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .divider { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
        .sign-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .sign-table th { background: #f8fafc; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 6px 8px; border: 1px solid #e2e8f0; text-align: left; }
        .sign-table td { border: 1px solid #e2e8f0; padding: 4px 8px; min-height: 28px; font-size: 10px; vertical-align: middle; }
        .sig-img { max-height: 36px; max-width: 120px; }
        .disclaimer { margin-top: 16px; background: #fef9f0; border: 1px solid #fed7aa; border-radius: 4px; padding: 10px 12px; }
        .disclaimer p { font-size: 9px; color: #92400e; line-height: 1.5; }
        .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        @media print { body { padding: 10mm 12mm; } @page { margin: 10mm; } }
      </style>
    </head><body><div class="print-root">${content.innerHTML}</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  function Section({ title, content }: { title: string; content: string | null | undefined }) {
    const bullets = nl2bullets(content);
    if (!bullets) return null;
    return (
      <div className="mb-4">
        <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1 mb-2">{title}</h3>
        <ul className="list-none">
          {bullets.map((b, i) => (
            <li key={i} className="text-[11px] text-slate-700 flex gap-2 mb-0.5">
              <span className="text-slate-400 shrink-0">•</span><span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const jobNumber = swms.job_number ?? job?.jobNumber ?? job?.job_number ?? null;
  const jobName   = swms.job_name ?? job?.name ?? null;
  const client    = swms.client_name ?? job?.client ?? job?.client_name ?? null;
  const address   = swms.job_site_address ?? job?.address ?? job?.site_address ?? null;
  const supervisor = swms.supervisor ?? job?.supervisor ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-slate-100 rounded-md"><Printer size={15} className="text-slate-600" /></div>
            <div>
              <h2 className="font-heading font-bold text-sm">Print Preview</h2>
              <p className="text-xs text-slate-400">{swms.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              <Printer size={14} />Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div ref={printRef} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-3xl mx-auto text-[11px] leading-relaxed">

            {/* Header */}
            <div className="bg-slate-900 text-white rounded-lg px-5 py-4 flex justify-between items-start mb-5">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Safe Work Method Statement</div>
                <h1 className="text-base font-extrabold leading-tight">{swms.title}</h1>
                {swms.work_activity && <p className="text-[10px] text-slate-300 mt-1">{swms.work_activity}</p>}
              </div>
              <span className="bg-primary text-white text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-4">
                {(swms.status ?? 'draft').toUpperCase()}
              </span>
            </div>

            {/* Meta grid — job details */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                ['Revision', `Rev ${swms.revision_number ?? '1'}`],
                ['Review Date', swms.review_date ? fmtDate(swms.review_date) : '—'],
                ['Print Date', today],
                ...(jobNumber ? [['Job No.', jobNumber]] : []),
                ...(jobName   ? [['Job', jobName]] : []),
                ...(client    ? [['Client', client]] : []),
                ...(address   ? [['Site Address', address]] : []),
                ...(supervisor ? [['Supervisor', supervisor]] : []),
              ].map(([label, value]) => (
                <div key={label} className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</div>
                  <div className="text-[11px] font-semibold text-slate-800">{value}</div>
                </div>
              ))}
            </div>

            <hr className="border-slate-200 mb-4" />

            <div className="grid grid-cols-2 gap-5 mb-4">
              <Section title="Hazards Identified" content={swms.hazards} />
              <Section title="Risks" content={swms.risks} />
            </div>
            <Section title="Control Measures / Risk Mitigation" content={swms.controls} />
            <hr className="border-slate-200 my-4" />
            <div className="grid grid-cols-2 gap-5">
              <Section title="PPE Required" content={swms.ppe} />
              <Section title="Plant & Equipment" content={swms.plant_equipment} />
              <Section title="Training & Competency" content={swms.training_competency} />
              <Section title="Sign-off Requirements" content={swms.sign_off_requirements} />
              <Section title="Emergency Controls" content={swms.emergency_controls} />
              <Section title="Environmental Controls" content={swms.environmental_controls} />
              {swms.permits_approvals && <Section title="Permits & Approvals" content={swms.permits_approvals} />}
              {swms.monitoring_review && <Section title="Monitoring & Review" content={swms.monitoring_review} />}
              {swms.notes && <Section title="Notes" content={swms.notes} />}
            </div>

            <hr className="border-slate-200 my-5" />

            {/* Sign-on register — actual signed workers + blank rows */}
            <div className="mb-5">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1.5 mb-3">
                Worker Sign-On Register
              </h3>
              <p className="text-[9px] text-slate-500 mb-3">
                All workers must read and understand this SWMS before commencing work. By signing below, you confirm you have read, understood, and agree to comply with all controls listed in this document.
              </p>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-50">
                    {['#', 'Full Name', 'Company / Trade', 'Role', 'White Card', 'Date', 'Signature'].map((h) => (
                      <th key={h} className="border border-slate-200 px-2 py-1.5 text-left text-[8px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Actual sign-ons */}
                  {signoffs.map((s, i) => (
                    <tr key={s.id} className="bg-emerald-50/30">
                      <td className="border border-slate-200 px-2 py-1 text-slate-400 text-[9px] w-6">{i + 1}</td>
                      <td className="border border-slate-200 px-2 py-1 font-semibold">{escapeHtml(s.worker_name)}</td>
                      <td className="border border-slate-200 px-2 py-1">{escapeHtml(s.company_name ?? '')}</td>
                      <td className="border border-slate-200 px-2 py-1">{escapeHtml(s.role ?? '')}</td>
                      <td className="border border-slate-200 px-2 py-1">{escapeHtml(s.white_card_number ?? '')}</td>
                      <td className="border border-slate-200 px-2 py-1 whitespace-nowrap">{new Date(s.signed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="border border-slate-200 px-2 py-1">
                        {s.signature_data
                          ? <img src={safeUrl(s.signature_data)} alt="sig" className="h-7 max-w-[100px] object-contain" />
                          : <span className="text-slate-300 text-[9px]">—</span>}
                      </td>
                    </tr>
                  ))}
                  {/* Blank rows for on-site signing */}
                  {Array.from({ length: Math.max(0, 10 - signoffs.length) }).map((_, i) => (
                    <tr key={`blank-${i}`}>
                      <td className="border border-slate-200 px-2 py-0 h-7 text-slate-400 text-[9px] w-6">{signoffs.length + i + 1}</td>
                      <td className="border border-slate-200 px-2 py-0 h-7 w-32" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-24" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-20" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-20" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-16" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-28" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-[9px] text-amber-800 leading-relaxed">
                <strong>Disclaimer:</strong> This Safe Work Method Statement has been prepared to assist in managing workplace health and safety risks. It is the responsibility of the principal contractor, site supervisor, and all workers to ensure this document is reviewed, understood, and followed at all times. This document must be reviewed and updated whenever there is a change in work conditions, personnel, equipment, or legislation.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center text-[8px] text-slate-400 border-t border-slate-200 pt-3">
              <span>IWILLBUILD Portal — Safety Management System</span>
              <span>Rev {swms.revision_number ?? '1'} · Printed {today}</span>
            </div>

          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Add Safety Plan Modal ─────────────────────────────────────────────────────

function AddSafetyPlanModal({ jobId, onClose, onAdded }: {
  jobId: number;
  onClose: () => void;
  onAdded: (plan: JobSafetyPlan) => void;
}) {
  const [templates, setTemplates] = useState<SafetyPlanTemplate[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/safety/plans', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        // Only show master templates (no job_id)
        const masters = (d.plans ?? []).filter((p: SafetyPlanTemplate & { job_id?: number | null }) => !p.job_id);
        setTemplates(masters);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/safety/job-safety-plans', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, templateId: selected ?? undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onAdded(d.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 rounded-md"><ClipboardList size={15} className="text-blue-600" /></div>
            <div>
              <h2 className="font-heading font-bold text-sm">Add Safety Plan</h2>
              <p className="text-xs text-slate-400">Copy from library or start blank</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {loading && <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-primary" /></div>}

          {!loading && (
            <>
              <button
                onClick={() => setSelected(null)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${selected === null ? 'border-primary bg-orange-50' : 'border-slate-200 hover:border-primary/40'}`}
              >
                <div className="flex items-center gap-3">
                  {selected === null ? <CheckSquare size={15} className="text-primary shrink-0" /> : <Square size={15} className="text-slate-300 shrink-0" />}
                  <div>
                    <p className="text-sm font-bold text-slate-800">Start blank</p>
                    <p className="text-xs text-slate-500">Create a new safety plan pre-filled with job details</p>
                  </div>
                </div>
              </button>

              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${selected === t.id ? 'border-primary bg-orange-50' : 'border-slate-200 hover:border-primary/40'}`}
                >
                  <div className="flex items-center gap-3">
                    {selected === t.id ? <CheckSquare size={15} className="text-primary shrink-0" /> : <Square size={15} className="text-slate-300 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{t.title}</p>
                      {t.site_address && <p className="text-xs text-slate-500 truncate">{t.site_address}</p>}
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${statusBadge(t.status)}`}>{t.status}</span>
                  </div>
                </button>
              ))}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={13} className="shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3 border-t border-slate-100 pt-4 shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={handleAdd} disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {selected ? 'Copy to Job' : 'Create Blank'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── SWMS Sub-tab ──────────────────────────────────────────────────────────────

function SwmsSubTab({ jobId, job }: { jobId: number; job: JobInfo | null }) {
  const [list, setList] = useState<JobSwmsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<JobSwmsRecord | null>(null);
  const [printing, setPrinting] = useState<{ swms: JobSwmsRecord; signoffs: Signoff[] } | null>(null);
  const [signonTarget, setSignonTarget] = useState<JobSwmsRecord | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [loadingSignoffs, setLoadingSignoffs] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/safety/job-swms?jobId=${jobId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setList((d.jobSwms ?? []).map((js: JobSwmsRecord) => ({ ...js, signoffs: js.signoffs ?? [] }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Remove "${title}" from this job? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/safety/job-swms/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) setList((prev) => prev.filter((j) => j.id !== id));
    } finally { setDeleting(null); }
  }

  async function handleStatusChange(item: JobSwmsRecord, newStatus: string) {
    const r = await fetch(`/api/safety/job-swms/${item.id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title, workActivity: item.work_activity, hazards: item.hazards,
        risks: item.risks, controls: item.controls, ppe: item.ppe,
        plantEquipment: item.plant_equipment, trainingCompetency: item.training_competency,
        emergencyControls: item.emergency_controls, environmentalControls: item.environmental_controls,
        signOffRequirements: item.sign_off_requirements, permitsApprovals: item.permits_approvals,
        monitoringReview: item.monitoring_review, notes: item.notes,
        revisionNumber: item.revision_number, reviewDate: item.review_date, status: newStatus,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      setList((prev) => prev.map((j) => j.id === item.id ? { ...d.jobSwms, signoffs: item.signoffs ?? [] } : j));
    }
  }

  async function openPrint(item: JobSwmsRecord) {
    setLoadingSignoffs(item.id);
    try {
      const r = await fetch(`/api/safety/job-swms/${item.id}/signoffs`, { credentials: 'include' });
      const d = await r.json();
      setPrinting({ swms: item, signoffs: d.signoffs ?? [] });
    } catch {
      setPrinting({ swms: item, signoffs: item.signoffs ?? [] });
    } finally {
      setLoadingSignoffs(null);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-bold text-sm text-slate-700">Job SWMS</h3>
          <p className="text-xs text-slate-400 mt-0.5">{list.length} attached · <Link to="/safety" className="text-primary hover:underline">SWMS Library →</Link></p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors">
          <Plus size={14} /><span className="hidden sm:inline">Add SWMS</span>
        </button>
      </div>

      {list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mb-3"><ShieldAlert size={22} className="text-primary" /></div>
          <p className="font-bold text-sm text-slate-700 mb-1">No SWMS on this job</p>
          <p className="text-xs text-slate-400 mb-4 max-w-xs">Add SWMS from the library. Workers sign on before starting work.</p>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} />Add SWMS
          </button>
        </div>
      )}

      {list.length > 0 && (
        <div className="flex flex-col gap-2">
          {list.map((j) => {
            const signedCount = (j.signoffs ?? []).length;
            return (
              <div key={j.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(j.status)}`}>
                        {j.status.charAt(0).toUpperCase() + j.status.slice(1)}
                      </span>
                      <span className="text-xs text-slate-400">Rev {j.revision_number}</span>
                      {j.review_date && <span className="text-xs text-slate-400">Review: {fmtDate(j.review_date)}</span>}
                    </div>
                    <h4 className="font-bold text-sm text-slate-800">{j.title}</h4>
                    {j.work_activity && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{j.work_activity}</p>}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Users size={11} className="text-slate-400" />
                        {signedCount} signed on
                      </span>
                      {signedCount === 0 && (
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Unsigned</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    {/* Status advance */}
                    {j.status === 'draft' && (
                      <button onClick={() => handleStatusChange(j, 'reviewed')} className="px-2 py-1 rounded-md text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">Review</button>
                    )}
                    {j.status === 'reviewed' && (
                      <button onClick={() => handleStatusChange(j, 'approved')} className="px-2 py-1 rounded-md text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors">Approve</button>
                    )}
                    {/* Sign on */}
                    <button
                      onClick={() => setSignonTarget(j)}
                      className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg transition-colors"
                      title="Sign onto SWMS"
                    >
                      <UserCheck size={12} />Sign On
                    </button>
                    {/* Print */}
                    <button
                      onClick={() => openPrint(j)}
                      disabled={loadingSignoffs === j.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      title="Print / PDF"
                    >
                      {loadingSignoffs === j.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                    </button>
                    {/* Edit */}
                    <button onClick={() => setEditing(j)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
                      <Wand2 size={14} />
                    </button>
                    {/* Delete */}
                    <button onClick={() => handleDelete(j.id, j.title)} disabled={deleting === j.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Remove from job">
                      {deleting === j.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {/* Sign-on list (inline) */}
                {signedCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Signed On ({signedCount})</p>
                    <div className="flex flex-col gap-1.5">
                      {(j.signoffs ?? []).map((s) => (
                        <div key={s.id} className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <UserCheck size={12} className="text-emerald-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800">{s.worker_name}</p>
                            <p className="text-xs text-slate-500">
                              {[s.company_name, s.role].filter(Boolean).join(' · ')}
                              {s.white_card_number ? ` · Card: ${s.white_card_number}` : ''}
                            </p>
                          </div>
                          <p className="text-xs text-slate-400 shrink-0">{new Date(s.signed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddSwmsModal jobId={jobId} onClose={() => setShowAdd(false)} onAdded={(items) => { setList((prev) => [...items.map((i) => ({ ...i, signoffs: [] })), ...prev]); setShowAdd(false); }} />}
        {editing && <SwmsEditModal initial={editing} onClose={() => setEditing(null)} onSaved={(updated) => { setList((prev) => prev.map((j) => j.id === updated.id ? { ...updated, signoffs: j.signoffs ?? [] } : j)); setEditing(null); }} />}
        {printing && <SwmsPrintModal swms={printing.swms} signoffs={printing.signoffs} job={job} onClose={() => setPrinting(null)} />}
        {signonTarget && (
          <SignonModal
            jobSwmsId={signonTarget.id}
            swmsTitle={signonTarget.title}
            onClose={() => setSignonTarget(null)}
            onSigned={(signoff) => {
              setList((prev) => prev.map((j) => j.id === signonTarget.id ? { ...j, signoffs: [signoff, ...(j.signoffs ?? [])] } : j));
              setSignonTarget(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Safety Plans Sub-tab ──────────────────────────────────────────────────────

function SafetyPlansSubTab({ jobId }: { jobId: number }) {
  const [plans, setPlans] = useState<JobSafetyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/safety/job-safety-plans?jobId=${jobId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Remove "${title}" from this job?`)) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/safety/job-safety-plans/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) setPlans((prev) => prev.filter((p) => p.id !== id));
    } finally { setDeleting(null); }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading font-bold text-sm text-slate-700">Job Safety Plans</h3>
          <p className="text-xs text-slate-400 mt-0.5">{plans.length} attached · <Link to="/safety?tab=plans" className="text-primary hover:underline">Safety Plan Library →</Link></p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors">
          <Plus size={14} /><span className="hidden sm:inline">Add Plan</span>
        </button>
      </div>

      {plans.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3"><ClipboardList size={22} className="text-blue-600" /></div>
          <p className="font-bold text-sm text-slate-700 mb-1">No safety plan on this job</p>
          <p className="text-xs text-slate-400 mb-4 max-w-xs">Copy from the Safety Plan Library or start a blank plan for this job.</p>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} />Add Safety Plan
          </button>
        </div>
      )}

      {plans.length > 0 && (
        <div className="flex flex-col gap-2">
          {plans.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(p.status)}`}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-800">{p.title}</h4>
                <div className="flex flex-wrap gap-3 mt-1">
                  {p.site_address && <span className="text-xs text-slate-500">{p.site_address}</span>}
                  {p.site_supervisor && <span className="text-xs text-slate-500">Supervisor: {p.site_supervisor}</span>}
                  {p.first_aid_officer && <span className="text-xs text-slate-500">First Aid: {p.first_aid_officer}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleDelete(p.id, p.title)}
                  disabled={deleting === p.id}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove from job"
                >
                  {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddSafetyPlanModal jobId={jobId} onClose={() => setShowAdd(false)} onAdded={(plan) => { setPlans((prev) => [plan, ...prev]); setShowAdd(false); }} />}
      </AnimatePresence>
    </div>
  );
}

// ── Sign-ons Sub-tab ──────────────────────────────────────────────────────────

function SignonsSubTab({ jobId }: { jobId: number }) {
  const [list, setList] = useState<JobSwmsRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/safety/job-swms?jobId=${jobId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then(async (d) => {
        const items: JobSwmsRecord[] = d.jobSwms ?? [];
        // Fetch signoffs for each
        const withSignoffs = await Promise.all(items.map(async (js) => {
          try {
            const r = await fetch(`/api/safety/job-swms/${js.id}/signoffs`, { credentials: 'include' });
            const sd = await r.json();
            return { ...js, signoffs: sd.signoffs ?? [] };
          } catch {
            return { ...js, signoffs: [] };
          }
        }));
        setList(withSignoffs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  const allSignoffs = list.flatMap((js) => (js.signoffs ?? []).map((s) => ({ ...s, swmsTitle: js.title })));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-heading font-bold text-sm text-slate-700">Sign-on Register</h3>
        <p className="text-xs text-slate-400 mt-0.5">{allSignoffs.length} total sign-ons across {list.length} SWMS</p>
      </div>

      {allSignoffs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-3"><UserCheck size={22} className="text-emerald-600" /></div>
          <p className="font-bold text-sm text-slate-700 mb-1">No sign-ons yet</p>
          <p className="text-xs text-slate-400 max-w-xs">Workers sign on from the SWMS tab before starting work.</p>
        </div>
      )}

      {list.map((js) => {
        const sigs = js.signoffs ?? [];
        if (sigs.length === 0) return null;
        return (
          <div key={js.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <ShieldAlert size={14} className="text-primary shrink-0" />
              <span className="font-bold text-sm text-slate-800">{js.title}</span>
              <span className="text-xs text-slate-400 ml-auto">{sigs.length} signed</span>
            </div>
            <div className="divide-y divide-slate-100">
              {sigs.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <UserCheck size={14} className="text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">{s.worker_name}</p>
                    <p className="text-xs text-slate-500">
                      {[s.company_name, s.role].filter(Boolean).join(' · ')}
                      {s.white_card_number ? ` · Card: ${s.white_card_number}` : ''}
                    </p>
                  </div>
                  {s.signature_data && (
                    <img src={safeUrl(s.signature_data)} alt="sig" className="h-8 max-w-[80px] object-contain border border-slate-200 rounded bg-white" />
                  )}
                  <p className="text-xs text-slate-400 shrink-0">{fmtDate(s.signed_at)}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main JobSafety Component ──────────────────────────────────────────────────

type SubTab = 'swms' | 'plans' | 'signons';

export default function JobSafety({ jobId }: { jobId: number }) {
  const [subTab, setSubTab] = useState<SubTab>('swms');
  const [job, setJob] = useState<JobInfo | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const j = d.job ?? d;
        if (j?.id) setJob(j as JobInfo);
      })
      .catch(() => {});
  }, [jobId]);

  const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: 'swms',    label: 'SWMS',         icon: ShieldAlert },
    { id: 'plans',   label: 'Safety Plans', icon: ClipboardList },
    { id: 'signons', label: 'Sign-ons',     icon: UserCheck },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-slate-200 pb-0">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold transition-colors whitespace-nowrap border-b-2 -mb-px ${
              subTab === id
                ? 'border-primary text-primary bg-orange-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {subTab === 'swms'    && <SwmsSubTab jobId={jobId} job={job} />}
          {subTab === 'plans'   && <SafetyPlansSubTab jobId={jobId} />}
          {subTab === 'signons' && <SignonsSubTab jobId={jobId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
