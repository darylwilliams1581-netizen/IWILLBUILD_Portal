import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert, Plus, Loader2, Users,
  Printer, Wand2, Trash2, ClipboardList, Link2, UserCheck,
  ChevronDown, Library, FileText, AlertTriangle,
} from 'lucide-react';
import { safeUrl } from '@/lib/html-escape';
import ShareLinkModal, { type ShareTarget } from '@/components/ShareLinkModal';
import SwmsBodyBuilder from '@/components/safety/SwmsBodyBuilder';
import {
  type SwmsTemplate, type SafetyPlanTemplate, type Signoff, type JobSwmsRecord,
  type JobSafetyPlan, type JobInfo,
  fmtDate, statusBadge,
  SignonModal, AddSwmsModal, SwmsEditModal, SwmsPrintModal, AddSafetyPlanModal,
} from './JobSafetyModals';

// ── Add SWMS dropdown button ──────────────────────────────────────────────────

function AddSwmsDropdown({ onFromLibrary, onCreateNew }: {
  onFromLibrary: () => void;
  onCreateNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors"
      >
        <Plus size={14} />
        <span className="hidden sm:inline">Add SWMS</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-2 z-30 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[210px] py-1 overflow-hidden"
          >
            <button
              onClick={() => { setOpen(false); onFromLibrary(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-violet-50 transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-violet-50 shrink-0">
                <Library size={13} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">From Library</p>
                <p className="text-[11px] text-slate-400">Copy an existing template</p>
              </div>
            </button>
            <div className="mx-3 border-t border-slate-100" />
            <button
              onClick={() => { setOpen(false); onCreateNew(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-violet-50 transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-slate-50 shrink-0">
                <FileText size={13} className="text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Create New</p>
                <p className="text-[11px] text-slate-400">Build a blank SWMS from scratch</p>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── SWMS Sub-tab ──────────────────────────────────────────────────────────────

function SwmsSubTab({ jobId, job }: { jobId: number; job: JobInfo | null }) {
  const [list, setList] = useState<JobSwmsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState<JobSwmsRecord | null>(null);
  const [printing, setPrinting] = useState<{ swms: JobSwmsRecord; signoffs: Signoff[] } | null>(null);
  const [signonTarget, setSignonTarget] = useState<JobSwmsRecord | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [loadingSignoffs, setLoadingSignoffs] = useState<number | null>(null);
  const [swmsShareTarget, setSwmsShareTarget] = useState<ShareTarget | null>(null);

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
        <AddSwmsDropdown
          onFromLibrary={() => setShowAdd(true)}
          onCreateNew={() => setShowBuilder(true)}
        />
      </div>

      {list.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center mb-3"><ShieldAlert size={22} className="text-primary" /></div>
          <p className="font-bold text-sm text-slate-700 mb-1">No SWMS on this job</p>
          <p className="text-xs text-slate-400 mb-4 max-w-xs">Add SWMS from the library or create a new one. Workers sign on before starting work.</p>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              <Library size={14} />From Library
            </button>
            <button onClick={() => setShowBuilder(true)} className="flex items-center gap-2 bg-white border border-slate-200 hover:border-primary hover:text-primary text-slate-700 text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              <FileText size={14} />Create New
            </button>
          </div>
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
                      className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      title="Print / PDF"
                    >
                      {loadingSignoffs === j.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                    </button>
                    {/* Share / QR */}
                    <button
                      onClick={() => setSwmsShareTarget({
                        type: 'job_swms',
                        id: String(j.id),
                        title: j.title,
                        linkType: 'swms_signon',
                        defaultPermissions: ['view', 'sign'],
                      })}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-violet-50 transition-colors"
                      title="Share / QR"
                    >
                      <Link2 size={14} />
                    </button>
                    {/* Edit */}
                    <button onClick={() => setEditing(j)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-violet-50 transition-colors" title="Edit">
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
        {showBuilder && (
          <SwmsBodyBuilder
            onClose={() => setShowBuilder(false)}
            onSaved={async (saved) => {
              // Saved to library — now attach to this job automatically
              setShowBuilder(false);
              try {
                const r = await fetch('/api/safety/job-swms', {
                  method: 'POST', credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jobId, templateIds: [saved.id] }),
                });
                const d = await r.json() as { jobSwms?: JobSwmsRecord[] };
                if (r.ok && d.jobSwms?.length) {
                  setList((prev) => [...(d.jobSwms!.map((i) => ({ ...i, signoffs: [] }))), ...prev]);
                } else {
                  // Fallback: reload
                  load();
                }
              } catch {
                load();
              }
            }}
          />
        )}
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

      {swmsShareTarget && (
        <ShareLinkModal
          open={true}
          onClose={() => setSwmsShareTarget(null)}
          target={swmsShareTarget}
        />
      )}
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
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors">
          <Plus size={14} /><span className="hidden sm:inline">Add Plan</span>
        </button>
      </div>

      {plans.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3"><ClipboardList size={22} className="text-blue-600" /></div>
          <p className="font-bold text-sm text-slate-700 mb-1">No safety plan on this job</p>
          <p className="text-xs text-slate-400 mb-4 max-w-xs">Copy from the Safety Plan Library or start a blank plan for this job.</p>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
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
  const navigate = useNavigate();
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
      {/* ── Risky & Permits banner ─────────────────────────────────────── */}
      <button
        onClick={() => navigate(`/jobs/${jobId}/risky`)}
        className="flex items-center gap-3 w-full bg-amber-50 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 rounded-xl px-4 py-3 transition-colors group text-left"
      >
        <div className="w-9 h-9 bg-amber-100 group-hover:bg-amber-200 rounded-xl flex items-center justify-center shrink-0 transition-colors">
          <AlertTriangle size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">Risky &amp; Permits</p>
          <p className="text-xs text-amber-700">Risk assessments and permit-to-work for this job</p>
        </div>
        <ChevronDown size={15} className="text-amber-500 -rotate-90 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-slate-200 pb-0">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold transition-colors whitespace-nowrap border-b-2 -mb-px ${
              subTab === id
                ? 'border-primary text-primary bg-violet-50/50'
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
