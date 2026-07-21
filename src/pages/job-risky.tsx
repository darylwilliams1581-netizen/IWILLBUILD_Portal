import { job_risky } from 'virtual:content';
/**
 * /jobs/:id/risky — Field Risk Assessment (Risky)
 * Quick risk assessment for changed conditions, new hazards, or task-specific risks.
 * Flow: Activity → Hazards → Controls → Sign-off → Finalise
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ChevronLeft, Plus, ShieldAlert, CheckCircle2, AlertTriangle,
  Pencil, Lock, FileText, Users, ClipboardCheck, X, Loader2,
} from 'lucide-react';

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

// ── Signature pad ─────────────────────────────────────────────────────────────

function SignaturePad({ onSave, onCancel }: { onSave: (data: string) => void; onCancel: () => void }) {
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

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
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
      <p className="text-xs text-slate-400 text-center">Sign above</p>
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm">Clear</button>
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm">Cancel</button>
        <button
          type="button"
          onClick={save}
          disabled={!hasStrokes}
          className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Sign-off screen ───────────────────────────────────────────────────────────

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
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      setSignatures(prev => [...prev, { id: d.id, signer_name: signerName.trim(), signature_data: signatureData, signed_at: new Date().toISOString() }]);
      setSignerName('');
      setShowPad(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const hazards = parseHazards(assessment.hazards_selected);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3 bg-rose-700">
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
        <div className="bg-white/10 rounded-xl p-3 text-sm space-y-1">
          <p className="font-semibold text-rose-200 text-xs uppercase tracking-wide mb-2">Hazards identified</p>
          <div className="flex flex-wrap gap-1.5">
            {hazards.map(h => (
              <span key={h} className="bg-rose-600/60 text-white text-xs px-2 py-0.5 rounded-full">{h}</span>
            ))}
          </div>
          {assessment.other_hazard_text && (
            <p className="text-xs text-slate-300 mt-1">Other: {assessment.other_hazard_text}</p>
          )}
          <p className="font-semibold text-rose-200 text-xs uppercase tracking-wide mt-3 mb-1">Controls</p>
          <p className="text-xs text-slate-200">{assessment.control_measures}</p>
        </div>

        {/* Consent text */}
        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3">
          <p className="text-xs text-amber-200 leading-relaxed">
            By signing, I confirm I have been briefed on this activity, hazard, risk, and control measure before continuing work.
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
              onClick={() => { if (!signerName.trim()) { setError('Enter your name first'); return; } setError(''); setShowPad(true); }}
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

      {/* Done */}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHazards(raw: string[] | string | null | undefined): string[] {
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

// ── Assessment form ───────────────────────────────────────────────────────────

interface FormState {
  assessmentDate: string;
  assessmentTime: string;
  recordedBy: string;
  activity: string;
  hazardsSelected: string[];
  otherHazardText: string;
  controlMeasures: string;
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
    workersBriefed: false,
    notes: '',
  };
}

function formFromAssessment(a: RiskyAssessment): FormState {
  return {
    assessmentDate: a.assessment_date ?? today(),
    assessmentTime: a.assessment_time ?? nowTime(),
    recordedBy: a.recorded_by ?? '',
    activity: a.activity ?? '',
    hazardsSelected: parseHazards(a.hazards_selected),
    otherHazardText: a.other_hazard_text ?? '',
    controlMeasures: a.control_measures ?? '',
    workersBriefed: Boolean(a.workers_briefed),
    notes: a.notes ?? '',
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

type View = 'list' | 'form' | 'signoff';

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
      if (r.ok) {
        const data = await r.json() as RiskyAssessment[];
        setAssessments(data);
      }
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
          body: JSON.stringify({
            assessmentDate: f.assessmentDate,
            assessmentTime: f.assessmentTime,
            recordedBy: f.recordedBy,
            activity: f.activity,
            hazardsSelected: f.hazardsSelected,
            otherHazardText: f.otherHazardText,
            controlMeasures: f.controlMeasures,
            workersBriefed: f.workersBriefed,
            notes: f.notes,
          }),
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
    // Clear relevant errors
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

  // Create new assessment
  async function handleCreate() {
    setSaving(true);
    try {
      const f = emptyForm();
      setForm(f);
      const r = await fetch(`/api/jobs/${jobId}/risky`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentDate: f.assessmentDate,
          assessmentTime: f.assessmentTime,
        }),
      });
      const d = await r.json() as { id: number };
      if (!r.ok) throw new Error((d as { error?: string }).error ?? 'Failed');
      // Load the new record
      const r2 = await fetch(`/api/jobs/${jobId}/risky/${d.id}`);
      const assessment = await r2.json() as RiskyAssessment;
      setActiveAssessment(assessment);
      setForm(formFromAssessment(assessment));
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
      setView('form');
    } finally {
      setLoading(false);
    }
  }

  // Validate form
  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.activity.trim()) e.activity = 'Activity / task is required';
    if (form.hazardsSelected.length === 0) e.hazardsSelected = 'Select at least one hazard';
    if (form.hazardsSelected.includes('Other') && !form.otherHazardText.trim()) {
      e.otherHazardText = 'Describe the other hazard';
    }
    if (!form.controlMeasures.trim()) e.controlMeasures = 'Control measures are required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Save draft manually
  async function handleSaveDraft() {
    if (!activeAssessment) return;
    setSaving(true);
    try {
      await fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentDate: form.assessmentDate,
          assessmentTime: form.assessmentTime,
          recordedBy: form.recordedBy,
          activity: form.activity,
          hazardsSelected: form.hazardsSelected,
          otherHazardText: form.otherHazardText,
          controlMeasures: form.controlMeasures,
          workersBriefed: form.workersBriefed,
          notes: form.notes,
        }),
      });
      await loadList();
      setView('list');
    } finally {
      setSaving(false);
    }
  }

  // Go to sign-off
  function handleGoSignOff() {
    if (!validate()) return;
    if (!form.workersBriefed) {
      setErrors(prev => ({ ...prev, workersBriefed: 'Confirm workers have been briefed' }));
      return;
    }
    // Save first, then open sign-off
    if (activeAssessment) {
      fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentDate: form.assessmentDate,
          assessmentTime: form.assessmentTime,
          recordedBy: form.recordedBy,
          activity: form.activity,
          hazardsSelected: form.hazardsSelected,
          otherHazardText: form.otherHazardText,
          controlMeasures: form.controlMeasures,
          workersBriefed: form.workersBriefed,
          notes: form.notes,
        }),
      }).then(() => {
        // Reload to get fresh record
        return fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`);
      }).then(r => r.json())
        .then((full: RiskyAssessment) => {
          setActiveAssessment(full);
          setView('signoff');
        })
        .catch(() => setView('signoff'));
    }
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
      const d = await r.json();
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

  // ── Sign-off view ─────────────────────────────────────────────────────────
  if (view === 'signoff' && activeAssessment) {
    return (
      <SignOffScreen
        assessment={activeAssessment}
        jobId={jobId}
        onClose={() => setView('form')}
        onDone={async () => {
          // Reload assessment with fresh signatures
          const r = await fetch(`/api/jobs/${jobId}/risky/${activeAssessment.id}`);
          const full = await r.json() as RiskyAssessment;
          setActiveAssessment(full);
          setView('form');
        }}
      />
    );
  }

  // ── Form view ─────────────────────────────────────────────────────────────
  if (view === 'form' && activeAssessment) {
    const isFinalised = activeAssessment.status === 'finalised';
    const sigCount = activeAssessment.signatures?.length ?? 0;

    return (
      <>
        <Helmet>
          <title>Risky — {jobName}</title>
          <meta name="description" content="Field risk assessment for changed conditions and new hazards." />
          <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/risky`} />
        </Helmet>
        <div className="flex flex-col min-h-screen bg-slate-50">
          {/* Header */}
          <div className="bg-rose-700 text-white px-4 pt-safe-top pt-4 pb-3 flex items-center gap-3">
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
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 pb-32">

            {/* Date / time / recorded by */}
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
              {errors.hazardsSelected && (
                <p className="text-xs text-red-500">{errors.hazardsSelected}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {job_risky.HAZARD_OPTIONS.map(h => {
                  const selected = form.hazardsSelected.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => !isFinalised && toggleHazard(h)}
                      disabled={isFinalised}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'
                      } disabled:cursor-default`}
                    >
                      {h}
                    </button>
                  );
                })}
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
                <span className={`text-sm font-medium ${form.workersBriefed ? 'text-emerald-700' : 'text-slate-600'}`}>
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
                    <Users size={13} className="text-slate-400" /> Signatures
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

            {finaliseError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{finaliseError}</p>
              </div>
            )}
          </div>

          {/* Bottom actions */}
          {!isFinalised && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 flex gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold"
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
              ) : (
                <button
                  type="button"
                  onClick={handleFinalise}
                  disabled={finalising}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                >
                  {finalising ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={15} /> Finalise</>}
                </button>
              )}
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
        <title>Risky — {jobName}</title>
        <meta name="description" content="Field risk assessments for this job." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/risky`} />
      </Helmet>
      <div className="flex flex-col min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-rose-700 text-white px-4 pt-safe-top pt-4 pb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="p-1.5 rounded-lg bg-white/20"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm">Risky</h1>
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
                const hazards = parseHazards(a.hazards_selected);
                const isFinalised = a.status === 'finalised';
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
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        isFinalised ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {isFinalised ? 'Finalised' : 'Draft'}
                      </span>
                    </div>
                    {hazards.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {hazards.slice(0, 4).map(h => (
                          <span key={h} className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">{h}</span>
                        ))}
                        {hazards.length > 4 && (
                          <span className="text-xs text-slate-400">+{hazards.length - 4} more</span>
                        )}
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
