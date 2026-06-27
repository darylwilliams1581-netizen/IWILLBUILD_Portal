import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert, Plus, Loader2, X, Check, AlertCircle,
  Users, ChevronDown, ChevronRight, UserCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwmsTemplate {
  id: number;
  title: string;
  work_activity: string | null;
  status: string;
}

interface Signoff {
  id: number;
  worker_name: string;
  white_card_number: string | null;
  signed_at: string;
}

interface JobSwms {
  id: number;
  swms_template_id: number;
  swms_title: string;
  work_activity: string | null;
  template_status: string;
  created_at: string;
  signoffs: Signoff[];
}

// ── Sign-on Modal ─────────────────────────────────────────────────────────────

interface SignonModalProps {
  jobSwmsId: number;
  jobId: number;
  swmsTitle: string;
  onClose: () => void;
  onSigned: (signoff: Signoff) => void;
}

function SignonModal({ jobSwmsId, jobId, swmsTitle, onClose, onSigned }: SignonModalProps) {
  const [workerName, setWorkerName] = useState('');
  const [whiteCard, setWhiteCard] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workerName.trim()) { setError('Worker name is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/jobs/${jobId}/swms/${jobSwmsId}/signoff`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerName: workerName.trim(), whiteCardNumber: whiteCard.trim() || undefined }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mobile-sheet"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-heading font-bold text-sm">Worker Sign-on</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{swmsTitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Worker Name <span className="text-red-500">*</span></label>
            <input
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="Full name"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">White Card Number</label>
            <input
              value={whiteCard}
              onChange={(e) => setWhiteCard(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="Optional"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={13} className="shrink-0" />{error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
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

// ── Assign SWMS Modal ─────────────────────────────────────────────────────────

interface AssignSwmsModalProps {
  jobId: number;
  existing: number[];
  onClose: () => void;
  onAssigned: (js: JobSwms) => void;
}

function AssignSwmsModal({ jobId, existing, onClose, onAssigned }: AssignSwmsModalProps) {
  const [templates, setTemplates] = useState<SwmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/safety/swms', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setTemplates((d.swms ?? []).filter((s: SwmsTemplate) => s.status !== 'archived')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAssign() {
    if (!selected) return;
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/jobs/${jobId}/swms`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swmsTemplateId: String(selected) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onAssigned(d.jobSwms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto mobile-sheet"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="font-heading font-bold text-sm">Assign SWMS to Job</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {loading && <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-primary" /></div>}
          {!loading && templates.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-2">No SWMS templates available.</p>
              <Link to="/safety" className="text-xs text-primary font-semibold hover:underline">Create SWMS templates in Safety →</Link>
            </div>
          )}
          {!loading && templates.map((t) => {
            const alreadyAssigned = existing.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => !alreadyAssigned && setSelected(t.id)}
                disabled={alreadyAssigned}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selected === t.id
                    ? 'border-primary bg-orange-50'
                    : alreadyAssigned
                    ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                    : 'border-slate-200 hover:border-primary/40 hover:bg-orange-50/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{t.title}</p>
                    {t.work_activity && <p className="text-xs text-slate-500 truncate">{t.work_activity}</p>}
                  </div>
                  {alreadyAssigned && <span className="text-xs text-slate-400 shrink-0">Already assigned</span>}
                  {selected === t.id && <Check size={14} className="text-primary shrink-0" />}
                </div>
              </button>
            );
          })}

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={13} className="shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button onClick={handleAssign} disabled={!selected || saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Assign SWMS
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main JobSafety Component ──────────────────────────────────────────────────

export default function JobSafety({ jobId }: { jobId: number }) {
  const [jobSwmsList, setJobSwmsList] = useState<JobSwms[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [signonTarget, setSignonTarget] = useState<{ id: number; title: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/swms`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setJobSwmsList(d.jobSwms ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-sm text-slate-700">SWMS on this Job</h2>
          <p className="text-xs text-slate-400 mt-0.5">{jobSwmsList.length} assigned</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/safety" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
            SWMS Library <ChevronRight size={12} />
          </Link>
          <button
            onClick={() => setShowAssign(true)}
            className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Assign SWMS</span>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {jobSwmsList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mb-3">
            <ShieldAlert size={22} className="text-primary" />
          </div>
          <p className="font-bold text-sm text-slate-700 mb-1">No SWMS assigned</p>
          <p className="text-xs text-slate-400 mb-4 max-w-xs">Assign Safe Work Method Statements to this job so workers can sign on before starting work.</p>
          <button onClick={() => setShowAssign(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} />Assign SWMS
          </button>
        </div>
      )}

      {/* SWMS list */}
      {jobSwmsList.length > 0 && (
        <div className="flex flex-col gap-2">
          {jobSwmsList.map((js) => {
            const isOpen = expanded.has(js.id);
            const signedCount = js.signoffs.length;
            return (
              <div key={js.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(js.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                    <ShieldAlert size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{js.swms_title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Users size={10} />
                        {signedCount} signed on
                      </span>
                      {signedCount === 0 && (
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Unsigned</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSignonTarget({ id: js.id, title: js.swms_title }); }}
                      className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <UserCheck size={12} />
                      Sign On
                    </button>
                    {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-slate-100 px-4 py-3">
                        {js.work_activity && (
                          <p className="text-xs text-slate-500 mb-3">{js.work_activity}</p>
                        )}
                        {js.signoffs.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No workers have signed on yet.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-xs font-semibold text-slate-600 mb-1">Signed On ({js.signoffs.length})</p>
                            {js.signoffs.map((s) => (
                              <div key={s.id} className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                                <UserCheck size={13} className="text-emerald-600 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-800">{s.worker_name}</p>
                                  {s.white_card_number && <p className="text-xs text-slate-500">Card: {s.white_card_number}</p>}
                                </div>
                                <p className="text-xs text-slate-400 shrink-0">
                                  {new Date(s.signed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showAssign && (
          <AssignSwmsModal
            jobId={jobId}
            existing={jobSwmsList.map((js) => js.swms_template_id)}
            onClose={() => setShowAssign(false)}
            onAssigned={(js) => { setJobSwmsList((prev) => [js, ...prev]); setShowAssign(false); }}
          />
        )}
        {signonTarget && (
          <SignonModal
            jobSwmsId={signonTarget.id}
            jobId={jobId}
            swmsTitle={signonTarget.title}
            onClose={() => setSignonTarget(null)}
            onSigned={(signoff) => {
              setJobSwmsList((prev) => prev.map((js) =>
                js.id === signonTarget.id
                  ? { ...js, signoffs: [...js.signoffs, signoff] }
                  : js
              ));
              setSignonTarget(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
