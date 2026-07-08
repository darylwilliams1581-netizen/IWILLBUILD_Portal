import { studio } from 'virtual:content';
/**
 * /studio — Document template list + Safety tab
 * Row layout: status badge + rev | bold title + type | icon toolbar
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Layers, Plus, Lock, Copy, Share2, Printer, FileDown, FileOutput, Pencil,
  ChevronDown, ChevronRight, Loader2, AlertTriangle, Search, Trash2, X,
  ShieldCheck, ClipboardList, BookOpen,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

// Tab content — lazy-imported to keep bundle lean
import SafetyContent from '@/components/safety/SafetyContent';
import { FormsPage as FormsContent } from '@/pages/forms';
import { LibraryPage as LibraryContent } from '@/pages/library';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocTemplate {
  id: number;
  name: string;
  template_type: string | null;
  is_active: number | boolean;
  source_docx_name: string | null;
  created_at: string;
  updated_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  swms:      'SWMS',
  policy:    'Policy',
  procedure: 'Procedure',
  form:      'Form',
  contract:  'Contract',
  quote:     'Quote',
  report:    'Report',
  induction: 'Induction',
  custom:    'Custom',
};

const TYPE_COLORS: Record<string, string> = {
  swms:      'bg-red-100 text-red-700 border-red-200',
  policy:    'bg-blue-100 text-blue-700 border-blue-200',
  procedure: 'bg-purple-100 text-purple-700 border-purple-200',
  form:      'bg-cyan-100 text-cyan-700 border-cyan-200',
  contract:  'bg-amber-100 text-amber-700 border-amber-200',
  quote:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  report:    'bg-orange-100 text-orange-700 border-orange-200',
  induction: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  custom:    'bg-slate-100 text-slate-600 border-slate-200',
};

// ── Top-level studio tabs ─────────────────────────────────────────────────────

const STUDIO_TABS = [
  { id: 'documents', label: 'Documents', icon: Layers },
  { id: 'forms',     label: 'Forms',     icon: ClipboardList },
  { id: 'library',   label: 'Library',   icon: BookOpen },
  { id: 'safety',    label: 'Safety',    icon: ShieldCheck },
] as const;

type StudioTabId = typeof STUDIO_TABS[number]['id'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(t: string | null) { return t ? (TYPE_LABELS[t] ?? t) : 'Custom'; }
function typeColor(t: string | null) { return t ? (TYPE_COLORS[t] ?? TYPE_COLORS.custom) : TYPE_COLORS.custom; }
function revLabel(updatedAt: string) {
  const d = new Date(updatedAt);
  return `Rev ${d.getFullYear() % 100}`;
}

// ── Toolbar icon button ───────────────────────────────────────────────────────

function ToolBtn({
  icon: Icon, label, onClick, danger = false,
}: {
  icon: React.ElementType; label: string; onClick?: (e: React.MouseEvent) => void; danger?: boolean;
}) {
  return (
    <button
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${
        danger
          ? 'text-slate-400 hover:bg-red-50 hover:text-red-500'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <Icon size={14} />
    </button>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocRow({ doc, index, onDelete }: { doc: DocTemplate; index: number; onDelete: (id: number) => void }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const isActive = Boolean(doc.is_active);

  function openBuilder() { navigate(`/studio/builder/${doc.id}`); }

  async function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const r = await fetch(`/api/document-templates/${doc.id}/duplicate`, { method: 'POST', credentials: 'include' });
      if (r.ok) window.location.reload();
    } catch { /* silent */ }
  }

  function handleExportPdf(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(`/api/document-templates/${doc.id}/export/pdf`, '_blank');
  }

  function handleExportDocx(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(`/api/document-templates/${doc.id}/export/docx`, '_blank');
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(`${window.location.origin}/studio/builder/${doc.id}`); } catch { /* silent */ }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, delay: index * 0.018, ease: 'easeOut' }}
      className="group rounded-xl border border-border bg-white hover:border-primary/40 hover:shadow-sm transition-all duration-150 overflow-hidden"
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={openBuilder}>
        {/* Status + revision */}
        <div className="flex items-center gap-2 flex-shrink-0 w-40">
          {isActive ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
              <Lock size={9} />Inactive
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{revLabel(doc.updated_at)}</span>
        </div>

        {/* Title + type */}
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <p className="text-sm font-bold text-slate-800 truncate leading-tight">{doc.name}</p>
          <span className={`hidden sm:inline-flex flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${typeColor(doc.template_type)}`}>
            {typeLabel(doc.template_type)}
          </span>
          {doc.source_docx_name && (
            <span className="hidden md:inline text-[10px] text-slate-400 truncate max-w-[160px]">{doc.source_docx_name}</span>
          )}
        </div>

        {/* Toolbar — always visible */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <ToolBtn icon={Copy}       label="Duplicate"   onClick={handleDuplicate} />
          <ToolBtn icon={Share2}     label="Copy link"   onClick={handleShare} />
          <ToolBtn icon={Printer}    label="Print"       onClick={handleExportPdf} />
          <ToolBtn icon={FileDown}   label="Export PDF"  onClick={handleExportPdf} />
          <ToolBtn icon={FileOutput} label="Export DOCX" onClick={handleExportDocx} />
          <ToolBtn icon={Pencil}     label="Edit"        onClick={(e) => { e.stopPropagation(); openBuilder(); }} />
          <ToolBtn icon={Trash2}     label="Delete"      onClick={(e) => { e.stopPropagation(); setConfirmDel(true); }} danger />
          <button
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
          >
            <ChevronDown size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>


      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span>Type: <span className="text-slate-700 font-medium">{typeLabel(doc.template_type)}</span></span>
            <span>Created: <span className="text-slate-700 font-medium">{new Date(doc.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
            <span>Updated: <span className="text-slate-700 font-medium">{new Date(doc.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={openBuilder} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors">
              <Pencil size={11} />Open in builder
            </button>
            <button onClick={handleExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors">
              <FileDown size={11} />Export PDF
            </button>
            <button onClick={handleExportDocx} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors">
              <FileOutput size={11} />Export DOCX
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700 flex-1">Delete <strong>{doc.name}</strong>? This cannot be undone.</p>
          <button onClick={() => { setConfirmDel(false); onDelete(doc.id); }} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors">Delete</button>
          <button onClick={() => setConfirmDel(false)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors"><X size={13} /></button>
        </div>
      )}
    </motion.div>
  );
}

// ── Documents tab content ─────────────────────────────────────────────────────

function DocumentsTab() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/document-templates', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load');
      const d = await r.json() as { templates?: DocTemplate[] };
      setTemplates(d.templates ?? []);
    } catch { setError('Could not load templates. Please refresh.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/document-templates/${id}`, { method: 'DELETE', credentials: 'include' });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch { /* silent */ }
  }

  const filtered = templates.filter((t) => {
    const matchType = typeFilter === 'All' || t.template_type === typeFilter;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const activeCount = templates.filter((t) => Boolean(t.is_active)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-toolbar */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3 overflow-x-auto">
        <div className="relative flex-shrink-0 w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {studio.ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={[
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                typeFilter === t ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200',
              ].join(' ')}
            >
              {t === 'All' ? 'All' : TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex-shrink-0 px-6 py-2 flex items-center gap-6 border-b border-slate-100 bg-white">
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
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 mb-4">
            <AlertTriangle size={14} />{error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-24"><Loader2 size={22} className="animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
              <Layers size={22} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">{templates.length === 0 ? 'No documents yet' : 'No results'}</p>
            <p className="text-xs text-slate-400 mt-1">
              {templates.length === 0 ? 'Click "New document" to create your first template' : 'Try a different search or filter'}
            </p>
            {templates.length === 0 && (
              <button onClick={() => navigate('/studio/builder/new')} className="mt-4 flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors">
                <Plus size={14} />New document
              </button>
            )}
          </div>
        ) : (
          <motion.div
            variants={{ visible: { transition: { staggerChildren: 0.015 } } }}
            initial="hidden" animate="visible"
            className="flex flex-col gap-2"
          >
            {filtered.map((doc, i) => (
              <DocRow key={doc.id} doc={doc} index={i} onDelete={handleDelete} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read tab from ?tab= query param so direct links and sidebar work
  const tabParam = searchParams.get('tab');
  const validTabs: StudioTabId[] = ['documents', 'forms', 'library', 'safety'];
  const [activeTab, setActiveTab] = useState<StudioTabId>(
    validTabs.includes(tabParam as StudioTabId) ? (tabParam as StudioTabId) : 'documents'
  );

  function switchTab(id: StudioTabId) {
    setActiveTab(id);
    setSearchParams(id === 'documents' ? {} : { tab: id }, { replace: true });
  }

  // Sync if URL param changes externally (e.g. sidebar link)
  useEffect(() => {
    const p = searchParams.get('tab') as StudioTabId | null;
    if (p && validTabs.includes(p) && p !== activeTab) setActiveTab(p);
    if (!p && activeTab !== 'documents') setActiveTab('documents');
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen bg-[#F4F5F7] overflow-hidden">
      <Helmet>
        <title>Studio — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD Studio — build quotes, contracts, safety documents and more." />
        <link rel="canonical" href="https://iwillbuild.com/studio" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Layers size={18} className="text-orange-500" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">IWILLBUILD Studio</h1>
                <p className="text-xs text-slate-500">Build documents, forms and packs for your jobs</p>
              </div>
            </div>

            {activeTab === 'documents' && (
              <button
                onClick={() => navigate('/studio/builder/new')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors flex-shrink-0"
              >
                <Plus size={15} />
                New document
              </button>
            )}
          </div>
        </div>

        {/* ── Top-level tab bar ── */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6">
          <div className="flex gap-0.5 py-2">
            {STUDIO_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={[
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === id
                    ? 'bg-orange-50 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                ].join(' ')}
              >
                <Icon size={14} className={activeTab === id ? 'text-primary' : 'text-muted-foreground'} />
                {label}
                {activeTab === id && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'documents' && <DocumentsTab />}
          {activeTab === 'forms'     && <FormsContent />}
          {activeTab === 'library'   && <LibraryContent />}
          {activeTab === 'safety'    && <SafetyContent />}
        </div>
      </div>
    </div>
  );
}
