import { job_site_prestart } from 'virtual:content';
/**
 * /jobs/:id/site-prestart — Site Prestart / Daily Prestart
 *
 * SMEAC-structured daily safety briefing with worker sign-on.
 * Mobile-first, large touch targets, fast on site.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ChevronLeft, ChevronDown, ChevronUp, Plus, CheckCircle2,
  AlertTriangle, Loader2, ClipboardCheck, Users, FileText,
  Pen, X, Check, Printer, HardHat, Shield, Info,
  ChevronRight, Clock, Wrench, Phone, CalendarDays, Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DelayModal, type DelayEntry } from '@/components/job/JobDelays';
import MobileOverflowMenu from '@/components/MobileOverflowMenu';
import JobPickerSheet from '@/components/JobPickerSheet';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SitePrestart {
  id: number;
  job_id: number;
  status: 'draft' | 'finalised' | 'closed';
  job_number: string;
  job_name: string;
  customer_name: string;
  site_address: string;
  prestart_date: string;
  start_time: string;
  supervisor_name: string;
  first_aid_person: string;
  weather: string;
  rainfall_mm: number | null;
  // Situation
  site_conditions: string;
  changed_conditions: string;
  weather_concerns: string;
  access_issues: string;
  public_interface: string;
  live_services: string;
  underground_services: string;
  other_hazards: string;
  situation_checkboxes: Record<string, boolean>;
  // Mission
  planned_work: string;
  work_location: string;
  plant_equipment: string;
  tools_required: string;
  deliveries_expected: string;
  key_tasks: string;
  // Execution
  execution_checklist: Record<string, boolean>;
  critical_controls: string;
  task_sequencing: string;
  supervisor_instructions: string;
  // Admin
  admin_checklist: Record<string, boolean>;
  hazards_actions: string;
  materials_delivered: string;
  plant_used: string;
  // Command
  emergency_number: string;
  electricity_emergency: string;
  radio_channel: string;
  assembly_point: string;
  assembly_point_confirmed: boolean;
  stop_work_authority_confirmed: boolean;
  // SWMS
  relevant_swms_ids: number[];
  swms_reviewed_confirmed: boolean;
  swms_review_notes: string;
  swms_snapshot: Array<{ id: number; title: string; revision?: string }>;
  no_swms_required: boolean;
  no_swms_reason: string;
  // Weather/Delays
  weather_summary: string;
  ground_condition: string;
  weather_delay: boolean;
  delay_hours: number | null;
  delay_reason: string;
  // Sign-off
  supervisor_signoff_name: string;
  supervisor_signature: string;
  submitted_at: string | null;
  worker_count?: number;
  copied_from_id: number | null;
}

interface Worker {
  id: number;
  full_name: string;
  company_employer: string;
  role_trade: string;
  fit_for_work: boolean;
  white_card_number: string;
  signature: string;
  signed_at: string;
}

interface JobSwms {
  id: number;
  swms_template_id: number;
  swms_title: string;
  work_activity: string;
  status: string;
}

// ── Signature Pad ─────────────────────────────────────────────────────────────

function SignaturePad({ onSave, onClear, label }: {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
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
    drawing.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasStrokes(true);
  }

  function end(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = false;
    if (hasStrokes) onSave(canvasRef.current!.toDataURL());
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onClear();
  }

  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-slate-500">{label}</p>}
      <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full touch-none"
          style={{ height: 120 }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-400">Sign above</p>
        <button onClick={clear} className="text-xs text-red-500 underline">Clear</button>
      </div>
    </div>
  );
}

// ── Collapsible Section ───────────────────────────────────────────────────────

function Section({
  title, icon: Icon, badge, children, defaultOpen = false, accent,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', accent ?? 'bg-violet-100')}>
          <Icon size={16} className={accent ? 'text-white' : 'text-violet-700'} />
        </div>
        <span className="flex-1 font-semibold text-slate-800 text-sm">{title}</span>
        {badge && (
          <Badge variant="secondary" className="text-xs mr-1">{badge}</Badge>
        )}
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">{children}</div>}
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
      {helper && <p className="text-xs text-slate-400">{helper}</p>}
    </div>
  );
}

// ── Checkbox Row ──────────────────────────────────────────────────────────────

function CheckRow({ label, checked, onChange, disabled }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors',
        checked ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className={cn(
        'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
        checked ? 'bg-green-500 border-green-500' : 'border-slate-300',
      )}>
        {checked && <Check size={12} className="text-white" />}
      </div>
      <span className="text-sm text-slate-700">{label}</span>
    </button>
  );
}

// ── List Picker ───────────────────────────────────────────────────────────────

interface PrestartListProps {
  jobId: number;
  onSelect: (p: SitePrestart) => void;
  onNew: () => void;
}

function PrestartList({ jobId, onSelect, onNew }: PrestartListProps) {
  const [prestarts, setPrestarts] = useState<SitePrestart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/site-prestarts`)
      .then(r => r.json())
      .then(d => setPrestarts(d.prestarts ?? []))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={24} className="animate-spin text-violet-600" />
    </div>
  );

  return (
    <div className="space-y-3">
      <Button onClick={onNew} className="w-full bg-violet-500 hover:bg-violet-700 text-white rounded-xl h-12">
        <Plus size={18} className="mr-2" />
        Create Today's Prestart
      </Button>
      {prestarts.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No prestarts yet for this job.
        </div>
      ) : (
        <div className="space-y-2">
          {prestarts.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white text-left hover:border-violet-300 transition-colors"
            >
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                p.status === 'finalised' ? 'bg-green-100' : 'bg-amber-100',
              )}>
                <ClipboardCheck size={18} className={p.status === 'finalised' ? 'text-green-600' : 'text-amber-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {p.prestart_date ? new Date(p.prestart_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date'}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {p.supervisor_name || 'No supervisor'} · {p.worker_count ?? 0} workers
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.status === 'finalised' ? 'default' : 'secondary'} className="text-xs capitalize">
                  {p.status}
                </Badge>
                <ChevronRight size={14} className="text-slate-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── New Prestart Dialog ───────────────────────────────────────────────────────

function NewPrestartDialog({ jobId, onCreated, onCancel }: {
  jobId: number;
  onCreated: (p: SitePrestart) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'blank' | 'copy' | null>(null);
  const [previousPrestarts, setPreviousPrestarts] = useState<SitePrestart[]>([]);
  const [selectedCopyId, setSelectedCopyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/site-prestarts`)
      .then(r => r.json())
      .then(d => setPreviousPrestarts((d.prestarts ?? []).filter((p: SitePrestart) => p.status === 'finalised')));
  }, [jobId]);

  async function create() {
    setCreating(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (mode === 'copy' && selectedCopyId) body.copyFromId = selectedCopyId;
      const r = await fetch(`/api/jobs/${jobId}/site-prestarts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onCreated(d.prestart);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-slate-800">Create Today's Prestart</h3>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setMode('blank'); setSelectedCopyId(null); }}
          className={cn(
            'p-4 rounded-xl border-2 text-left transition-colors',
            mode === 'blank' ? 'border-violet-600 bg-violet-50' : 'border-slate-200 bg-white',
          )}
        >
          <FileText size={20} className="text-violet-600 mb-2" />
          <p className="text-sm font-semibold text-slate-800">Start blank</p>
          <p className="text-xs text-slate-500 mt-0.5">Fresh prestart for today</p>
        </button>
        <button
          onClick={() => setMode('copy')}
          disabled={previousPrestarts.length === 0}
          className={cn(
            'p-4 rounded-xl border-2 text-left transition-colors',
            mode === 'copy' ? 'border-violet-600 bg-violet-50' : 'border-slate-200 bg-white',
            previousPrestarts.length === 0 && 'opacity-40 cursor-not-allowed',
          )}
        >
          <ClipboardCheck size={20} className="text-violet-600 mb-2" />
          <p className="text-sm font-semibold text-slate-800">Copy previous</p>
          <p className="text-xs text-slate-500 mt-0.5">Carry forward crew & SWMS</p>
        </button>
      </div>

      {mode === 'copy' && previousPrestarts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">Select prestart to copy from:</p>
          {previousPrestarts.slice(0, 5).map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedCopyId(p.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                selectedCopyId === p.id ? 'border-violet-600 bg-violet-50' : 'border-slate-200 bg-white',
              )}
            >
              <div className={cn('w-4 h-4 rounded-full border-2 flex-shrink-0', selectedCopyId === p.id ? 'border-violet-600 bg-violet-500' : 'border-slate-300')} />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {p.prestart_date ? new Date(p.prestart_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date'}
                </p>
                <p className="text-xs text-slate-500">{p.supervisor_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl">Cancel</Button>
        <Button
          onClick={create}
          disabled={!mode || (mode === 'copy' && !selectedCopyId) || creating}
          className="flex-1 bg-violet-500 hover:bg-violet-700 text-white rounded-xl"
        >
          {creating ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
          Create
        </Button>
      </div>
    </div>
  );
}

// ── Worker Sign-On Screen ─────────────────────────────────────────────────────

function WorkerSignOnScreen({ prestart, workers, onWorkerAdded, onClose }: {
  prestart: SitePrestart;
  workers: Worker[];
  onWorkerAdded: (w: Worker) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    fullName: '',
    companyEmployer: '',
    roleTrade: '',
    fitForWork: true,
    whiteCardNumber: '',
    signature: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const swmsSnapshot = prestart.swms_snapshot
    ? (typeof prestart.swms_snapshot === 'string' ? JSON.parse(prestart.swms_snapshot) : prestart.swms_snapshot) as Array<{ id: number; title: string }>
    : [];

  async function submit() {
    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    if (!form.signature) { setError('Signature is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const r = await fetch(`/api/jobs/${prestart.job_id}/site-prestarts/${prestart.id}/workers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName,
          companyEmployer: form.companyEmployer,
          roleTrade: form.roleTrade,
          fitForWork: form.fitForWork,
          whiteCardNumber: form.whiteCardNumber,
          signature: form.signature,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onWorkerAdded(d.worker);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setForm({ fullName: '', companyEmployer: '', roleTrade: '', fitForWork: true, whiteCardNumber: '', signature: '' });
      }, 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
      {/* Locked summary */}
      <div className="bg-violet-500 text-white px-4 pt-3 pb-4 safe-top">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={18} />
            <span className="font-bold text-sm">Site Prestart Sign-On</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/20">
            <X size={16} />
          </button>
        </div>
        <div className="bg-white/15 rounded-xl p-3 space-y-1 text-sm">
          <p><span className="opacity-70 text-xs">Job</span> <span className="font-semibold">{prestart.job_number} — {prestart.job_name}</span></p>
          <p><span className="opacity-70 text-xs">Site</span> <span>{prestart.site_address}</span></p>
          <p><span className="opacity-70 text-xs">Date</span> <span>{prestart.prestart_date ? new Date(prestart.prestart_date).toLocaleDateString('en-AU') : '—'}</span></p>
          <p><span className="opacity-70 text-xs">Supervisor</span> <span>{prestart.supervisor_name}</span></p>
          {prestart.planned_work && (
            <p><span className="opacity-70 text-xs">Today's work</span> <span className="line-clamp-2">{prestart.planned_work}</span></p>
          )}
          {swmsSnapshot.length > 0 ? (
            <p><span className="opacity-70 text-xs">SWMS reviewed</span> <span>{swmsSnapshot.map(s => s.title).join(', ')}</span></p>
          ) : (
            <p className="flex items-center gap-1.5">
              <span className="opacity-70 text-xs">SWMS</span>
              <span className="bg-white/25 text-white text-xs font-medium px-2 py-0.5 rounded-full">No SWMS selected</span>
            </p>
          )}
        </div>
        <p className="text-xs opacity-70 mt-2 text-center">
          {workers.length} worker{workers.length !== 1 ? 's' : ''} signed on
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-green-500" />
            </div>
            <p className="font-semibold text-slate-800">Signed on!</p>
            <p className="text-sm text-slate-500">Ready for next worker</p>
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              By signing, I confirm I attended today's prestart, am fit for work, understand today's work activities, hazards, controls, PPE requirements, emergency arrangements, and the relevant SWMS reviewed for today.
            </div>

            <Field label="Full Name *">
              <Input
                value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                placeholder="Your full name"
                className="h-12 text-base rounded-xl"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Company / Employer">
                <Input
                  value={form.companyEmployer}
                  onChange={e => setForm(f => ({ ...f, companyEmployer: e.target.value }))}
                  placeholder="Company"
                  className="h-11 rounded-xl"
                />
              </Field>
              <Field label="Role / Trade">
                <Input
                  value={form.roleTrade}
                  onChange={e => setForm(f => ({ ...f, roleTrade: e.target.value }))}
                  placeholder="Trade"
                  className="h-11 rounded-xl"
                />
              </Field>
            </div>

            <Field label="White Card No. (optional)">
              <Input
                value={form.whiteCardNumber}
                onChange={e => setForm(f => ({ ...f, whiteCardNumber: e.target.value }))}
                placeholder="White card number"
                className="h-11 rounded-xl"
              />
            </Field>

            <CheckRow
              label="I am fit for work today"
              checked={form.fitForWork}
              onChange={v => setForm(f => ({ ...f, fitForWork: v }))}
            />

            <Field label="Signature *">
              <SignaturePad
                onSave={sig => setForm(f => ({ ...f, signature: sig }))}
                onClear={() => setForm(f => ({ ...f, signature: '' }))}
              />
            </Field>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button
              onClick={submit}
              disabled={submitting}
              className="w-full h-14 bg-violet-500 hover:bg-violet-700 text-white rounded-xl text-base font-bold"
            >
              {submitting ? <Loader2 size={18} className="animate-spin mr-2" /> : <Pen size={18} className="mr-2" />}
              Sign On
            </Button>
          </>
        )}

        {workers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Signed on ({workers.length})</p>
            {workers.map(w => (
              <div key={w.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
                <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{w.full_name}</p>
                  <p className="text-xs text-slate-500 truncate">{w.role_trade || w.company_employer || '—'}</p>
                </div>
                {!w.fit_for_work && (
                  <Badge variant="destructive" className="text-xs">Not fit</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type View = 'list' | 'new' | 'form' | 'signon';

export default function JobSitePrestartPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo: string = (location.state as { returnTo?: string } | null)?.returnTo ?? '/home';
  const jobId = parseInt(id ?? '0', 10);

  const [view, setView] = useState<View>('list');
  const [prestart, setPrestart] = useState<SitePrestart | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [delayModalOpen, setDelayModalOpen] = useState(false);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [delays, setDelays] = useState<DelayEntry[]>([]);
  const [jobSwms, setJobSwms] = useState<JobSwms[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [finalising, setFinalising] = useState(false);
  const [finaliseError, setFinaliseError] = useState('');
  const [showFinaliseConfirm, setShowFinaliseConfirm] = useState(false);
  const [supervisorSig, setSupervisorSig] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load SWMS for this job
  useEffect(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${jobId}/swms`)
      .then(r => r.json())
      .then(d => setJobSwms(d.jobSwms ?? []));
  }, [jobId]);

  // Load full prestart when selected
  async function loadPrestart(p: SitePrestart) {
    const r = await fetch(`/api/jobs/${jobId}/site-prestarts/${p.id}`);
    const d = await r.json();
    const full = d.prestart as SitePrestart;
    // Parse JSON fields
    for (const key of ['situation_checkboxes', 'execution_checklist', 'admin_checklist', 'relevant_swms_ids', 'swms_snapshot']) {
      const val = (full as Record<string, unknown>)[key];
      if (typeof val === 'string') {
        try { (full as Record<string, unknown>)[key] = JSON.parse(val); } catch { /* ignore */ }
      }
    }
    setPrestart(full);
    setWorkers(d.workers ?? []);
    // Load existing delays for this job
    try {
      const dr = await fetch(`/api/jobs/${jobId}/delays`, { credentials: 'include' });
      if (dr.ok) {
        const dd = await dr.json() as { delays?: DelayEntry[] };
        setDelays(dd.delays ?? []);
      }
    } catch { /* non-critical */ }
    setView('form');
  }

  // Auto-save debounced
  const autoSave = useCallback((updates: Partial<SitePrestart>) => {
    if (!prestart || prestart.status === 'finalised') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/jobs/${jobId}/site-prestarts/${prestart.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        setSaveMsg('Saved');
        setTimeout(() => setSaveMsg(''), 2000);
      } catch { /* ignore */ }
      setSaving(false);
    }, 800);
  }, [prestart, jobId]);

  function update(field: keyof SitePrestart, value: unknown) {
    if (!prestart) return;
    const updated = { ...prestart, [field]: value } as SitePrestart;
    setPrestart(updated);
    autoSave({ [field]: value });
  }

  function updateChecklist(field: 'situation_checkboxes' | 'execution_checklist' | 'admin_checklist', key: string, val: boolean) {
    if (!prestart) return;
    const current = (prestart[field] as Record<string, boolean>) ?? {};
    const updated = { ...current, [key]: val };
    update(field, updated);
  }

  function toggleSwms(swmsId: number) {
    if (!prestart) return;
    const current = Array.isArray(prestart.relevant_swms_ids) ? prestart.relevant_swms_ids : [];
    const updated = current.includes(swmsId)
      ? current.filter(id => id !== swmsId)
      : [...current, swmsId];
    // Build snapshot
    const snapshot = updated.map(sid => {
      const s = jobSwms.find(j => j.id === sid);
      return s ? { id: s.id, title: s.swms_title } : { id: sid, title: String(sid) };
    });
    const p2 = { ...prestart, relevant_swms_ids: updated, swms_snapshot: snapshot };
    setPrestart(p2 as SitePrestart);
    autoSave({ relevant_swms_ids: updated, swms_snapshot: snapshot });
  }

  async function finalise() {
    if (!prestart) return;
    setFinalising(true);
    setFinaliseError('');
    try {
      const r = await fetch(`/api/jobs/${jobId}/site-prestarts/${prestart.id}/finalise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisorSignature: supervisorSig || prestart.supervisor_signature,
          supervisorSignoffName: prestart.supervisor_signoff_name || prestart.supervisor_name,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      setPrestart(p => p ? { ...p, status: 'finalised' } : p);
      setShowFinaliseConfirm(false);
    } catch (e) {
      setFinaliseError(String(e));
    } finally {
      setFinalising(false);
    }
  }

  function printPrestart() {
    window.print();
  }

  const isReadOnly = prestart?.status === 'finalised' || prestart?.status === 'closed';

  // ── Sign-on view ───────────────────────────────────────────────────────────
  if (view === 'signon' && prestart) {
    return (
      <WorkerSignOnScreen
        prestart={prestart}
        workers={workers}
        onWorkerAdded={w => setWorkers(ws => [...ws, w])}
        onClose={() => setView('form')}
      />
    );
  }

  return (
    <>
      <Helmet>
        <title>Site Prestart — {prestart?.job_name ?? 'Job'}</title>
        <meta name="description" content="Daily site safety briefing and worker sign-on for construction jobs." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/site-prestart`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-dvh bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-20 safe-top">
          <div className="flex items-center gap-3 px-4 pt-3 pb-3">
            <button
              onClick={() => {
                if (view === 'form' || view === 'new') setView('list');
                else navigate(returnTo);
              }}
              className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
              aria-label="Back"
            >
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-slate-900 text-base leading-tight truncate">Site Prestart</h1>
              <p className="text-xs text-slate-500 truncate">
                {prestart?.job_name ?? 'Daily site safety briefing'}
              </p>
            </div>
            {view === 'form' && prestart && (
              <div className="flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
                {saveMsg && <span className="text-xs text-green-600 hidden sm:inline">{saveMsg}</span>}
                {/* Overflow menu — secondary actions (Print visible on desktop too) */}
                <div className="hidden sm:flex items-center gap-2">
                  {prestart.status === 'finalised' && (
                    <button onClick={printPrestart} className="p-2 rounded-xl hover:bg-slate-100" title="Print">
                      <Printer size={18} className="text-slate-600" />
                    </button>
                  )}
                </div>
                <MobileOverflowMenu
                  surface="light"
                  className="sm:hidden"
                  items={[
                    {
                      label: 'Print',
                      icon: <Printer size={15} />,
                      onSelect: printPrestart,
                      disabled: prestart.status !== 'finalised',
                    },
                    {
                      label: 'Home',
                      icon: <ChevronLeft size={15} />,
                      onSelect: () => navigate('/home'),
                      dividerAbove: true,
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-4 max-w-lg mx-auto space-y-4 pb-24">

          {/* List view */}
          {view === 'list' && (
            <PrestartList
              jobId={jobId}
              onSelect={loadPrestart}
              onNew={() => setView('new')}
            />
          )}

          {/* New prestart dialog */}
          {view === 'new' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <NewPrestartDialog
                jobId={jobId}
                onCreated={p => loadPrestart(p)}
                onCancel={() => setView('list')}
              />
            </div>
          )}

          {/* Form view */}
          {view === 'form' && prestart && (
            <>
              {/* Status bar */}
              <div className={cn(
                'flex items-center justify-between px-4 py-2.5 rounded-xl',
                prestart.status === 'finalised' ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200',
              )}>
                <div className="flex items-center gap-2">
                  {prestart.status === 'finalised'
                    ? <CheckCircle2 size={16} className="text-green-600" />
                    : <Clock size={16} className="text-amber-600" />}
                  <span className="text-sm font-medium capitalize text-slate-700">{prestart.status}</span>
                </div>
                {prestart.status !== 'finalised' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setView('signon')}
                      className="h-8 rounded-lg text-xs"
                    >
                      <Users size={13} className="mr-1" />
                      Sign-on ({workers.length})
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowFinaliseConfirm(true)}
                      className="h-8 rounded-lg text-xs bg-green-600 hover:bg-green-700 text-white"
                    >
                      Finalise
                    </Button>
                  </div>
                )}
                {prestart.status === 'finalised' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setView('signon')}
                      className="h-8 rounded-lg text-xs"
                    >
                      <Users size={13} className="mr-1" />
                      Sign-on ({workers.length})
                    </Button>
                    <button onClick={printPrestart} className="hidden sm:inline text-xs text-slate-500 underline">Print</button>
                  </div>
                )}
              </div>

              {/* Safety motto */}
              <div className="text-center py-1">
                <p className="text-xs text-slate-400 italic">Think Safe · Work Safe · Go Home Safe</p>
              </div>

              {/* Section 1: Job Details */}
              <Section title="Job Details" icon={HardHat} defaultOpen accent="bg-violet-500">
                <p className="text-xs text-slate-400 -mt-1">Pick the job — details will fill in automatically.</p>

                {/* Job picker button */}
                <Field label="Job">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setJobPickerOpen(true)}
                    className="w-full min-h-[2.75rem] rounded-xl border border-input bg-background px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-violet-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="flex-1 min-w-0">
                      {prestart.job_number || prestart.job_name ? (
                        <>
                          <p className="font-semibold text-foreground truncate">{prestart.job_name || '—'}</p>
                          {prestart.job_number && <p className="text-xs font-mono text-muted-foreground">{prestart.job_number}</p>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Pick a job…</span>
                      )}
                    </div>
                    {!isReadOnly && <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
                  </button>
                </Field>

                {/* Auto-filled client — read-only display */}
                {prestart.customer_name && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-xs text-slate-400 shrink-0">Client</span>
                    <span className="text-sm font-medium text-slate-700 truncate">{prestart.customer_name}</span>
                  </div>
                )}

                {/* Site address — editable, pre-filled from job */}
                <Field label="Site Address">
                  <Input
                    value={prestart.site_address ?? ''}
                    onChange={e => update('site_address', e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Address auto-filled from job…"
                    className="h-10 rounded-xl"
                  />
                </Field>

                <Field label="Date">
                  <Input type="date" value={prestart.prestart_date ?? ''} onChange={e => update('prestart_date', e.target.value)} disabled={isReadOnly} className="h-10 rounded-xl" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Time">
                    <Input type="time" value={prestart.start_time ?? ''} onChange={e => update('start_time', e.target.value)} disabled={isReadOnly} className="h-10 rounded-xl" />
                  </Field>
                  <Field label="Weather">
                    <Input value={prestart.weather ?? ''} onChange={e => update('weather', e.target.value)} disabled={isReadOnly} placeholder="e.g. Sunny" className="h-10 rounded-xl" />
                  </Field>
                </div>
              </Section>

              {/* Section 2: Situation */}
              <Section title="S — Situation" icon={AlertTriangle} accent="bg-red-500">
                <p className="text-xs text-slate-400 -mt-1">Describe what the site is like today. Include weather, ground conditions, access changes, nearby public, live services, underground services, or anything different from normal.</p>
                <div className="space-y-2">
                  {job_site_prestart.SITUATION_CHECKS.map(label => (
                    <button
                      key={label}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => !isReadOnly && updateChecklist('situation_checkboxes', label, !(prestart.situation_checkboxes as Record<string, boolean>)?.[label])}
                      className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors', (prestart.situation_checkboxes as Record<string, boolean>)?.[label] ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200', isReadOnly && 'opacity-50 cursor-not-allowed')}
                    >
                      <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0', (prestart.situation_checkboxes as Record<string, boolean>)?.[label] ? 'bg-green-500 border-green-500' : 'border-slate-300')}>
                        {(prestart.situation_checkboxes as Record<string, boolean>)?.[label] && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm text-slate-700">{label}</span>
                    </button>
                  ))}
                </div>
                <Field label="Site Conditions">
                  <Textarea value={prestart.site_conditions ?? ''} onChange={e => update('site_conditions', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" placeholder="Describe current site conditions..." />
                </Field>
                <Field label="Changed Conditions Since Last Shift">
                  <Textarea value={prestart.changed_conditions ?? ''} onChange={e => update('changed_conditions', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <Field label="Other Known Hazards">
                  <Textarea value={prestart.other_hazards ?? ''} onChange={e => update('other_hazards', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
              </Section>

              {/* Section 3: Mission */}
              <Section title="M — Mission" icon={ClipboardCheck} accent="bg-blue-500">
                <p className="text-xs text-slate-400 -mt-1">Write the main work planned for today. Include work area, tasks, plant, tools, deliveries, and what the crew is trying to complete.</p>
                <Field label="Today's Planned Work *">
                  <Textarea value={prestart.planned_work ?? ''} onChange={e => update('planned_work', e.target.value)} disabled={isReadOnly} rows={3} className="rounded-xl resize-none" placeholder="Describe today's work..." />
                </Field>
                <Field label="Work Location / Area">
                  <Input value={prestart.work_location ?? ''} onChange={e => update('work_location', e.target.value)} disabled={isReadOnly} className="h-10 rounded-xl" />
                </Field>
                <Field label="Plant / Equipment Required">
                  <Textarea value={prestart.plant_equipment ?? ''} onChange={e => update('plant_equipment', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <Field label="Tools Required">
                  <Textarea value={prestart.tools_required ?? ''} onChange={e => update('tools_required', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <Field label="Deliveries Expected">
                  <Input value={prestart.deliveries_expected ?? ''} onChange={e => update('deliveries_expected', e.target.value)} disabled={isReadOnly} className="h-10 rounded-xl" />
                </Field>
                <Field label="Key Tasks / Milestones">
                  <Textarea value={prestart.key_tasks ?? ''} onChange={e => update('key_tasks', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
              </Section>

              {/* Section 4: Execution */}
              <Section title="E — Execution" icon={Shield} accent="bg-purple-500">
                <p className="text-xs text-slate-400 -mt-1">Confirm how the work will be done safely. Tick the controls reviewed, then add any critical controls or sequencing instructions for today.</p>
                <div className="space-y-2">
                  {job_site_prestart.EXECUTION_CHECKS.map(label => (
                    <button key={label} type="button" disabled={isReadOnly}
                      onClick={() => !isReadOnly && updateChecklist('execution_checklist', label, !(prestart.execution_checklist as Record<string, boolean>)?.[label])}
                      className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors', (prestart.execution_checklist as Record<string, boolean>)?.[label] ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200', isReadOnly && 'opacity-50 cursor-not-allowed')}
                    >
                      <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0', (prestart.execution_checklist as Record<string, boolean>)?.[label] ? 'bg-green-500 border-green-500' : 'border-slate-300')}>
                        {(prestart.execution_checklist as Record<string, boolean>)?.[label] && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm text-slate-700">{label}</span>
                    </button>
                  ))}
                </div>
                <Field label="Critical Controls for Today">
                  <Textarea value={prestart.critical_controls ?? ''} onChange={e => update('critical_controls', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <Field label="Task Sequencing Notes">
                  <Textarea value={prestart.task_sequencing ?? ''} onChange={e => update('task_sequencing', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <Field label="Supervisor Instructions">
                  <Textarea value={prestart.supervisor_instructions ?? ''} onChange={e => update('supervisor_instructions', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
              </Section>

              {/* Section 5: Administration */}
              <Section title="A — Administration" icon={Wrench} accent="bg-teal-500">
                <p className="text-xs text-slate-400 -mt-1">Check the site is ready to work. Include PPE, first aid, spill kit, fire extinguisher, water/shade, waste controls, emergency access, plant, materials, and site resources.</p>
                <div className="space-y-2">
                  {job_site_prestart.ADMIN_CHECKS.map(label => (
                    <button key={label} type="button" disabled={isReadOnly}
                      onClick={() => !isReadOnly && updateChecklist('admin_checklist', label, !(prestart.admin_checklist as Record<string, boolean>)?.[label])}
                      className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors', (prestart.admin_checklist as Record<string, boolean>)?.[label] ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200', isReadOnly && 'opacity-50 cursor-not-allowed')}
                    >
                      <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0', (prestart.admin_checklist as Record<string, boolean>)?.[label] ? 'bg-green-500 border-green-500' : 'border-slate-300')}>
                        {(prestart.admin_checklist as Record<string, boolean>)?.[label] && <Check size={12} className="text-white" />}
                      </div>
                      <span className="text-sm text-slate-700">{label}</span>
                    </button>
                  ))}
                </div>
                <Field label="Hazards / Actions Notes">
                  <Textarea value={prestart.hazards_actions ?? ''} onChange={e => update('hazards_actions', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <Field label="Materials Delivered Today">
                  <Textarea value={prestart.materials_delivered ?? ''} onChange={e => update('materials_delivered', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <Field label="Plant / Equipment Used Today">
                  <Textarea value={prestart.plant_used ?? ''} onChange={e => update('plant_used', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
              </Section>

              {/* Section 6: Command */}
              <Section title="C — Command / Communications" icon={Phone} accent="bg-slate-600">
                <p className="text-xs text-slate-400 -mt-1">Record who is in charge, who is first aid, how the crew will communicate, where the assembly point is, and confirm everyone has stop-work authority.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Emergency Number">
                    <Input value={prestart.emergency_number ?? '000'} onChange={e => update('emergency_number', e.target.value)} disabled={isReadOnly} className="h-10 rounded-xl" />
                  </Field>
                  <Field label="Electricity Emergency">
                    <Input value={prestart.electricity_emergency ?? ''} onChange={e => update('electricity_emergency', e.target.value)} disabled={isReadOnly} placeholder="e.g. 13 13 88" className="h-10 rounded-xl" />
                  </Field>
                </div>
                <Field label="Radio / Phone Channel">
                  <Input value={prestart.radio_channel ?? ''} onChange={e => update('radio_channel', e.target.value)} disabled={isReadOnly} className="h-10 rounded-xl" />
                </Field>
                <Field label="Assembly Point">
                  <Input value={prestart.assembly_point ?? ''} onChange={e => update('assembly_point', e.target.value)} disabled={isReadOnly} className="h-10 rounded-xl" />
                </Field>
                <CheckRow
                  label="Assembly point confirmed with crew"
                  checked={!!prestart.assembly_point_confirmed}
                  onChange={v => update('assembly_point_confirmed', v)}
                  disabled={isReadOnly}
                />
                <CheckRow
                  label="Stop-work authority confirmed with crew"
                  checked={!!prestart.stop_work_authority_confirmed}
                  onChange={v => update('stop_work_authority_confirmed', v)}
                  disabled={isReadOnly}
                />
              </Section>

              {/* Section 7: SWMS */}
              <div id="section-swms">
              <Section title="Relevant SWMS" icon={FileText} accent="bg-indigo-500" badge={`${Array.isArray(prestart.relevant_swms_ids) ? prestart.relevant_swms_ids.length : 0} selected`}>
                <p className="text-xs text-slate-400 -mt-1">Select the SWMS that apply to today's work. These are the documents reviewed with the crew before work starts.</p>
                {jobSwms.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-amber-700">No SWMS are attached to this job. Add SWMS from the job's safety section.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobSwms.map(s => {
                      const ids = Array.isArray(prestart.relevant_swms_ids) ? prestart.relevant_swms_ids : [];
                      const selected = ids.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          disabled={isReadOnly}
                          onClick={() => toggleSwms(s.id)}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                            selected ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200',
                            isReadOnly && 'cursor-default',
                          )}
                        >
                          <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0', selected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300')}>
                            {selected && <Check size={12} className="text-white" />}
                          </div>
                          <span className="text-sm text-slate-700">{s.swms_title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <CheckRow
                  label="SWMS reviewed and understood by crew"
                  checked={!!prestart.swms_reviewed_confirmed}
                  onChange={v => update('swms_reviewed_confirmed', v)}
                  disabled={isReadOnly}
                />
                <Field label="SWMS Review Notes">
                  <Textarea value={prestart.swms_review_notes ?? ''} onChange={e => update('swms_review_notes', e.target.value)} disabled={isReadOnly} rows={2} className="rounded-xl resize-none" />
                </Field>
                <CheckRow
                  label="No SWMS required today"
                  checked={!!prestart.no_swms_required}
                  onChange={v => update('no_swms_required', v)}
                  disabled={isReadOnly}
                />
                {prestart.no_swms_required && (
                  <Field label="Reason (required)">
                    <Input value={prestart.no_swms_reason ?? ''} onChange={e => update('no_swms_reason', e.target.value)} disabled={isReadOnly} placeholder="Why no SWMS required today?" className="h-10 rounded-xl" />
                  </Field>
                )}
              </Section>
              </div>

              {/* Worker sign-on summary */}
              <Section title={`Worker Sign-On (${workers.length})`} icon={Users} accent="bg-violet-500">
                <Button
                  onClick={() => setView('signon')}
                  className="w-full bg-violet-500 hover:bg-violet-700 text-white rounded-xl h-11"
                >
                  <Users size={16} className="mr-2" />
                  {isReadOnly ? 'View Sign-On Register' : 'Open Sign-On Screen'}
                </Button>
                {workers.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {workers.map(w => (
                      <div key={w.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{w.full_name}</p>
                          <p className="text-xs text-slate-500 truncate">{w.role_trade || w.company_employer || '—'}</p>
                        </div>
                        {!w.fit_for_work && <Badge variant="destructive" className="text-xs">Not fit</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Finalise confirm */}
              {showFinaliseConfirm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
                  <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 max-h-[90dvh] overflow-y-auto"
                    style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
                  >
                    <h3 className="font-bold text-slate-800">Finalise Prestart?</h3>
                    <p className="text-sm text-slate-600">Once finalised, the briefing content becomes read-only. Workers can still sign on after finalising.</p>
                    {finaliseError && (
                      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{finaliseError}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setShowFinaliseConfirm(false); setFinaliseError(''); }} className="flex-1 rounded-xl">Cancel</Button>
                      <Button
                        onClick={finalise}
                        disabled={finalising}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl"
                      >
                        {finalising ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                        Finalise
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .min-h-screen, .min-h-screen * { visibility: visible; }
          .min-h-screen { position: absolute; left: 0; top: 0; width: 100%; }
          button, .sticky { display: none !important; }
        }
      `}</style>

      {/* Job picker */}
      <JobPickerSheet
        open={jobPickerOpen}
        onClose={() => setJobPickerOpen(false)}
        title="Pick a Job"
        subtitle="Select the job for this prestart"
        iconBg="bg-violet-100"
        iconFg="text-violet-700"
        Icon={HardHat}
        onSelect={(job) => {
          update('job_number', job.jobNumber ?? '');
          update('job_name', job.name);
          update('job_id', job.id);
          if (job.client) update('customer_name', job.client);
          if (job.address) update('site_address', job.address);
          setJobPickerOpen(false);
        }}
      />
    </>
  );
}
