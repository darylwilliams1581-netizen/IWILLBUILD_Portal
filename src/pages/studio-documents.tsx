/**
 * /studio/documents — Standalone Documents page
 * Two sub-tabs: Documents (template list) | Submissions (completed docs)
 * Matches the Forms page pattern exactly.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Layers, Plus, Lock, Copy, Share2, Pencil, ChevronDown, Loader2, AlertTriangle, Search, Trash2, X, Inbox, ArrowLeft, User, Calendar, ChevronUp, Eye, FileText, File, Library, Briefcase } from 'lucide-react';
import GenerateJobReportModal from '@/components/studio/GenerateJobReportModal';
import AttachToJobSheet from '@/components/studio/AttachToJobSheet';
import DocxImporter from '@/components/DocumentBuilder/DocxImporter';
import NewDocumentModal from '@/components/DocumentBuilder/NewDocumentModal';
import SourceDocumentPanel from '@/components/DocumentBuilder/SourceDocumentPanel';
import type { DocumentBlock } from '@/components/DocumentBuilder/types';
import { toast } from 'sonner';
import { usePermissions } from '@/lib/usePermissions';
import { goBack } from '@/lib/navigation';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';
import DazzaBuilderAssistant from '@/components/DazzaBuilderAssistant';
import { studio } from 'virtual:content';
import { LibraryView as LibraryPage } from '../features/library/LibraryView';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocTemplate {
  id: number;
  name: string;
  template_type: string | null;
  is_active: number | boolean;
  source_docx_name: string | null;
  created_at: string;
  updated_at: string;
  doc_kind: string | null;
  requires_acknowledgement: number | boolean | null;
  /** Set when the document was generated from a Safety widget */
  safety_category?: string | null;
  source_widget_type?: string | null;
  source_record_id?: number | null;
  /** Phase 2: Word/PDF source document */
  source_type?: string | null;
  source_file_name?: string | null;
  source_revision?: number | null;
}
interface DocSubmission {
  id: number;
  template_id: number;
  template_name: string;
  template_type: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  job_id: number | null;
  job_name: string | null;
  job_number: string | null;
  status: string;
  submitted_at: string;
  answers_json: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  swms: 'SWMS',
  policy: 'Policy',
  procedure: 'Procedure',
  form: 'Form',
  contract: 'Contract',
  quote: 'Quote',
  report: 'Report',
  induction: 'Induction',
  toolbox_talk: 'Toolbox Talk',
  safety_plan: 'Safety Plan',
  custom: 'Custom'
};
const TYPE_COLORS: Record<string, string> = {
  swms: 'bg-red-100 text-red-700 border-red-200',
  safety_plan: 'bg-red-100 text-red-700 border-red-200',
  policy: 'bg-blue-100 text-blue-700 border-blue-200',
  procedure: 'bg-purple-100 text-purple-700 border-purple-200',
  toolbox_talk: 'bg-amber-100 text-amber-700 border-amber-200',
  form: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  contract: 'bg-amber-100 text-amber-700 border-amber-200',
  quote: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  report: 'bg-violet-100 text-violet-800 border-violet-200',
  induction: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  custom: 'bg-slate-100 text-slate-600 border-slate-200'
};
function typeLabel(t: string | null) {
  return t ? TYPE_LABELS[t] ?? t : 'Custom';
}
function typeColor(t: string | null) {
  return t ? TYPE_COLORS[t] ?? TYPE_COLORS.custom : TYPE_COLORS.custom;
}
function revLabel(updatedAt: string) {
  const d = new Date(updatedAt);
  return `Rev ${d.getFullYear() % 100}`;
}

// ── Toolbar button ─────────────────────────────────────────────────────────────

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  danger = false,
  variant
}: {
  icon: React.ElementType;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  danger?: boolean;
  variant?: 'orange' | 'green';
}) {
  const cls = danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-500' : variant === 'orange' ? 'text-violet-600 hover:bg-violet-50 hover:text-violet-700' : variant === 'green' ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700';
  return <button title={label} onClick={e => {
    e.stopPropagation();
    onClick?.(e);
  }} className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${cls}`}>
      <Icon size={14} />
    </button>;
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({
  doc,
  index,
  onDelete,
  onShare,
  onShowSourcePanel,
}: {
  doc: DocTemplate;
  index: number;
  onDelete: (id: number) => void;
  onShare: (id: number) => void;
  onShowSourcePanel?: (id: number, name: string, templateType?: string) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [jobNumberInput, setJobNumberInput] = useState('');
  const [jobPickerError, setJobPickerError] = useState('');
  const isActive = Boolean(doc.is_active);
  // Doc Studio is always doc kind — no form branching here
  const hasAcknowledgement = Boolean(doc.requires_acknowledgement);
  const isSafetyDoc = doc.template_type === 'swms' || doc.template_type === 'safety_plan';
  function openBuilder() {
    navigate(`/studio/builder/${doc.id}`);
  }
  function openUse() {
    setJobNumberInput('');
    setJobPickerError('');
    setShowJobPicker(true);
  }
  function handleJobPickerSubmit() {
    const jobNum = jobNumberInput.trim();
    if (!jobNum || isNaN(Number(jobNum)) || Number(jobNum) < 1) {
      setJobPickerError('Please enter a valid job number.');
      return;
    }
    setShowJobPicker(false);
    navigate(`/studio/builder/${doc.id}?mode=use&jobId=${Number(jobNum)}`);
  }
  async function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const r = await fetch(`/api/document-templates/${doc.id}/duplicate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (r.ok) {
        toast.success('Document duplicated');
        window.location.reload();
      } else toast.error('Could not duplicate document.');
    } catch {
      toast.error('Network error — could not duplicate document.');
    }
  }
  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/studio/builder/${doc.id}`);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy link.');
    }
  }
  return <motion.div initial={{
    opacity: 0,
    y: 5
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    duration: 0.14,
    delay: index * 0.018,
    ease: 'easeOut'
  }} className="group rounded-xl border border-border bg-white hover:border-primary/40 hover:shadow-sm transition-all duration-150 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={openBuilder}>
        <div className="flex items-center gap-2 flex-shrink-0 w-40">
          {isActive ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Active
            </span> : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
              <Lock size={9} />Inactive
            </span>}
          <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">{revLabel(doc.updated_at)}</span>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <p className="text-sm font-bold text-slate-800 truncate leading-tight">{doc.name}</p>
          <span className={`hidden sm:inline-flex flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${typeColor(doc.template_type)}`}>
            {typeLabel(doc.template_type)}
          </span>
          {hasAcknowledgement && <span className="hidden md:inline-flex flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
              Sign-On
            </span>}
          {/* Word / PDF Source badge */}
          {(doc.source_type === 'docx' || doc.source_type === 'pdf') && (
            <button
              onClick={(e) => { e.stopPropagation(); onShowSourcePanel?.(doc.id, doc.name, doc.template_type); }}
              className={[
                'hidden sm:inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors',
                doc.source_type === 'pdf'
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
              ].join(' ')}
              title={`${doc.source_type === 'pdf' ? 'PDF' : 'Word'} source — click to manage`}
            >
              {doc.source_type === 'pdf'
                ? <File size={9} />
                : <FileText size={9} />
              }
              {doc.source_type === 'pdf' ? 'PDF' : 'Word'}
            </button>
          )}
          {doc.source_docx_name && !doc.source_type && <span className="hidden lg:inline text-[10px] text-slate-400 truncate max-w-[160px]">{doc.source_docx_name}</span>}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <ToolBtn icon={Copy} label="Duplicate" onClick={handleDuplicate} />
          <ToolBtn icon={Share2} label="Copy link" onClick={handleShare} />
          <ToolBtn icon={Pencil} label="Edit" onClick={e => {
          e.stopPropagation();
          openBuilder();
        }} variant="orange" />
          <ToolBtn icon={Eye} label="Open / Review" onClick={e => {
          e.stopPropagation();
          openUse();
        }} variant="green" />
          <ToolBtn icon={Trash2} label="Delete" onClick={e => {
          e.stopPropagation();
          setConfirmDel(true);
        }} danger />
          <button title={expanded ? 'Collapse' : 'Expand'} onClick={e => {
          e.stopPropagation();
          setExpanded(v => !v);
        }} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors flex-shrink-0">
            <ChevronDown size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span>Type: <span className="text-slate-700 font-medium">{typeLabel(doc.template_type)}</span></span>
            <span>Created: <span className="text-slate-700 font-medium">{new Date(doc.created_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}</span></span>
            <span>Updated: <span className="text-slate-700 font-medium">{new Date(doc.updated_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}</span></span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={openBuilder} className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-2 rounded-xl transition-all hover:brightness-110 bg-primary">
              <Pencil size={11} /> Edit
            </button>
            <button onClick={openUse} className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
              <Eye size={11} /> Open / Review
            </button>
            {isSafetyDoc && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAttachSheet(true); }}
                className="flex items-center gap-1.5 text-xs font-bold text-violet-700 px-3 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors"
              >
                <Briefcase size={11} /> Attach to Job
              </button>
            )}
            {(doc.source_type === 'docx' || doc.source_type === 'pdf') && (
              <button
                onClick={(e) => { e.stopPropagation(); onShowSourcePanel?.(doc.id, doc.name, doc.template_type); }}
                className={[
                  'flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-colors',
                  doc.source_type === 'pdf'
                    ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200'
                    : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200',
                ].join(' ')}
              >
                {doc.source_type === 'pdf' ? <File size={11} /> : <FileText size={11} />}
                {doc.source_type === 'pdf' ? 'PDF Source' : 'Word Source'}
              </button>
            )}
          </div>
        </div>}

      {confirmDel && <div className="border-t border-red-100 bg-red-50 px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700 flex-1">Delete <strong>{doc.name}</strong>? This cannot be undone.</p>
          <button onClick={() => {
        setConfirmDel(false);
        onDelete(doc.id);
      }} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors">Delete</button>
          <button onClick={() => setConfirmDel(false)} className="p-1 text-slate-600 hover:text-slate-800 transition-colors"><X size={13} /></button>
        </div>}

      <AnimatePresence>
        {showJobPicker && <motion.div initial={{
        opacity: 0      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={() => setShowJobPicker(false)}>
            <motion.div initial={{
          opacity: 0,
          scale: 0.95,
          y: 8
        }} animate={{
          opacity: 1,
          scale: 1,
          y: 0
        }} exit={{
          opacity: 0,
          scale: 0.95,
          y: 8
        }} transition={{
          duration: 0.15,
          ease: 'easeOut'
        }} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading font-bold text-base text-slate-900 leading-tight">Open Document</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Enter the job number to link this document to a job.</p>
                </div>
                <button onClick={() => setShowJobPicker(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"><X size={15} /></button>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                <Eye size={14} className="text-slate-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 truncate">{doc.name}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">Job Number</label>
                <input type="number" min={1} placeholder="e.g. 1042" value={jobNumberInput} onChange={e => {
              setJobNumberInput(e.target.value);
              setJobPickerError('');
            }} onKeyDown={e => {
              if (e.key === 'Enter') handleJobPickerSubmit();
            }} autoFocus className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
                {jobPickerError && <p className="text-xs text-red-600 flex items-center gap-1.5 mt-0.5"><X size={11} className="shrink-0" />{jobPickerError}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowJobPicker(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleJobPickerSubmit} disabled={!jobNumberInput.trim()} className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  <Eye size={14} /> Open Document
                </button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* Attach to Job sheet — SWMS and Safety Plan only */}
      {showAttachSheet && (
        <AttachToJobSheet
          open={showAttachSheet}
          studioDocId={doc.id}
          docTitle={doc.name}
          templateType={doc.template_type ?? ''}
          onClose={() => setShowAttachSheet(false)}
          onAttached={() => { setShowAttachSheet(false); }}
        />
      )}
    </motion.div>;
}

// ── Submissions tab ────────────────────────────────────────────────────────────

export function SubmissionsTab({
  templates
}: {
  templates: DocTemplate[];
}) {
  const [submissions, setSubmissions] = useState<DocSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateFilter, setTemplateFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => {
    const url = templateFilter ? `/api/document-submissions?templateId=${templateFilter}` : '/api/document-submissions';
    fetch(url, {
      credentials: 'include'
    }).then(r => r.json()).then((d: {
      submissions?: DocSubmission[];
    }) => setSubmissions(d.submissions ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [templateFilter]);
  function toggleExpand(id: number) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return <div className="p-6 pb-16 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={templateFilter} onChange={e => {
        setTemplateFilter(e.target.value);
        setLoading(true);
      }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">All documents</option>
          {templates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
        <span className="text-xs text-slate-400">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div> : submissions.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-violet-50 rounded-xl flex items-center justify-center mb-4">
            <Inbox size={24} className="text-primary" />
          </div>
          <p className="font-heading font-bold text-slate-700 mb-1">No submissions yet</p>
          <p className="text-sm text-slate-400 max-w-xs">Use a document template on a job to start collecting completed documents.</p>
        </div> : <div className="space-y-2">
          {submissions.map(s => {
        const isOpen = expanded.has(s.id);
        let answers: Record<string, unknown> = {};
        try {
          answers = s.answers_json ? JSON.parse(s.answers_json) as Record<string, unknown> : {};
        } catch {/* ignore */}
        const answerCount = Object.keys(answers).length;
        return <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpand(s.id)}>
                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                    <User size={14} className="text-violet-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {s.submitter_name ?? 'Anonymous'}
                      {s.submitter_email && <span className="text-slate-400 font-normal ml-2 text-xs">{s.submitter_email}</span>}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                      <span className="font-medium text-slate-600">{s.template_name}</span>
                      {s.job_name && <span>· {s.job_name}{s.job_number ? ` #${s.job_number}` : ''}</span>}
                      <span className="flex items-center gap-1"><Calendar size={9} />{fmtDate(s.submitted_at)}</span>
                      <span>{answerCount} field{answerCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{s.status}</span>
                    {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                </div>
                <AnimatePresence>
                  {isOpen && <motion.div initial={{
              height: 0,
              opacity: 0
            }} animate={{
              height: 'auto',
              opacity: 1
            }} exit={{
              height: 0,
              opacity: 0
            }} transition={{
              duration: 0.2
            }} className="overflow-hidden">
                      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                        {answerCount === 0 ? <p className="text-xs text-slate-400 italic">No fields recorded</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Object.entries(answers).map(([fieldId, answer]) => <div key={fieldId} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Field {fieldId}</p>
                                <p className="text-xs text-slate-700 break-words">
                                  {Array.isArray(answer) ? (answer as string[]).join(', ') : String(answer ?? '—')}
                                </p>
                              </div>)}
                          </div>}
                      </div>
                    </motion.div>}
                </AnimatePresence>
              </div>;
      })}
        </div>}
    </div>;
}

// ── Job Reports tab ───────────────────────────────────────────────────────────

function JobReportsTab({
  onGenerate,
  templates
}: {
  onGenerate: () => void;
  templates: DocTemplate[];
}) {
  const navigate = useNavigate();
  const reports = templates.filter(t => t.template_type === 'job_report');
  return <div className="p-6 pb-16 flex flex-col gap-6">
      {/* Intro card */}
      <div className="flex items-start gap-4 bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4">
        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
          <FileText size={18} className="text-violet-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 leading-tight">Job Reports</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Generate a client-facing report for any job. Select the job, choose which sections to include,
            and the report opens in Doc Studio where you can review, edit, and send it as a PDF.
          </p>
          <button onClick={onGenerate} className="mt-3 flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors">
            <FileText size={13} />Generate Job Report
          </button>
        </div>
      </div>

      {/* Previously generated reports */}
      {reports.length > 0 && <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Previously generated reports</p>
          {reports.map(r => <div key={r.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-colors cursor-pointer group" onClick={() => navigate(`/studio/builder/${r.id}`)}>
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <FileText size={14} className="text-violet-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(r.updated_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
                </p>
              </div>
              <Pencil size={13} className="text-slate-300 group-hover:text-violet-600 transition-colors shrink-0" />
            </div>)}
        </div>}

      {reports.length === 0 && <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-3">
            <FileText size={20} className="text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No reports yet</p>
          <p className="text-xs text-slate-400 mt-1">Hit "Generate Job Report" to create your first one.</p>
        </div>}
    </div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudioDocumentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    isPlatformOwner
  } = usePermissions();
  const tabParam = searchParams.get('tab') as 'documents' | 'submissions' | 'library' | 'reports' | null;
  const [pageTab, setPageTab] = useState<'documents' | 'submissions' | 'library' | 'reports'>(tabParam === 'submissions' ? 'submissions' : tabParam === 'library' ? 'library' : tabParam === 'reports' ? 'reports' : 'documents');
  function switchTab(t: 'documents' | 'submissions' | 'library' | 'reports') {
    setPageTab(t);
    setSearchParams(t === 'documents' ? {} : {
      tab: t
    }, {
      replace: true
    });
  }

  // ── Job Report modal state ───────────────────────────────────────────────────
  const [showReportModal, setShowReportModal] = useState(false);

  // ── Template list state ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  // ── Import state ─────────────────────────────────────────────────────────────
  const [showImporter, setShowImporter] = useState(false);
  const [importTemplateId, setImportTemplateId] = useState<number | null>(null);
  // ── New Document modal ────────────────────────────────────────────────────────
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  // ── Source Document panel ─────────────────────────────────────────────────────
  const [sourcePanel, setSourcePanel] = useState<{ id: number; name: string; templateType?: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/document-templates', {
        credentials: 'include'
      });
      if (!r.ok) throw new Error('Failed to load');
      const d = (await r.json()) as {
        templates?: DocTemplate[];
      };
      setTemplates(d.templates ?? []);
    } catch {
      setError('Could not load templates. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function handleDelete(id: number) {
    try {
      const r = await fetch(`/api/document-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (r.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        toast.success('Document deleted');
      } else toast.error('Could not delete document.');
    } catch {
      toast.error('Network error — could not delete document.');
    }
  }
  const handleOpenImporter = useCallback(async () => {
    try {
      const res = await fetch('/api/document-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: 'Imported Document',
          templateType: 'custom',
          blocks: [],
          layout: {},
          theme: {}
        })
      });
      if (!res.ok) throw new Error('Failed to create placeholder');
      const data = (await res.json()) as {
        id?: number;
      };
      if (!data.id) throw new Error('No ID returned');
      setImportTemplateId(data.id);
      setShowImporter(true);
    } catch {
      toast.error('Could not start import. Please try again.');
    }
  }, []);
  const handleStudioImported = useCallback(async (blocks: DocumentBlock[], docxName: string, templateId: number) => {
    try {
      await fetch(`/api/document-templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: docxName.replace(/\.(docx|pdf)$/i, '') || 'Imported Document',
          blocks
        })
      });
    } finally {
      navigate(`/studio/builder/${templateId}`);
    }
  }, [navigate]);
  const filtered = templates.filter(t => {
    const isSafetyFilter = typeFilter === 'SWMS' || typeFilter === 'WHS Plan';
    const matchType = typeFilter === 'All'
      ? true
      : isSafetyFilter
        ? t.safety_category === typeFilter
        : t.template_type === typeFilter;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });
  const activeCount = templates.filter(t => Boolean(t.is_active)).length;
  return <div className="flex flex-col flex-1 min-h-0 lg-portal">
      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Documents — IWIllBUILD</title>
        <meta name="description" content="IWIllBUILD document templates — build, use and manage your company documents." />
        <link rel="canonical" href="https://iwillbuild.com/studio/documents" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <header className="sticky top-0 z-30 h-12 bg-white border-b border-border flex items-center px-4 shrink-0 gap-2 safe-top">
        <button onClick={() => goBack(navigate, '/studio')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="Back to Home">
          <ArrowLeft size={16} /><span className="hidden sm:inline">Home</span>
        </button>
        <span className="text-gray-300">|</span>
        <Layers size={17} className="text-primary shrink-0" />
        <h1 className="font-heading font-bold text-base truncate flex-1">Documents</h1>
        {pageTab === 'reports' && <button onClick={() => setShowReportModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-700 text-white text-sm font-semibold transition-colors shrink-0">
            <FileText size={14} /><span className="hidden sm:inline">Generate Job Report</span>
          </button>}
        {pageTab === 'documents' && <button onClick={() => setShowNewDocModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-700 text-white text-sm font-semibold transition-colors shrink-0">
            <Plus size={14} /><span className="hidden sm:inline">New document</span>
          </button>}
      </header>

      {/* Tab bar — Documents / Submissions / Library / Reports */}
      <div className="flex border-b border-slate-200 bg-white px-6 gap-1 shrink-0">
        {[{
        key: 'documents' as const,
        label: 'Documents',
        icon: Layers
      }, {
        key: 'submissions' as const,
        label: 'Submissions',
        icon: Inbox
      }, {
        key: 'library' as const,
        label: 'Library',
        icon: Library
      }, {
        key: 'reports' as const,
        label: 'Job Reports',
        icon: FileText
      }].map(({
        key,
        label,
        icon: Icon
      }) => <button key={key} onClick={() => switchTab(key)} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${pageTab === key ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={13} />{label}
          </button>)}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pageTab === 'documents' && <>
            {/* Sub-toolbar */}
            <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3 overflow-x-auto sticky top-0 z-10">
              <div className="relative flex-shrink-0 w-56">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…" className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-400" />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {studio.ALL_TYPES.map(t => <button key={t} onClick={() => setTypeFilter(t)} className={['flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150', typeFilter === t ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200'].join(' ')}>
                    {t === 'All' ? 'All' : TYPE_LABELS[t] ?? t}
                  </button>)}
                <div className="w-px h-4 bg-slate-200 mx-1 flex-shrink-0" />
                {(['SWMS', 'WHS Plan'] as const).map(cat => <button key={cat} onClick={() => setTypeFilter(cat)} className={['flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150', typeFilter === cat ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'].join(' ')}>
                    {cat}
                  </button>)}
              </div>
            </div>

            {/* Stats strip */}
            <div className="px-6 py-2 flex items-center gap-6 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span><span className="text-slate-700 font-semibold">{activeCount}</span> active</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                <span><span className="text-slate-700 font-semibold">{templates.length}</span> total</span>
              </div>
            </div>

            {/* List */}
            <div className="px-6 py-4">
              {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 mb-4">
                  <AlertTriangle size={14} />{error}
                </div>}
              {loading ? <div className="flex items-center justify-center py-24"><Loader2 size={22} className="animate-spin text-slate-400" /></div> : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
                    <Layers size={22} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">{templates.length === 0 ? 'No documents yet' : 'No results'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {templates.length === 0 ? 'Click "New document" to create your first template' : 'Try a different search or filter'}
                  </p>
                  {templates.length === 0 && <button onClick={() => setShowNewDocModal(true)} className="mt-4 flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors">
                      <Plus size={14} />New document
                    </button>}
                </div> : <motion.div variants={{
            visible: {
              transition: {
                staggerChildren: 0.015
              }
            }
          }} initial="hidden" animate="visible" className="flex flex-col gap-2">
                  {filtered.map((doc, i) => <DocRow key={doc.id} doc={doc} index={i} onDelete={handleDelete} onShare={() => {}} onShowSourcePanel={(id, name, ttype) => setSourcePanel({ id, name, templateType: ttype })} />)}
                </motion.div>}
            </div>
          </>}

        {pageTab === 'submissions' && <SubmissionsTab templates={templates} />}

        {/* ── Library tab ── */}
        {pageTab === 'library' && <LibraryPage />}

        {/* ── Job Reports tab ── */}
        {pageTab === 'reports' && <JobReportsTab onGenerate={() => setShowReportModal(true)} templates={templates} />}
      </div>

      {/* Import modal (legacy — used from within builder ribbon) */}
      {showImporter && importTemplateId !== null && <DocxImporter
        templateId={importTemplateId}
        hasExistingBlocks={false}
        onClose={() => {
          setShowImporter(false);
          setImportTemplateId(null);
        }}
        onImported={(blocks, name) => {
          setShowImporter(false);
          void handleStudioImported(blocks, name, importTemplateId);
        }}
        onOpenInStudio={(result) => {
          setShowImporter(false);
          setImportTemplateId(null);
          navigate(`/studio/builder/${result.id}`);
        }}
        onSaveFirst={async () => importTemplateId}
      />}

      {/* New Document modal */}
      {showNewDocModal && (
        <NewDocumentModal
          onClose={() => setShowNewDocModal(false)}
          onOpenLibrary={() => {
            setShowNewDocModal(false);
            switchTab('library');
          }}
          onSaved={(id, name, sourceType) => {
            // Refresh the list so the new doc appears with the Word/PDF Source badge
            void load();
            // Open the SourceDocumentPanel for the new document
            setSourcePanel({ id, name, templateType: sourceType === 'pdf' ? 'pdf' : 'docx' });
          }}
        />
      )}

      {/* Source Document panel */}
      {sourcePanel && (
        <SourceDocumentPanel
          templateId={sourcePanel.id}
          templateName={sourcePanel.name}
          templateType={sourcePanel.templateType}
          isPlatformOwner={isPlatformOwner}
          onClose={() => setSourcePanel(null)}
        />
      )}

      {/* Generate Job Report modal */}
      {showReportModal && <GenerateJobReportModal onClose={() => setShowReportModal(false)} />}

      {/* Dazza Builder Assistant — floating on the documents list */}
      <DazzaBuilderAssistant
        builderContext={{
          builderType: 'document',
          templateId: null,
          templateName: 'Documents',
          templateType: 'list',
          currentVersion: 0,
          schemaSummary: 'Viewing the documents list — no template open.',
          selectedId: null,
          hasUnsavedChanges: false,
          validationErrors: [],
          isPreviewMode: false,
        }}
        onApplied={() => { void load(); }}
      />
    </div>;
}
