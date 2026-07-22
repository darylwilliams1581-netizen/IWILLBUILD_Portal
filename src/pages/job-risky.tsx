import { job_risky } from 'virtual:content';
/**
 * /jobs/:id/risky — Risky & Permits
 * Quick field risk assessment and permit check for changed site conditions,
 * new hazards, or task-specific risks found during the day.
 *
 * Flow: Activity → Hazards → Controls → Permit Required? → Sign-off → Finalise
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ChevronLeft, Plus, ShieldAlert, CheckCircle2, AlertTriangle,
  Pencil, Lock, FileText, Users, ClipboardCheck, X, Loader2,
  FileWarning,
} from 'lucide-react';
import MobileOverflowMenu from '@/components/MobileOverflowMenu';
// ── Types ─────────────────────────────────────────────────────────────────────

interface RiskyAssessment {
  id: number;
  job_id: number;
  linked_prestart_id: number | null;
  status: 'draft' | 'finalised';
  assessment_date: string | null;
  assessment_time: string | null;
  recorded_by: string | null;
  activity: string | null;
  hazards_selected: string[] | string | null;
  other_hazard_text: string | null;
  control_measures: string | null;
  permit_required: boolean | number;
  permit_types: string[] | string | null;
  other_permit_text: string | null;
  permit_notes: string | null;
  permit_supervisor_name: string | null;
  permit_supervisor_signature: string | null;
  permit_supervisor_signed_at: string | null;
  workers_involved: string | null;
  workers_briefed: boolean | number;
  notes: string | null;
  finalised_at: string | null;
  created_at: string;
  signatures?: Signature[];
}

interface Signature {
  id: number;
  signer_name: string;
  signature_data: string;
  signed_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Signature pad ─────────────────────────────────────────────────────────────

function SignaturePad({
  onSave,
  onCancel,
  label = 'Sign above',
}: {
  onSave: (data: string) => void;
  onCancel: () => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

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

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setHasStrokes(true);
  }

  function end(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white touch-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-36 cursor-crosshair"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
      </div>
      <p className="text-xs text-slate-400 text-center">{label}</p>
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm">Clear</button>
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm">Cancel</button>
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) onSave(canvas.toDataURL('image/png'));
          }}
          disabled={!hasStrokes}
          className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Supervisor permit sign-off panel ─────────────────────────────────────────

function SupervisorPermitSignoff({
  assessment,
  jobId,
  onDone,
  onClose,
}: {
  assessment: RiskyAssessment;
  jobId: number;
  onDone: (name: string, sig: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(assessment.permit_supervisor_name ?? '');
  const [showPad, setShowPad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(signatureData: string) {
    if (!name.trim()) { setError('Enter supervisor name'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`/api/jobs/${jobId}/risky/${assessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // pass through all existing fields unchanged
          linkedPrestartId: assessment.linked_prestart_id,
          assessmentDate: assessment.assessment_date,
          assessmentTime: assessment.assessment_time,
          recordedBy: assessment.recorded_by,
          activity: assessment.activity,
          hazardsSelected: parseJson(assessment.hazards_selected),
          otherHazardText: assessment.other_hazard_text,
          controlMeasures: assessment.control_measures,
          permitRequired: Boolean(assessment.permit_required),
          permitTypes: parseJson(assessment.permit_types),
          otherPermitText: assessment.other_permit_text,
          permitNotes: assessment.permit_notes,
          workersInvolved: assessment.workers_involved,
          workersBriefed: Boolean(assessment.workers_briefed),
          notes: assessment.notes,
          // supervisor sign-off via a dedicated endpoint would be cleaner,
          // but we store it directly on the record for simplicity
        }),
      });
      if (!r.ok) throw new Error('Save failed');

      // Save supervisor signature via dedicated endpoint
      const r2 = await fetch(`/api/jobs/${jobId}/risky/${assessment.id}/supervisor-signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisorName: name.trim(), signatureData }),
      });
      const d2 = await r2.json() as { error?: string };
      if (!r2.ok) throw new Error(d2.error ?? 'Failed');
      onDone(name.trim(), signatureData);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const permitTypes = parseJson(assessment.permit_types);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="flex items-center gap-3 px-4 safe-top pb-3 bg-amber-700">
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg bg-white/20">
          <X size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-bold text-sm">Supervisor Permit Sign-Off</span>
          <p className="text-xs text-amber-200 truncate">{assessment.activity}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Permit types */}
        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3">
          <p className="text-xs text-amber-200 font-semibold mb-2">Permit types required</p>
          <div className="flex flex-wrap gap-1.5">
            {permitTypes.map(pt => (
              <span key={pt} className="bg-amber-600/60 text-white text-xs px-2 py-0.5 rounded-full">{pt}</span>
            ))}
          </div>
          {assessment.permit_notes && (
            <p className="text-xs text-slate-300 mt-2">{assessment.permit_notes}</p>
          )}
        </div>

        {/* Consent text */}
        <div className="bg-white/10 rounded-xl p-3">
          <p className="text-xs text-slate-200 leading-relaxed">
            By signing, I confirm the required permit type has been identified and the required controls are in place before work continues.
          </p>
        </div>

        {/* Already signed */}
        {assessment.permit_supervisor_signature && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-3 flex items-center gap-3">
            <img
              src={assessment.permit_supervisor_signature}
              alt={assessment.permit_supervisor_name ?? 'Supervisor'}
              className="h-10 w-24 object-contain bg-white rounded"
            />
            <div>
              <p className="text-sm font-semibold text-emerald-300">{assessment.permit_supervisor_name}</p>
              <p className="text-xs text-slate-400">Permit sign-off recorded</p>
            </div>
          </div>
        )}

        {!assessment.permit_supervisor_signature && (
          <>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Supervisor name"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-slate-400 text-sm"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            {!showPad ? (
              <button
                type="button"
                onClick={() => { if (!name.trim()) { setError('Enter supervisor name'); return; } setError(''); setShowPad(true); }}
                className="w-full py-3 rounded-xl bg-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Pencil size={15} /> Sign as Supervisor
              </button>
            ) : (
              <SignaturePad
                label="Supervisor signature"
                onSave={handleSave}
                onCancel={() => setShowPad(false)}
              />
            )}
            {saving && <div className="flex justify-center"><Loader2 size={20} className="animate-spin text-amber-400" /></div>}
          </>
        )}
      </div>

      <div className="p-4 border-t border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold text-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Party sign-off screen ─────────────────────────────────────────────────────

function SignOffScreen({
  assessment,
  jobId,
  onDone,
  onClose,
}: {
  assessment: RiskyAssessment;
  jobId: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [signerName, setSignerName] = useState('');
  const [showPad, setShowPad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [signatures, setSignatures] = useState<Signature[]>(assessment.signatures ?? []);

  async function handleSave(signatureData: string) {
    if (!signerName.trim()) { setError('Enter your name first'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`/api/jobs/${jobId}/risky/${assessment.id}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim(), signatureData }),
      });
      const d = await r.json() as { id?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      setSignatures(prev => [...prev, {
        id: d.id ?? 0,
        signer_name: signerName.trim(),
        signature_data: signatureData,
        signed_at: new Date().toISOString(),
      }]);
      setSignerName('');
      setShowPad(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const hazards = parseJson(assessment.hazards_selected);
  const permitTypes = parseJson(assessment.permit_types);
  const permitRequired = Boolean(assessment.permit_required);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      <div className="flex items-center gap-3 px-4 safe-top pb-3 bg-rose-700">
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg bg-white/20">
          <X size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-bold text-sm">Party Sign-Off</span>
          <p className="text-xs text-rose-200 truncate">{assessment.activity}</p>
        </div>
        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{signatures.length} signed</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Briefing summary */}
        <div className="bg-white/10 rounded-xl p-3 text-sm space-y-2">
          <p className="font-semibold text-rose-200 text-xs uppercase tracking-wide">Hazards</p>
          <div className="flex flex-wrap gap-1.5">
            {hazards.map(h => (
              <span key={h} className="bg-rose-600/60 text-white text-xs px-2 py-0.5 rounded-full">{h}</span>
            ))}
          </div>
          {assessment.other_hazard_text && (
            <p className="text-xs text-slate-300">Other: {assessment.other_hazard_text}</p>
          )}
          <p className="font-semibold text-rose-200 text-xs uppercase tracking-wide mt-2">Controls</p>
          <p className="text-xs text-slate-200">{assessment.control_measures}</p>
          {permitRequired && permitTypes.length > 0 && (
            <>
              <p className="font-semibold text-amber-300 text-xs uppercase tracking-wide mt-2">Permits required</p>
              <div className="flex flex-wrap gap-1.5">
                {permitTypes.map(pt => (
                  <span key={pt} className="bg-amber-600/60 text-white text-xs px-2 py-0.5 rounded-full">{pt}</span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Consent text */}
        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3">
          <p className="text-xs text-amber-200 leading-relaxed">
            By signing, I confirm I have been briefed on this activity, hazard, risk, control measure, and any required permit controls before continuing work.
          </p>
        </div>

        {/* Existing signatures */}
        {signatures.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Signed parties</p>
            {signatures.map(sig => (
              <div key={sig.id} className="bg-white/10 rounded-xl p-3 flex items-center gap-3">
                <img src={sig.signature_data} alt={sig.signer_name} className="h-10 w-24 object-contain bg-white rounded" />
                <div>
                  <p className="text-sm font-semibold">{sig.signer_name}</p>
                  <p className="text-xs text-slate-400">{new Date(sig.signed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add signer */}
        {!showPad ? (
          <div className="space-y-2">
            <input
              type="text"
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-slate-400 text-sm"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="button"
              onClick={() => {
                if (!signerName.trim()) { setError('Enter your name first'); return; }
                setError('');
                setShowPad(true);
              }}
              className="w-full py-3 rounded-xl bg-rose-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Pencil size={15} /> Sign
            </button>
          </div>
        ) : (
          <SignaturePad onSave={handleSave} onCancel={() => setShowPad(false)} />
        )}

        {saving && <div className="flex justify-center"><Loader2 size={20} className="animate-spin text-rose-400" /></div>}
      </div>

      <div className="p-4 border-t border-white/10">
        <button
          type="button"
          onClick={onDone}
          disabled={signatures.length === 0}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40"
        >
          Done — {signatures.length} {signatures.length === 1 ? 'person' : 'people'} signed
        </button>
      </div>
    </div>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  assessmentDate: string;
  assessmentTime: string;
  recordedBy: string;
  activity: string;
  hazardsSelected: string[];
  otherHazardText: string;
  controlMeasures: string;
  permitRequired: boolean | null; // null = not yet answered
  permitTypes: string[];
  otherPermitText: string;
  permitNotes: string;
  workersInvolved: string;
  workersBriefed: boolean;
  notes: string;
}

function emptyForm(): FormState {
  return {
    assessmentDate: today(),
    assessmentTime: nowTime(),
    recordedBy: '',
    activity: '',
    hazardsSelected: [],
    otherHazardText: '',
    controlMeasures: '',
    permitRequired: null,
    permitTypes: [],
    otherPermitText: '',
    permitNotes: '',
    workersInvolved: '',
    workersBriefed: false,
    notes: '',
  };
}

function formFromAssessment(a: RiskyAssessment): FormState {
  // permit_required may be null (column not yet added) — treat as null
  const pr = a.permit_required === null || a.permit_required === undefined
    ? null
    : Boolean(a.permit_required);
  return {
    assessmentDate: a.assessment_date ?? today(),
    assessmentTime: a.assessment_time ?? nowTime(),
    recordedBy: a.recorded_by ?? '',
    activity: a.activity ?? '',
    hazardsSelected: parseJson(a.hazards_selected),
    otherHazardText: a.other_hazard_text ?? '',
    controlMeasures: a.control_measures ?? '',
    permitRequired: pr,
    permitTypes: parseJson(a.permit_types),
    otherPermitText: a.other_permit_text ?? '',
    permitNotes: a.permit_notes ?? '',
    workersInvolved: a.workers_involved ?? '',
    workersBriefed: Boolean(a.workers_briefed),
    notes: a.notes ?? '',
  };
}

function formToBody(f: FormState) {
  return {
    assessmentDate: f.assessmentDate,
    assessmentTime: f.assessmentTime,
    recordedBy: f.recordedBy,
    activity: f.activity,
    hazardsSelected: f.hazardsSelected,
    otherHazardText: f.otherHazardText,
    controlMeasures: f.controlMeasures,
    permitRequired: f.permitRequired ?? false,
    permitTypes: f.permitTypes,
    otherPermitText: f.otherPermitText,
    permitNotes: f.permitNotes,
    workersInvolved: f.workersInvolved,
    workersBriefed: f.workersBriefed,
    notes: f.notes,
  };
}

// ── Chip toggle ───────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
  disabled,
  color = 'rose',
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  color?: 'rose' | 'amber';
}) {
  const sel = color === 'amber'
    ? 'bg-amber-600 text-white border-amber-600'
    : 'bg-rose-600 text-white border-rose-600';
  const unsel = color === 'amber'
    ? 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
    : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:cursor-default ${selected ? sel : unsel}`}
    >
      {label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type View = 'list' | 'form' | 'signoff' | 'supervisor-signoff';

export default function JobRiskyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo: string = (location.state as { returnTo?: string } | null)?.returnTo ?? '/home';
  const jobId = parseInt(id ?? '0', 10);

  const [view, setView] = useState<View>('list');
  const [assessments, setAssessments] = useState<RiskyAssessment[]>([]);
  const [activeAssessment, setActiveAssessment] = useState<RiskyAssessment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveDraftSuccess, setSaveDraftSuccess] = useState(false);
  const saveDraftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finalising, setFinalising] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'general', string>>>({});
  const [finaliseError, setFinaliseError] = useState('');
  const [jobName, setJobName] = useState('');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load list
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/jobs/${jobId}/risky`);
      if (r.ok) setAssessments(await r.json() as RiskyAssessment[]);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void loadList(); }, [loadList]);

  // Load job name
  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { name?: string; job_name?: string } | null) => {
        if (d) setJobName(d.name ?? d.job_name ?? `Job #${jobId}`);
      })
      .catch(() => {});
  }, [jobId]);

  // Auto-save draft
  const scheduleSave = useCallback((f: FormState, assessmentId: number) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/jobs/${jobId}/risky/${assessmentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToBody(f)),
        });
      } catch { /* silent */ }
    }, 1200);
  }, [jobId]);

  function updateForm(patch: Partial<FormState>) {
    setForm(prev => {
      const next = { ...prev, ...patch };
      if (activeAssessment?.status === 'draft') scheduleSave(next, activeAssessment.id);
      return next;
    });
    const keys = Object.keys(patch) as (keyof FormState)[];
    if (keys.some(k => errors[k])) {
      setErrors(prev => {
        const next = { ...prev };
        keys.forEach(k => delete next[k]);
        return next;
      });
    }
  }

  function toggleHazard(h: string) {
    updateForm({
      hazardsSelected: form.hazardsSelected.includes(h)
        ? form.hazardsSelected.filter(x => x !== h)
        : [...form.hazardsSelected, h],
    });
  }

  function togglePermitType(pt: string) {
    updateForm({
      permitTypes: form.permitTypes.includes(pt)
        ? form.permitTypes.filter(x => x !== pt)
        : [...form.permitTypes, pt],
    });
  }

  // Create new assessment
  async function handleCreate() {
    setSaving(true);
    try {
      const f = emptyForm();
      setForm(f);
      const r = await fetch(`/api/jobs/${jobId}/risky`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(f)),
      });
      const d = await r.json() as { id?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      const r2 = await fetch(`/api/jobs/${jobId}/risky/${d.id!}`);
      const assessment = await r2.json() as RiskyAssessment;
      setActiveAssessment(assessment);
      setForm(formFromAssessment(assessment));
      setErrors({});
      setFinaliseError('');
      setView('form');
    } catch (e) {
      setErrors({ general: String(e) });
    } finally {
      setSaving(false);
    }
  }

  // Open existing
  async function handleOpen(a: RiskyAssessment) {
    setLoading(true);
    try {
      const r = await fetch(`/api/jobs/${jobId}/risky/${a.id}`);
      const full = await r.json() as RiskyAssessment;
      setActiveAssessment(full);
      setForm(formFromAssessment(full));
      setErrors({});
      setFinaliseError('');
      setView('form');
    } finally {
      setLoading(false);
    }
  }

  // Validate
  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.activity.trim()) e.activity = 'Activity / task is required';
    if (form.hazardsSelected.length === 0) e.hazardsSelected = 'Select at least one hazard';
    if (form.hazardsSelected.includes('Other') && !form.otherHazardText.trim()) {
      e.otherHazardText = 'Describe the other hazard';
    }
    if (!form.controlMeasures.trim()) e.controlMeasures = 'Control measures are required';
    if (form.permitRequired === null) e.permitRequired = 'Answer whether a permit is required';
    if (form.permitRequired) {
      if (form.permitTypes.length === 0) e.permitTypes = 'Select at least one permit type';
      if (form.permitTypes.includes('Other') && !form.otherPermitText.trim()) {
        e.otherPermitText = 'Describe the other permit';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Save draft
  async function handleSaveDraft() {
    if (!activeAssessment) return;
    setSaving(true);
    setSaveDraftSuccess(false);
    if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
    try {
      await fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(form)),
      });
      await loadList();
      setSaveDraftSuccess(true);
      saveDraftTimer.current = setTimeout(() => setSaveDraftSuccess(false), 3000);
      // Don't navigate away — stay on form so user can continue
    } finally {
      setSaving(false);
    }
  }

  // Go to sign-off
  async function handleGoSignOff() {
    if (!validate()) return;
    if (!form.workersBriefed) {
      setErrors(prev => ({ ...prev, workersBriefed: 'Confirm workers have been briefed' }));
      return;
    }
    if (!activeAssessment) return;
    // Save first
    await fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formToBody(form)),
    });
    // Reload fresh record
    const r = await fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`);
    const full = await r.json() as RiskyAssessment;
    setActiveAssessment(full);
    setView('signoff');
  }

  // Finalise
  async function handleFinalise() {
    if (!activeAssessment) return;
    setFinalising(true);
    setFinaliseError('');
    try {
      const r = await fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}/finalise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      await loadList();
      setView('list');
      setActiveAssessment(null);
    } catch (e) {
      setFinaliseError(String(e));
    } finally {
      setFinalising(false);
    }
  }

  // Reload active assessment
  async function reloadActive() {
    if (!activeAssessment) return;
    const r = await fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`);
    const full = await r.json() as RiskyAssessment;
    setActiveAssessment(full);
    setForm(formFromAssessment(full));
  }

  // ── Supervisor sign-off view ──────────────────────────────────────────────
  if (view === 'supervisor-signoff' && activeAssessment) {
    return (
      <SupervisorPermitSignoff
        assessment={activeAssessment}
        jobId={jobId}
        onClose={() => setView('form')}
        onDone={async () => {
          await reloadActive();
          setView('form');
        }}
      />
    );
  }

  // ── Party sign-off view ───────────────────────────────────────────────────
  if (view === 'signoff' && activeAssessment) {
    return (
      <SignOffScreen
        assessment={activeAssessment}
        jobId={jobId}
        onClose={() => setView('form')}
        onDone={async () => {
          await reloadActive();
          setView('form');
        }}
      />
    );
  }

  // ── Form view ─────────────────────────────────────────────────────────────
  if (view === 'form' && activeAssessment) {
    const isFinalised = activeAssessment.status === 'finalised';
    const sigCount = activeAssessment.signatures?.length ?? 0;
    const hasSupervisorSig = Boolean(activeAssessment.permit_supervisor_signature);
    const permitRequired = form.permitRequired === true;
    const permitRequiredNo = form.permitRequired === false;

    // Can finalise when:
    // - At least one party has signed
    // - If a permit is required, the supervisor has also signed
    // - If no permit required (or permit_required is null/false), supervisor sig not needed
    const canFinalise = sigCount > 0 && (!permitRequired || hasSupervisorSig);

    return (
      <>
        <Helmet>
          <title>Risky & Permits — {jobName}</title>
          <meta name="description" content="Field risk assessment and permit check." />
          <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/risky`} />
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <div className="flex flex-col min-h-screen bg-slate-50">
          {/* Header */}
          <div className="bg-rose-700 text-white px-4 safe-top pb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setView('list'); void loadList(); }}
              className="p-1.5 rounded-lg bg-white/20"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-sm truncate">Risk Assessment</h1>
              <p className="text-xs text-rose-200 truncate">{jobName}</p>
            </div>
            {isFinalised && (
              <span className="flex items-center gap-1 text-xs bg-emerald-600 px-2 py-0.5 rounded-full">
                <Lock size={11} /> Finalised
              </span>
            )}
            {/* Overflow menu — secondary actions */}
            {!isFinalised && (
              <MobileOverflowMenu
                surface="dark"
                items={[
                  {
                    label: 'Save Draft',
                    icon: saving ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />,
                    onSelect: () => void handleSaveDraft(),
                    disabled: saving,
                  },
                  {
                    label: 'Back to list',
                    icon: <ChevronLeft size={15} />,
                    onSelect: () => { setView('list'); void loadList(); },
                    dividerAbove: true,
                  },
                ]}
              />
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 pb-32">

            {/* Details */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Date</label>
                  <input
                    type="date"
                    value={form.assessmentDate}
                    onChange={e => updateForm({ assessmentDate: e.target.value })}
                    disabled={isFinalised}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Time</label>
                  <input
                    type="time"
                    value={form.assessmentTime}
                    onChange={e => updateForm({ assessmentTime: e.target.value })}
                    disabled={isFinalised}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Recorded by / supervisor</label>
                <input
                  type="text"
                  value={form.recordedBy}
                  onChange={e => updateForm({ recordedBy: e.target.value })}
                  disabled={isFinalised}
                  placeholder="Name"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Workers / parties involved</label>
                <input
                  type="text"
                  value={form.workersInvolved}
                  onChange={e => updateForm({ workersInvolved: e.target.value })}
                  disabled={isFinalised}
                  placeholder="Names or crew"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </section>

            {/* Activity */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <ClipboardCheck size={13} className="text-rose-500" /> Activity / Task
              </h2>
              <textarea
                value={form.activity}
                onChange={e => updateForm({ activity: e.target.value })}
                disabled={isFinalised}
                placeholder="Describe the activity or task being assessed…"
                rows={3}
                className={`w-full border rounded-xl px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400 ${errors.activity ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.activity && <p className="text-xs text-red-500">{errors.activity}</p>}
            </section>

            {/* Hazards */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-500" /> Hazards Identified
              </h2>
              {errors.hazardsSelected && <p className="text-xs text-red-500">{errors.hazardsSelected}</p>}
              <div className="flex flex-wrap gap-2">
                {job_risky.HAZARD_OPTIONS.map(h => (
                  <Chip
                    key={h}
                    label={h}
                    selected={form.hazardsSelected.includes(h)}
                    onClick={() => !isFinalised && toggleHazard(h)}
                    disabled={isFinalised}
                  />
                ))}
              </div>
              {form.hazardsSelected.includes('Other') && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Describe other hazard</label>
                  <input
                    type="text"
                    value={form.otherHazardText}
                    onChange={e => updateForm({ otherHazardText: e.target.value })}
                    disabled={isFinalised}
                    placeholder="Required"
                    className={`w-full border rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 ${errors.otherHazardText ? 'border-red-400' : 'border-slate-200'}`}
                  />
                  {errors.otherHazardText && <p className="text-xs text-red-500 mt-1">{errors.otherHazardText}</p>}
                </div>
              )}
            </section>

            {/* Controls */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-rose-500" /> Control Measures
              </h2>
              <p className="text-xs text-slate-400">Write what will be done to remove or reduce the risk before work continues.</p>
              <textarea
                value={form.controlMeasures}
                onChange={e => updateForm({ controlMeasures: e.target.value })}
                disabled={isFinalised}
                placeholder="Describe control measures…"
                rows={4}
                className={`w-full border rounded-xl px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400 ${errors.controlMeasures ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.controlMeasures && <p className="text-xs text-red-500">{errors.controlMeasures}</p>}
            </section>

            {/* Permit required */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <FileWarning size={13} className="text-amber-500" /> Is a permit required for this activity?
              </h2>
              {errors.permitRequired && <p className="text-xs text-red-500">{errors.permitRequired}</p>}
              <div className="flex gap-3">
                {[{ label: 'No', value: false }, { label: 'Yes', value: true }].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => !isFinalised && updateForm({ permitRequired: opt.value, permitTypes: opt.value ? form.permitTypes : [], otherPermitText: '' })}
                    disabled={isFinalised}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors disabled:cursor-default ${
                      form.permitRequired === opt.value
                        ? opt.value
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Permit types — shown only when Yes */}
              {permitRequired && (
                <div className="space-y-3 pt-1">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-700">Confirm required permit controls are in place before work continues.</p>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Permit type(s)</p>
                  {errors.permitTypes && <p className="text-xs text-red-500">{errors.permitTypes}</p>}
                  <div className="flex flex-wrap gap-2">
                    {job_risky.PERMIT_TYPE_OPTIONS.map(pt => (
                      <Chip
                        key={pt}
                        label={pt}
                        selected={form.permitTypes.includes(pt)}
                        onClick={() => !isFinalised && togglePermitType(pt)}
                        disabled={isFinalised}
                        color="amber"
                      />
                    ))}
                  </div>
                  {form.permitTypes.includes('Other') && (
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Describe other permit</label>
                      <input
                        type="text"
                        value={form.otherPermitText}
                        onChange={e => updateForm({ otherPermitText: e.target.value })}
                        disabled={isFinalised}
                        placeholder="Required"
                        className={`w-full border rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 ${errors.otherPermitText ? 'border-red-400' : 'border-slate-200'}`}
                      />
                      {errors.otherPermitText && <p className="text-xs text-red-500 mt-1">{errors.otherPermitText}</p>}
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Permit notes (optional)</label>
                    <textarea
                      value={form.permitNotes}
                      onChange={e => updateForm({ permitNotes: e.target.value })}
                      disabled={isFinalised}
                      placeholder="Additional permit details…"
                      rows={2}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>

                  {/* Supervisor permit sign-off */}
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-2">Supervisor permit sign-off</p>
                    {hasSupervisorSig ? (
                      <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <img
                          src={activeAssessment.permit_supervisor_signature!}
                          alt={activeAssessment.permit_supervisor_name ?? 'Supervisor'}
                          className="h-10 w-24 object-contain bg-white rounded border border-slate-100"
                        />
                        <div>
                          <p className="text-sm font-semibold text-emerald-700">{activeAssessment.permit_supervisor_name}</p>
                          <p className="text-xs text-slate-400">Permit sign-off recorded</p>
                        </div>
                      </div>
                    ) : (
                      !isFinalised && (
                        <button
                          type="button"
                          onClick={() => setView('supervisor-signoff')}
                          className="w-full py-3 rounded-xl border-2 border-dashed border-amber-300 text-amber-600 text-sm font-semibold flex items-center justify-center gap-2"
                        >
                          <Pencil size={14} /> Supervisor Sign Off Permit
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Workers briefed */}
            <section className="bg-white rounded-2xl p-4 shadow-sm">
              <button
                type="button"
                onClick={() => !isFinalised && updateForm({ workersBriefed: !form.workersBriefed })}
                disabled={isFinalised}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                  form.workersBriefed
                    ? 'border-emerald-500 bg-emerald-50'
                    : errors.workersBriefed
                    ? 'border-red-400 bg-red-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${form.workersBriefed ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                  {form.workersBriefed && <CheckCircle2 size={14} className="text-white" />}
                </div>
                <span className={`text-sm font-medium text-left ${form.workersBriefed ? 'text-emerald-700' : 'text-slate-600'}`}>
                  All workers have been briefed on this risk assessment
                </span>
              </button>
              {errors.workersBriefed && <p className="text-xs text-red-500 mt-1">{errors.workersBriefed}</p>}
            </section>

            {/* Signatures summary */}
            {sigCount > 0 && (
              <section className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Users size={13} className="text-slate-400" /> Party Signatures
                  </h2>
                  <span className="text-xs text-emerald-600 font-semibold">{sigCount} signed</span>
                </div>
                <div className="space-y-2">
                  {(activeAssessment.signatures ?? []).map(sig => (
                    <div key={sig.id} className="flex items-center gap-3">
                      <img src={sig.signature_data} alt={sig.signer_name} className="h-8 w-20 object-contain bg-slate-50 rounded border border-slate-100" />
                      <span className="text-sm text-slate-700">{sig.signer_name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Notes */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <FileText size={13} className="text-slate-400" /> Notes (optional)
              </h2>
              <textarea
                value={form.notes}
                onChange={e => updateForm({ notes: e.target.value })}
                disabled={isFinalised}
                placeholder="Any additional notes…"
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
              />
            </section>

            {/* Finalise error */}
            {finaliseError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{finaliseError}</p>
              </div>
            )}

            {/* Permit required — sign-off reminder */}
            {permitRequired && !hasSupervisorSig && !isFinalised && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">Supervisor permit sign-off is required before you can finalise.</p>
              </div>
            )}
          </div>

          {/* Bottom actions */}
          {!isFinalised && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 safe-bottom">
              {/* Save draft success banner */}
              {saveDraftSuccess && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border-t border-emerald-200 text-emerald-700 text-sm font-medium">
                  <CheckCircle2 size={14} className="shrink-0" />
                  Draft saved
                </div>
              )}
              {/* Finalise blocker hint */}
              {sigCount > 0 && permitRequired && !hasSupervisorSig && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs">
                  <AlertTriangle size={12} className="shrink-0" />
                  Supervisor permit sign-off required to finalise
                </div>
              )}
              {sigCount === 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-t border-slate-200 text-slate-500 text-xs">
                  <Users size={12} className="shrink-0" />
                  At least one party signature required to finalise
                </div>
              )}
              <div className="flex gap-3 p-4">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Save Draft'}
                </button>
                {sigCount === 0 ? (
                  <button
                    type="button"
                    onClick={handleGoSignOff}
                    className="flex-1 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <Users size={15} /> Sign Off
                  </button>
                ) : canFinalise ? (
                  <button
                    type="button"
                    onClick={handleFinalise}
                    disabled={finalising}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                  >
                    {finalising ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={15} /> Finalise</>}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoSignOff}
                    className="flex-1 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <Users size={15} /> Add Signatures
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <>
      <Helmet>
        <title>Risky & Permits — {jobName}</title>
        <meta name="description" content="Field risk assessments and permit checks for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/risky`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="flex flex-col min-h-screen bg-slate-50">
        <div className="bg-rose-700 text-white px-4 safe-top pb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="p-1.5 rounded-lg bg-white/20"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm">Risky & Permits</h1>
            <p className="text-xs text-rose-200 truncate">{jobName}</p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-sm font-semibold"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {errors.general && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {errors.general}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-rose-400" />
            </div>
          ) : assessments.length === 0 ? (
            <div className="text-center py-16">
              <ShieldAlert size={36} className="text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">No risk assessments yet</p>
              <p className="text-slate-300 text-xs mt-1">Tap New to start one</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assessments.map(a => {
                const hazards = parseJson(a.hazards_selected);
                const permitTypes = parseJson(a.permit_types);
                const isFinalised = a.status === 'finalised';
                const hasPermit = Boolean(a.permit_required);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleOpen(a)}
                    className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-rose-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold text-slate-800 leading-snug flex-1">
                        {a.activity ?? 'Untitled assessment'}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasPermit && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Permit</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isFinalised ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isFinalised ? 'Finalised' : 'Draft'}
                        </span>
                      </div>
                    </div>
                    {hazards.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {hazards.slice(0, 3).map(h => (
                          <span key={h} className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">{h}</span>
                        ))}
                        {hazards.length > 3 && (
                          <span className="text-xs text-slate-400">+{hazards.length - 3} more</span>
                        )}
                      </div>
                    )}
                    {hasPermit && permitTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {permitTypes.slice(0, 2).map(pt => (
                          <span key={pt} className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">{pt}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{a.assessment_date ?? new Date(a.created_at).toLocaleDateString('en-AU')}</span>
                      {a.recorded_by && <span>· {a.recorded_by}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
