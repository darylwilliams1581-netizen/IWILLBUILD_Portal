/**
 * /job-docs — Field Docs
 * Field worker view: pick a job, then view/review/complete/sign-on to SWMS docs.
 * Tabs: Documents | Sign-ons
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Search, Plus, Loader2, FileCheck, Building2, Users,
  ChevronDown, ChevronUp, CheckCircle2, Clock, X,
  AlertCircle, Check, CheckSquare, Square, Copy, Link2,
  ClipboardCheck, FileText, UserCheck, Printer, PenLine, ChevronRight, Home,
} from 'lucide-react';
import { fmtDate, statusBadge } from '@/components/safety/safety-types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  name: string;
  job_number: string | null;
  status: string | null;
}

interface FieldDoc {
  id: number;
  title: string;
  status: string;
  revision_number: string;
  review_date: string | null;
  approved_at: string | null;
  work_activity: string | null;
  sign_off_requirements: string | null;
  signoff_count: number;
  job_name: string | null;
  job_number: string | null;
}

interface Signon {
  id: number;
  worker_name: string;
  company_name: string | null;
  role: string | null;
  white_card_number: string | null;
  signed_at: string;
  doc_title: string | null;
}

interface Stakeholder {
  id: number;
  name: string;
  contact_person: string | null;
  trade_type: string | null;
  stakeholder_type: string | null;
  record_type: string | null;
}

// ── Job Picker ────────────────────────────────────────────────────────────────

function JobPicker({ onSelect }: { onSelect: (job: Job) => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/jobs', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setJobs((d.jobs ?? []).filter((j: Job) => j.status !== 'archived')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter(j =>
    !search ||
    j.name.toLowerCase().includes(search.toLowerCase()) ||
    (j.job_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Helmet>
        <title>Field Docs | IWILLBUILD</title>
        <meta name="description" content="View, review and sign on to job documents in the field." />
        <link rel="canonical" href="https://iwillbuild.com/job-docs" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {/* Home button */}
      <div className="w-full max-w-md mb-2 flex">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          <Home size={14} />
          Home
        </button>
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mb-4">
            <FileCheck size={28} className="text-teal-600" />
          </div>
          <h1 className="font-heading font-bold text-2xl text-slate-800 mb-1">Field Docs</h1>
          <p className="text-sm text-slate-500 text-center">Select a job to view its documents</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search jobs…"
                autoFocus
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-slate-50"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-teal-600" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">No active jobs found</p>
            )}
            {!loading && filtered.map(j => (
              <button
                key={j.id}
                onClick={() => onSelect(j)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-teal-50 transition-colors border-b border-slate-100 last:border-0 group"
              >
                <div className="w-9 h-9 bg-slate-100 group-hover:bg-teal-100 rounded-xl flex items-center justify-center shrink-0 transition-colors">
                  <Building2 size={15} className="text-slate-500 group-hover:text-teal-600 transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{j.name}</p>
                  {j.job_number && <p className="text-xs text-slate-400">{j.job_number}</p>}
                </div>
                <ChevronDown size={14} className="text-slate-300 group-hover:text-teal-500 -rotate-90 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add Doc Modal ─────────────────────────────────────────────────────────────

function AddDocModal({ jobId, onClose, onAdded }: {
  jobId: number;
  onClose: () => void;
  onAdded: (docs: FieldDoc[]) => void;
}) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Array<{ id: number; title: string; status: string }>>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/safety/swms', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setTemplates((d.swms ?? []).filter((s: { status: string }) => s.status !== 'archived')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = templates.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) { setError('Select at least one document'); return; }
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
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-teal-50 rounded-lg"><FileCheck size={16} className="text-teal-600" /></div>
            <div>
              <h2 className="font-heading font-bold text-base">Add Document to Job</h2>
              <p className="text-xs text-slate-400">Select from your SWMS library</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 bg-white"
            />
          </div>

          {loading && <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-teal-600" /></div>}

          {!loading && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {filtered.length === 0 && (
                <div className="text-center py-6 px-4">
                  <p className="text-sm text-slate-400 mb-3">No templates found — create some in the SWMS Library first</p>
                  <button
                    onClick={() => { onClose(); navigate('/safety'); }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <FileText size={12} />
                    Go to SWMS Library
                  </button>
                </div>
              )}
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors border-b border-slate-100 last:border-0 ${selected.has(t.id) ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                >
                  {selected.has(t.id)
                    ? <CheckSquare size={14} className="text-teal-600 shrink-0" />
                    : <Square size={14} className="text-slate-300 shrink-0" />}
                  <span className="flex-1 truncate font-medium text-slate-800">{t.title}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${statusBadge(t.status)}`}>{t.status}</span>
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3 border-t border-slate-100 pt-4 shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
          <button
            onClick={() => void handleAdd()}
            disabled={saving || selected.size === 0}
            className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add {selected.size > 0 ? `${selected.size} Doc${selected.size > 1 ? 's' : ''}` : 'Docs'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Inline Sign-on Form ───────────────────────────────────────────────────────

function SignonForm({ docId, onSigned, onCancel }: {
  docId: number;
  onSigned: (signon: Signon) => void;
  onCancel: () => void;
}) {
  const [name, setName]       = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole]       = useState('');
  const [wc, setWc]           = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Stakeholder picker state
  const [stakeholders, setStakeholders]     = useState<Stakeholder[]>([]);
  const [shSearch, setShSearch]             = useState('');
  const [showPicker, setShowPicker]         = useState(false);
  const [shLoading, setShLoading]           = useState(false);
  const [selectedSh, setSelectedSh]         = useState<Stakeholder | null>(null);
  const pickerRef                           = useRef<HTMLDivElement>(null);

  // Load stakeholders once on mount
  useEffect(() => {
    setShLoading(true);
    fetch('/api/customers?status=active&type=all', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setStakeholders((d as { customers?: Stakeholder[] }).customers ?? []))
      .catch(() => {})
      .finally(() => setShLoading(false));
  }, []);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  function selectStakeholder(sh: Stakeholder) {
    setSelectedSh(sh);
    // Prefill: use contact_person as the worker name if available, else company name
    setName(sh.contact_person?.trim() || sh.name.trim());
    setCompany(sh.name.trim());
    setRole(sh.trade_type?.trim() || sh.stakeholder_type?.trim() || '');
    setShowPicker(false);
    setShSearch('');
    setError('');
  }

  function clearSelection() {
    setSelectedSh(null);
    setName(''); setCompany(''); setRole(''); setWc('');
  }

  const filtered = stakeholders.filter(sh => {
    const q = shSearch.toLowerCase();
    return (
      sh.name.toLowerCase().includes(q) ||
      (sh.contact_person ?? '').toLowerCase().includes(q) ||
      (sh.trade_type ?? '').toLowerCase().includes(q) ||
      (sh.stakeholder_type ?? '').toLowerCase().includes(q)
    );
  });

  async function submit() {
    if (!name.trim()) { setError('Full name is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/safety/job-swms/${docId}/signoffs`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerName: name.trim(),
          companyName: company.trim() || undefined,
          role: role.trim() || undefined,
          whiteCardNumber: wc.trim() || undefined,
        }),
      });
      const d = await r.json() as { signoff?: Signon; error?: string };
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      if (d.signoff) onSigned(d.signoff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign on');
    } finally { setSaving(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-hidden"
    >
      <div className="border-t border-teal-100 bg-teal-50/60 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-teal-800 flex items-center gap-1.5"><PenLine size={12} /> Sign On</p>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={14} /></button>
        </div>

        {/* Stakeholder quick-select */}
        <div className="mb-3 relative" ref={pickerRef}>
          {selectedSh ? (
            <div className="flex items-center gap-2 bg-teal-100 border border-teal-200 rounded-xl px-3 py-2">
              <div className="w-6 h-6 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {selectedSh.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-teal-900 truncate">{selectedSh.name}</p>
                {selectedSh.contact_person && (
                  <p className="text-[10px] text-teal-700 truncate">{selectedSh.contact_person}</p>
                )}
              </div>
              <button onClick={clearSelection} className="text-teal-500 hover:text-teal-700 transition-colors shrink-0">
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPicker(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-500 hover:border-teal-400 hover:text-teal-700 transition-colors"
            >
              <Users size={12} className="shrink-0" />
              <span className="flex-1 text-left">
                {shLoading ? 'Loading stakeholders…' : stakeholders.length > 0 ? 'Select a stakeholder to prefill…' : 'No stakeholders — fill in manually'}
              </span>
              {stakeholders.length > 0 && <ChevronRight size={12} className={`transition-transform ${showPicker ? 'rotate-90' : ''}`} />}
            </button>
          )}

          {/* Dropdown */}
          <AnimatePresence>
            {showPicker && stakeholders.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
              >
                <div className="p-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
                    <Search size={11} className="text-slate-400 shrink-0" />
                    <input
                      autoFocus
                      value={shSearch}
                      onChange={e => setShSearch(e.target.value)}
                      placeholder="Search stakeholders…"
                      className="flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-slate-400 italic px-3 py-3">No matches</p>
                  ) : (
                    filtered.map(sh => (
                      <button
                        key={sh.id}
                        onClick={() => selectStakeholder(sh)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-teal-50 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {sh.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{sh.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {[sh.contact_person, sh.trade_type || sh.stakeholder_type].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Manual fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Full Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="e.g. John Smith"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Company</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Acme Constructions"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Role / Trade</label>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Carpenter"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">White Card No.</label>
            <input value={wc} onChange={e => setWc(e.target.value)} placeholder="e.g. QLD-123456"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
            <AlertCircle size={12} className="shrink-0" />{error}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={() => void submit()} disabled={saving || !name.trim()}
            className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
            Confirm Sign On
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Sign-on Panel ─────────────────────────────────────────────────────────────

function SignonPanel({ docId, signons, onNewSignon, onClose }: {
  docId: number;
  signons: Signon[];
  onNewSignon: (s: Signon) => void;
  onClose: () => void;
}) {
  const [shareUrl, setShareUrl] = useState('');
  const [loadingLink, setLoadingLink] = useState(true);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch(`/api/safety/job-swms/${docId}/share-token`, { method: 'POST', credentials: 'include' })
      .then(r => r.json())
      .then(d => setShareUrl((d as { url?: string }).url ?? ''))
      .catch(() => {})
      .finally(() => setLoadingLink(false));
  }, [docId]);

  async function regenerate() {
    setGenerating(true);
    try {
      const r = await fetch(`/api/safety/job-swms/${docId}/share-token`, { method: 'POST', credentials: 'include' });
      const d = await r.json() as { url?: string };
      setShareUrl(d.url ?? '');
    } finally { setGenerating(false); }
  }

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-4">

        {/* Add sign-on inline form */}
        <AnimatePresence>
          {showForm && (
            <SignonForm
              key="form"
              docId={docId}
              onSigned={s => { onNewSignon(s); setShowForm(false); }}
              onCancel={() => setShowForm(false)}
            />
          )}
        </AnimatePresence>

        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-teal-300 rounded-xl text-xs font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
          >
            <Plus size={13} /> Add Sign-on
          </button>
        )}

        {/* Share link */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Share Link</p>
          <p className="text-xs text-slate-500 mb-2">Workers can sign on from their phone — no login needed.</p>
          {loadingLink ? (
            <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Generating…</div>
          ) : shareUrl ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 truncate font-mono">{shareUrl}</div>
              <button
                onClick={copyLink}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${copied ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          ) : (
            <button onClick={regenerate} disabled={generating} className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
              Generate link
            </button>
          )}
        </div>

        {/* Signons list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Signed ({signons.length})</p>
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors">
              <ChevronUp size={12} /> Hide
            </button>
          </div>
          {signons.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No sign-ons yet. Add one above or share the link.</p>
          ) : (
            <div className="space-y-1.5">
              {signons.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800">{s.worker_name}</p>
                    <p className="text-[10px] text-slate-500">
                      {[s.role, s.company_name, s.white_card_number ? `WC: ${s.white_card_number}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                    <Clock size={9} />{fmtDate(s.signed_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Print View ────────────────────────────────────────────────────────────────

function PrintView({ doc, job, signons, onClose }: {
  doc: FieldDoc;
  job: Job;
  signons: Signon[];
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  function doPrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto print:static print:overflow-visible field-docs-print-view">
      {/* Screen-only toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center">
            <Printer size={14} className="text-teal-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700">Print Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={doPrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors">
            <Printer size={14} /> Print
          </button>
          <button onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div ref={printRef} className="max-w-3xl mx-auto px-8 py-10 print:px-0 print:py-0 print:max-w-none">
        {/* Job header */}
        <div className="border-b-2 border-slate-800 pb-4 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Field Document</p>
              <h1 className="font-heading font-bold text-xl text-slate-900 leading-tight">{doc.title}</h1>
              {doc.work_activity && (
                <p className="text-sm text-slate-600 mt-1">{doc.work_activity}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-500">Rev {doc.revision_number}</p>
              <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>

          {/* Job details row */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Job Name', value: job.name },
              { label: 'Job Number', value: job.job_number ?? '—' },
              { label: 'Status', value: doc.status.charAt(0).toUpperCase() + doc.status.slice(1) },
              { label: 'Sign-ons', value: String(signons.length) },
            ].map(item => (
              <div key={item.label} className="bg-slate-50 rounded-lg px-3 py-2 print:border print:border-slate-200">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{item.label}</p>
                <p className="text-sm font-semibold text-slate-800">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sign-on register */}
        <div>
          <h2 className="font-heading font-bold text-base text-slate-800 mb-3">Sign-on Register</h2>
          {signons.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No sign-ons recorded.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-2 pr-4 text-xs font-bold text-slate-600 uppercase tracking-wide">Name</th>
                  <th className="text-left py-2 pr-4 text-xs font-bold text-slate-600 uppercase tracking-wide">Company</th>
                  <th className="text-left py-2 pr-4 text-xs font-bold text-slate-600 uppercase tracking-wide">Role</th>
                  <th className="text-left py-2 pr-4 text-xs font-bold text-slate-600 uppercase tracking-wide">White Card</th>
                  <th className="text-left py-2 text-xs font-bold text-slate-600 uppercase tracking-wide">Date / Time</th>
                </tr>
              </thead>
              <tbody>
                {signons.map((s, i) => (
                  <tr key={s.id} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50'}`}>
                    <td className="py-2 pr-4 font-semibold text-slate-800">{s.worker_name}</td>
                    <td className="py-2 pr-4 text-slate-600">{s.company_name ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600">{s.role ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600">{s.white_card_number ?? '—'}</td>
                    <td className="py-2 text-slate-500 text-xs">{fmtDate(s.signed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Blank rows for manual sign-on on paper */}
          {signons.length < 20 && (
            <div className="mt-4">
              <p className="text-xs text-slate-400 mb-2 italic">Additional sign-on rows (manual):</p>
              {Array.from({ length: Math.max(3, 8 - signons.length) }).map((_, i) => (
                <div key={i} className="border-b border-slate-200 py-3 grid grid-cols-5 gap-2">
                  {['Name', 'Company', 'Role', 'White Card', 'Signature'].map(col => (
                    <div key={col}>
                      <p className="text-[9px] text-slate-300 uppercase tracking-wide">{col}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Doc Card ──────────────────────────────────────────────────────────────────

function DocCard({ doc, job, onStatusChange }: {
  doc: FieldDoc;
  job: Job;
  onStatusChange: (id: number, status: string) => void;
}) {
  const [signonOpen, setSignonOpen]   = useState(false);
  const [signons, setSignons]         = useState<Signon[]>([]);
  const [signonsLoaded, setSignonsLoaded] = useState(false);
  const [updating, setUpdating]       = useState(false);
  const [showPrint, setShowPrint]     = useState(false);
  const [signonCount, setSignonCount] = useState(doc.signoff_count);

  // Load signons when panel opens for the first time
  useEffect(() => {
    if (!signonOpen || signonsLoaded) return;
    fetch(`/api/safety/job-swms/${doc.id}/signoffs`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setSignons((d as { signoffs?: Signon[] }).signoffs ?? []); setSignonsLoaded(true); })
      .catch(() => { setSignonsLoaded(true); });
  }, [signonOpen, signonsLoaded, doc.id]);

  function handleNewSignon(s: Signon) {
    setSignons(prev => [...prev, s]);
    setSignonCount(c => c + 1);
  }

  async function changeStatus(newStatus: string) {
    setUpdating(true);
    try {
      const r = await fetch(`/api/safety/job-swms/${doc.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          workActivity: doc.work_activity ?? '',
          revisionNumber: doc.revision_number,
          reviewDate: doc.review_date?.slice(0, 10) ?? '',
          status: newStatus,
        }),
      });
      if (r.ok) onStatusChange(doc.id, newStatus);
    } finally { setUpdating(false); }
  }

  // For print: load signons if not yet loaded
  async function openPrint() {
    if (!signonsLoaded) {
      const r = await fetch(`/api/safety/job-swms/${doc.id}/signoffs`, { credentials: 'include' });
      const d = await r.json() as { signoffs?: Signon[] };
      setSignons(d.signoffs ?? []);
      setSignonsLoaded(true);
    }
    setShowPrint(true);
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 transition-colors">
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(doc.status)}`}>
                  {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                </span>
                <span className="text-xs text-slate-400">Rev {doc.revision_number}</span>
                {doc.review_date && (
                  <span className="text-xs text-slate-400">Review: {fmtDate(doc.review_date)}</span>
                )}
              </div>
              <h3 className="font-bold text-sm text-slate-800 leading-snug">{doc.title}</h3>
              {doc.work_activity && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{doc.work_activity}</p>
              )}
            </div>

            {/* Sign-on count badge */}
            <button
              onClick={() => setSignonOpen(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                signonOpen
                  ? 'bg-emerald-100 text-emerald-700'
                  : signonCount > 0
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
              title="Sign-ons"
            >
              <Users size={12} />
              <span>{signonCount}</span>
              {signonOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 flex-wrap">
            {/* Review */}
            {doc.status === 'draft' && (
              <button
                onClick={() => void changeStatus('reviewed')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {updating ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                Review
              </button>
            )}

            {/* Complete */}
            {(doc.status === 'draft' || doc.status === 'reviewed') && (
              <button
                onClick={() => void changeStatus('approved')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                {updating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Complete
              </button>
            )}

            {/* Sign On */}
            <button
              onClick={() => setSignonOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                signonOpen ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
              }`}
            >
              <UserCheck size={11} />
              Sign On
            </button>

            {/* Print */}
            <button
              onClick={() => void openPrint()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Printer size={11} />
              Print
            </button>

            {signonCount === 0 && (
              <span className="ml-auto text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Unsigned
              </span>
            )}
          </div>
        </div>

        {/* Sign-on panel */}
        <AnimatePresence>
          {signonOpen && (
            <SignonPanel
              key={doc.id}
              docId={doc.id}
              signons={signons}
              onNewSignon={handleNewSignon}
              onClose={() => setSignonOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Print overlay */}
      <AnimatePresence>
        {showPrint && (
          <PrintView
            doc={doc}
            job={job}
            signons={signons}
            onClose={() => setShowPrint(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function JobFieldDocsPage() {
  const navigate = useNavigate();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [docs, setDocs] = useState<FieldDoc[]>([]);
  const [signons, setSignons] = useState<Signon[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'docs' | 'signons'>('docs');
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  const loadDocs = useCallback((jobId: number) => {
    setLoading(true);
    fetch(`/api/jobs/${jobId}/field-docs`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setDocs(d.docs ?? []);
        setSignons(d.signons ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedJob) loadDocs(selectedJob.id);
  }, [selectedJob, loadDocs]);

  function handleStatusChange(id: number, newStatus: string) {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));
  }

  const filteredDocs = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase())
  );

  // ── No job selected → picker ──
  if (!selectedJob) {
    return <JobPicker onSelect={job => { setSelectedJob(job); }} />;
  }

  // ── Job selected → docs view ──
  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate('/home')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Home"
        >
          <Home size={16} />
        </button>
        <button
          onClick={() => { setSelectedJob(null); setDocs([]); setSignons([]); }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Back to job picker"
        >
          <ChevronDown size={16} className="rotate-90" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
              <FileCheck size={14} className="text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 leading-none mb-0.5">Field Docs</p>
              <h1 className="font-heading font-bold text-sm text-slate-800 truncate leading-tight">
                {selectedJob.name}
                {selectedJob.job_number && <span className="font-normal text-slate-400 ml-1.5">{selectedJob.job_number}</span>}
              </h1>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0"
        >
          <Plus size={13} />
          Add
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-1 shrink-0">
        {([
          { key: 'docs',    label: 'Documents', icon: FileText,  count: docs.length },
          { key: 'signons', label: 'Sign-ons',  icon: UserCheck, count: signons.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Documents tab ── */}
        {activeTab === 'docs' && (
          <div className="p-4 flex flex-col gap-3">
            {/* Search */}
            {docs.length > 3 && (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search documents…"
                  className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 bg-white"
                />
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-teal-600" />
              </div>
            )}

            {!loading && filteredDocs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center mb-4">
                  <FileCheck size={24} className="text-teal-600" />
                </div>
                <p className="font-heading font-bold text-slate-700 mb-1">No documents yet</p>
                <p className="text-sm text-slate-400 mb-5 max-w-xs">Add SWMS documents to this job so workers can review and sign on.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                >
                  <Plus size={15} />Add Document
                </button>
              </div>
            )}

            {!loading && filteredDocs.map(doc => (
              <DocCard key={doc.id} doc={doc} job={selectedJob} onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}

        {/* ── Sign-ons tab ── */}
        {activeTab === 'signons' && (
          <div className="p-4 flex flex-col gap-3">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-teal-600" />
              </div>
            )}

            {!loading && signons.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                  <Users size={24} className="text-slate-400" />
                </div>
                <p className="font-heading font-bold text-slate-700 mb-1">No sign-ons yet</p>
                <p className="text-sm text-slate-400 max-w-xs">Workers sign on via the share link on each document.</p>
              </div>
            )}

            {!loading && signons.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-700">{signons.length} sign-on{signons.length !== 1 ? 's' : ''} recorded</p>
                </div>
                {signons.map(s => (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 size={15} className="text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{s.worker_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {[s.role, s.company_name, s.white_card_number ? `WC: ${s.white_card_number}` : null].filter(Boolean).join(' · ')}
                      </p>
                      {s.doc_title && (
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <FileText size={9} />{s.doc_title}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0 mt-0.5">
                      <Clock size={9} />{fmtDate(s.signed_at)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add doc modal */}
      <AnimatePresence>
        {showAdd && (
          <AddDocModal
            jobId={selectedJob.id}
            onClose={() => setShowAdd(false)}
            onAdded={newDocs => {
              setDocs(prev => [...(newDocs as unknown as FieldDoc[]), ...prev]);
              setShowAdd(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
