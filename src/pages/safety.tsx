import { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert, ShieldCheck, FileText, AlertTriangle, Plus, Search,
  Loader2, X, Check, ChevronRight, Download, Trash2, Copy,
  ClipboardList, BookOpen, Image, Menu, AlertCircle, ExternalLink,
  Users, Calendar, Building2, ChevronDown, Wand2, Send,
  Sparkles, FileDown, Package, RefreshCw, Printer, CheckSquare, Square,
  HardHat, ChevronLeft, DollarSign, ChefHat, Share2,
} from 'lucide-react';
import ShareLinkModal from '@/components/ShareLinkModal';
import PortalSidebar from '@/components/PortalSidebar';
import FleetHeaderIcon from '@/components/FleetHeaderIcon';
import SafetyPosterGenerator from '@/components/SafetyPosterGenerator';
import PPEBanner from '@/components/safety-posters/PPEBanner';
import { CostGuideTab, RecipesTab } from '@/pages/estimating';
import SwmsFormModal from '@/components/safety/SwmsFormModal';
import PlanFormModal from '@/components/safety/PlanFormModal';
import DazzaAiTab from '@/components/safety/DazzaAiTab';
import SwmsPrintModal from '@/components/safety/SwmsPrintModal';
import JobSwmsTab from '@/components/safety/JobSwmsTab';
import {
  type SwmsTemplate, type SafetyPlan, type SafetyDocument, type SafetyPoster,
  type GeneratedPoster, type SwmsPrintData,
  SWMS_STATUSES, PLAN_STATUSES, JOB_SWMS_STATUSES,
  HIGH_RISK_ACTIVITIES, POLICY_TYPES, POSTER_TYPES,
  fmtBytes, fmtDate, statusBadge,
} from '@/components/safety/safety-types';

// ── SWMS Library Tab ──────────────────────────────────────────────────────────

function SwmsLibraryTab() {
  const [swmsList, setSwmsList] = useState<SwmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SwmsTemplate | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [printing, setPrinting] = useState<SwmsTemplate | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    fetch('/api/safety/swms', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSwmsList(d.swms ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSeed() {
    setSeeding(true); setSeedMsg('');
    try {
      const r = await fetch('/api/safety/swms/seed', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setSeedMsg(d.message ?? 'Templates added.');
        // Reload list
        const r2 = await fetch('/api/safety/swms', { credentials: 'include' });
        const d2 = await r2.json();
        setSwmsList(d2.swms ?? []);
      } else {
        setSeedMsg(d.error ?? 'Failed to seed templates.');
      }
    } catch {
      setSeedMsg('Failed to seed templates.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleDuplicate(id: number) {
    setDuplicating(id);
    try {
      const r = await fetch(`/api/safety/swms/${id}/duplicate`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok && d.swms) setSwmsList((prev) => [d.swms, ...prev]);
    } finally {
      setDuplicating(null);
    }
  }

  async function handleArchive(id: number, current: string) {
    const next = current === 'archived' ? 'draft' : 'archived';
    const swms = swmsList.find((s) => s.id === id);
    if (!swms) return;
    const r = await fetch(`/api/safety/swms/${id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...swms, status: next }),
    });
    if (r.ok) {
      const d = await r.json();
      setSwmsList((prev) => prev.map((s) => s.id === id ? d.swms : s));
    }
  }

  const filtered = swmsList.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.work_activity ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SWMS…" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Load 6 industry-standard SWMS templates"
          >
            {seeding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
            <span className="hidden sm:inline">Load Templates</span>
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} /><span className="hidden sm:inline">New SWMS</span>
          </button>
        </div>
      </div>

      {seedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 text-sm">
          <Check size={14} className="shrink-0" />{seedMsg}
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><ShieldAlert size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No SWMS templates yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Create reusable Safe Work Method Statements, or load 6 industry-standard templates to get started quickly.</p>
          <div className="flex items-center gap-3">
            <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
              Load Templates
            </button>
            <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              <Plus size={15} />Create SWMS
            </button>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(s.status)}`}>
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </span>
                  <span className="text-xs text-slate-400">Rev {s.revision_number}</span>
                  {s.review_date && <span className="text-xs text-slate-400">Review: {fmtDate(s.review_date)}</span>}
                </div>
                <h3 className="font-bold text-sm text-slate-800">{s.title}</h3>
                {s.work_activity && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{s.work_activity}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleDuplicate(s.id)} disabled={duplicating === s.id} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Duplicate">
                  {duplicating === s.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                </button>
                <button onClick={() => setShareTarget({ id: s.id, title: s.title })} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Share link">
                  <Share2 size={14} />
                </button>
                <button onClick={() => setPrinting(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Print / PDF">
                  <Printer size={14} />
                </button>
                <a href={`/api/safety/swms/${s.id}/export?format=pdf`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Export PDF">
                  <FileDown size={14} />
                </a>
                <a href={`/api/safety/swms/${s.id}/export?format=docx`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Export DOCX">
                  <FileText size={14} />
                </a>
                <button onClick={() => { setEditing(s); setShowModal(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
                  <Wand2 size={14} />
                </button>
                <button onClick={() => handleArchive(s.id, s.status)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title={s.status === 'archived' ? 'Unarchive' : 'Archive'}>
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <SwmsFormModal
            initial={editing}
            onClose={() => { setShowModal(false); setEditing(null); }}
            onSaved={(s) => {
              setSwmsList((prev) => editing ? prev.map((x) => x.id === s.id ? s : x) : [s, ...prev]);
              setShowModal(false); setEditing(null);
            }}
          />
        )}
        {printing && <SwmsPrintModal swms={printing} onClose={() => setPrinting(null)} />}
      </AnimatePresence>
      {shareTarget && (
        <ShareLinkModal
          open={!!shareTarget}
          onClose={() => setShareTarget(null)}
          targetType="swms"
          targetId={String(shareTarget.id)}
          title={shareTarget.title}
        />
      )}
    </div>
  );
}

// ── Safety Plans Tab ──────────────────────────────────────────────────────────

function SafetyPlansTab() {
  const [plans, setPlans] = useState<SafetyPlan[]>([]);
  const [jobs, setJobs] = useState<Array<{ id: number; name: string; jobNumber: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SafetyPlan | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/safety/plans', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/jobs', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([pd, jd]) => {
      setPlans(pd.plans ?? []);
      setJobs((jd.jobs ?? []).map((j: { id: number; name: string; jobNumber?: string | null }) => ({ id: j.id, name: j.name, jobNumber: j.jobNumber ?? null })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSeed() {
    setSeeding(true); setSeedMsg('');
    try {
      const r = await fetch('/api/safety/plans/seed', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setSeedMsg(d.message ?? 'Plans added.');
        const r2 = await fetch('/api/safety/plans', { credentials: 'include' });
        const d2 = await r2.json();
        setPlans(d2.plans ?? []);
      } else {
        setSeedMsg(d.error ?? 'Failed to seed plans.');
      }
    } catch {
      setSeedMsg('Failed to seed plans.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/safety/plans/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) {
        setPlans((prev) => prev.filter((p) => p.id !== id));
      } else {
        const d = await r.json();
        alert(d.error ?? 'Failed to delete plan.');
      }
    } catch {
      alert('Failed to delete plan.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{plans.length} plan{plans.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Load 3 industry-standard Safety Plan templates"
          >
            {seeding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
            <span className="hidden sm:inline">Load Templates</span>
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} /><span className="hidden sm:inline">New Plan</span>
          </button>
        </div>
      </div>

      {seedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 text-sm">
          <Check size={14} className="shrink-0" />{seedMsg}
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && plans.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><ShieldCheck size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No safety plans yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Create site-specific safety plans, or load 3 industry-standard templates to get started quickly.</p>
          <div className="flex items-center gap-3">
            <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
              Load Templates
            </button>
            <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              <Plus size={15} />Create Plan
            </button>
          </div>
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div className="flex flex-col gap-2">
          {plans.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(p.status)}`}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </span>
                  {p.is_principal_contractor === 1 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">Principal Contractor</span>
                  )}
                </div>
                <h3 className="font-bold text-sm text-slate-800">{p.title}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                  {p.job_name && <span className="flex items-center gap-1"><Building2 size={10} />{p.job_number ? `${p.job_number} — ` : ''}{p.job_name}</span>}
                  {p.site_address && <span>{p.site_address}</span>}
                  {p.project_value && <span>${parseFloat(p.project_value).toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={`/api/safety/plans/${p.id}/pack`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Download Safety Pack (Plan + all SWMS)">
                  <Package size={14} />
                </a>
                <a href={`/api/safety/plans/${p.id}/export?format=pdf`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Export PDF">
                  <FileDown size={14} />
                </a>
                <a href={`/api/safety/plans/${p.id}/export?format=docx`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Export DOCX">
                  <FileText size={14} />
                </a>
                <button onClick={() => { setEditing(p); setShowModal(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
                  <Wand2 size={14} />
                </button>
                <button onClick={() => handleDelete(p.id, p.title)} disabled={deleting === p.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete plan">
                  {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <PlanFormModal
            initial={editing}
            jobs={jobs}
            onClose={() => { setShowModal(false); setEditing(null); }}
            onSaved={(p) => {
              setPlans((prev) => editing ? prev.map((x) => x.id === p.id ? p : x) : [p, ...prev]);
              setShowModal(false); setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Policies & Procedures Tab ─────────────────────────────────────────────────

function PoliciesTab() {
  const [docs, setDocs] = useState<SafetyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/safety/documents?type=policy', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    if (!confirm('Delete this document?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/safety/documents/${id}`, { method: 'DELETE', credentials: 'include' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /><span className="hidden sm:inline">Upload Document</span>
        </button>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><BookOpen size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No policies uploaded yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Upload your WHS policies, procedures, and safety management documents.</p>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
            <Plus size={15} />Upload First Document
          </button>
        </div>
      )}

      {!loading && docs.length > 0 && (
        <div className="flex flex-col gap-2">
          {docs.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                <FileText size={16} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-800 truncate">{d.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 flex-wrap">
                  <span>{d.doc_type}</span>
                  <span>{fmtBytes(d.size_bytes)}</span>
                  {d.review_date && <span className="flex items-center gap-1"><Calendar size={10} />Review: {fmtDate(d.review_date)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={`/api/safety/documents/${d.id}/download`} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Download">
                  <Download size={14} />
                </a>
                <button onClick={() => handleDelete(d.id)} disabled={deleting === d.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                  {deleting === d.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showUpload && (
          <UploadDocModal
            endpoint="/api/safety/documents"
            title="Upload Policy / Procedure"
            typeOptions={POLICY_TYPES}
            typeField="docType"
            onClose={() => setShowUpload(false)}
            onUploaded={(doc) => { setDocs((prev) => [doc as SafetyDocument, ...prev]); setShowUpload(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Site Posters Tab ──────────────────────────────────────────────────────────

function PostersTab() {
  const [posters, setPosters] = useState<SafetyPoster[]>([]);
  const [generated, setGenerated] = useState<GeneratedPoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingGen, setDeletingGen] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/safety/posters', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/generated-posters', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([pd, gd]) => {
      setPosters(pd.posters ?? []);
      setGenerated(gd.posters ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    if (!confirm('Delete this poster?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/safety/posters/${id}`, { method: 'DELETE', credentials: 'include' });
      setPosters((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteGenerated(id: number) {
    if (!confirm('Delete this generated poster?')) return;
    setDeletingGen(id);
    try {
      await fetch(`/api/safety/generated-posters/${id}`, { method: 'DELETE', credentials: 'include' });
      setGenerated((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeletingGen(null);
    }
  }

  const totalCount = posters.length + generated.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{totalCount} poster{totalCount !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGenerator(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors"
          >
            <Wand2 size={14} /><span className="hidden sm:inline">Generate Poster</span>
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            <Plus size={14} /><span className="hidden sm:inline">Upload</span>
          </button>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && totalCount === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><Image size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No site posters yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Generate professional safety posters — risk matrix, emergency contacts, PPE, life saving rules, and more.</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowGenerator(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              <Wand2 size={14} />Generate Poster
            </button>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              <Plus size={14} />Upload Poster
            </button>
          </div>
        </div>
      )}

      {/* Generated posters */}
      {!loading && generated.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Generated Posters</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {generated.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                  <Wand2 size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{p.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">{p.poster_type.replace(/_/g, ' ')} · Generated</p>
                </div>
                <button onClick={() => handleDeleteGenerated(p.id)} disabled={deletingGen === p.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                  {deletingGen === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded posters */}
      {!loading && posters.length > 0 && (
        <div>
          {generated.length > 0 && <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1 mt-2">Uploaded Posters</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {posters.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                  <Image size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{p.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{p.poster_type} · {fmtBytes(p.size_bytes)}</p>
                </div>
                <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                  {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showUpload && (
          <UploadDocModal
            endpoint="/api/safety/posters"
            title="Upload Site Poster"
            typeOptions={POSTER_TYPES}
            typeField="posterType"
            onClose={() => setShowUpload(false)}
            onUploaded={(p) => { setPosters((prev) => [p as SafetyPoster, ...prev]); setShowUpload(false); }}
          />
        )}
        {showGenerator && (
          <SafetyPosterGenerator
            onClose={() => setShowGenerator(false)}
            onSaved={(p) => { setGenerated((prev) => [p as GeneratedPoster, ...prev]); setShowGenerator(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function SafetyDashboardTab() {
  const [stats, setStats] = useState<{
    swmsTotal: number; swmsActive: number; swmsDraft: number;
    plansTotal: number; plansActive: number;
    docsTotal: number; postersTotal: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/safety/swms', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/plans', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/documents', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/posters', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([sw, pl, dc, po]) => {
      const swmsList: SwmsTemplate[] = sw.swms ?? [];
      const plansList: SafetyPlan[] = pl.plans ?? [];
      setStats({
        swmsTotal: swmsList.length,
        swmsActive: swmsList.filter((s) => s.status === 'active').length,
        swmsDraft: swmsList.filter((s) => s.status === 'draft').length,
        plansTotal: plansList.length,
        plansActive: plansList.filter((p) => p.status === 'active').length,
        docsTotal: (dc.documents ?? []).length,
        postersTotal: (po.posters ?? []).length,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  const cards = [
    { label: 'SWMS Templates', value: stats?.swmsTotal ?? 0, sub: `${stats?.swmsActive ?? 0} active`, icon: ShieldAlert, color: 'text-primary', bg: 'bg-orange-50' },
    { label: 'Safety Plans', value: stats?.plansTotal ?? 0, sub: `${stats?.plansActive ?? 0} active`, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Policies & Docs', value: stats?.docsTotal ?? 0, sub: 'uploaded', icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Site Posters', value: stats?.postersTotal ?? 0, sub: 'uploaded', icon: Image, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon size={18} className={c.color} />
              </div>
              <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">{c.label}</div>
              <div className="text-xs text-slate-400">{c.sub}</div>
            </div>
          );
        })}
      </div>

      {stats?.swmsDraft && stats.swmsDraft > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">{stats.swmsDraft} SWMS template{stats.swmsDraft !== 1 ? 's' : ''} in draft</p>
            <p className="text-xs text-amber-700">Review and activate SWMS templates before assigning to jobs.</p>
          </div>
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-heading font-bold text-sm text-slate-700 mb-3">Quick Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: 'SWMS Library', desc: 'Manage reusable SWMS templates', icon: ShieldAlert },
            { label: 'Site Safety Plans', desc: 'Job-specific safety plans', icon: ShieldCheck },
            { label: 'Policies & Procedures', desc: 'Company safety documents', icon: BookOpen },
            { label: 'Site Posters', desc: 'Emergency contacts, risk matrix', icon: Image },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-primary/30 hover:bg-orange-50/30 transition-colors">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">{item.label}</p>
                  <p className="text-xs text-slate-400">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',    icon: ShieldCheck },
  { id: 'swms',       label: 'SWMS Library', icon: ShieldAlert },
  { id: 'plans',      label: 'Safety Plans', icon: ClipboardList },
  { id: 'policies',   label: 'Policies',     icon: BookOpen },
  { id: 'posters',    label: 'Posters',      icon: Image },
  { id: 'cost-guide', label: 'Cost Guide',   icon: DollarSign },
  { id: 'recipes',    label: 'Recipes',      icon: ChefHat },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SafetyPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  // Run migration on mount
  useEffect(() => {
    fetch('/api/migrate-safety', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <div className="portal-page">
      <Helmet>
        <title>Admin — IWILLBUILD Portal</title>
        <meta name="description" content="Admin hub — SWMS, safety plans, policies, posters, cost guide and recipes." />
        <link rel="canonical" href="https://iwillbuild.com/safety" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Admin — IWILLBUILD Portal" />
        <meta property="og:description" content="Admin hub — SWMS, safety plans, policies, posters, cost guide and recipes." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/safety" />
        <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Admin — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Admin hub — SWMS, safety plans, policies, posters, cost guide and recipes." />
        <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-main">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={openMobileMenu} className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <ShieldAlert size={18} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-base md:text-lg">Admin</h1>
          </div>
          <FleetHeaderIcon />
        </header>

        {/* Tab bar */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 shrink-0">
          <div className="scroll-x-hide flex gap-1 py-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard'  && <SafetyDashboardTab />}
            {activeTab === 'swms'       && <SwmsLibraryTab />}
            {activeTab === 'plans'      && <SafetyPlansTab />}
            {activeTab === 'policies'   && <PoliciesTab />}
            {activeTab === 'posters'    && <PostersTab />}
            {activeTab === 'cost-guide' && <CostGuideTab />}
            {activeTab === 'recipes'    && <RecipesTab />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
