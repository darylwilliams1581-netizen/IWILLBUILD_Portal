import { studio } from 'virtual:content';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Layers, Plus, Lock, Copy, Share2, Printer, FileDown, FileOutput, Pencil,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

// ── Content fallbacks ─────────────────────────────────────────────────────────
const studioCategories: string[] = Array.isArray(studio?.CATEGORIES) && studio.CATEGORIES.length > 0
  ? studio.CATEGORIES
  : ['All', 'Documents', 'Safety', 'Planning', 'Fleet', 'Training', 'Custom'];

// ── Types ─────────────────────────────────────────────────────────────────────

type ModuleStatus = 'available' | 'coming_soon' | 'locked';

interface StudioModule {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  status: ModuleStatus;
  category: string;
  color: string;
}

// ── Module definitions — populated from library by developer ─────────────────
const MODULES: StudioModule[] = [];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ModuleStatus }) {
  if (status === 'available') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Active
      </span>
    );
  }
  if (status === 'coming_soon') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
        Coming soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      <Lock size={9} />
      Locked
    </span>
  );
}

// ── Toolbar icon button ───────────────────────────────────────────────────────

function ToolBtn({
  icon: Icon, label, onClick, className = '',
}: {
  icon: React.ElementType; label: string; onClick?: (e: React.MouseEvent) => void; className?: string;
}) {
  return (
    <button
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      className={`p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0 ${className}`}
    >
      <Icon size={14} />
    </button>
  );
}

// ── Module tile — reference layout ────────────────────────────────────────────
// Layout mirrors the reference: status badge + rev label | bold title + description | icon toolbar

function ModuleTile({ mod, index }: { mod: StudioModule; index: number }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const isAvailable = mod.status === 'available';
  const isLocked = mod.status === 'locked';

  function openDoc() {
    if (!isAvailable) return;
    if (mod.id === 'asset-manager') { navigate('/studio/asset-manager'); return; }
    if (mod.id === 'plan-manager')  { navigate('/plan-manager'); return; }
    navigate(`/studio/builder/new?type=${mod.id}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: index * 0.02, ease: 'easeOut' }}
      className={[
        'group rounded-xl border bg-white transition-all duration-150 overflow-hidden',
        isAvailable ? 'border-border hover:border-primary/40 hover:shadow-sm' : '',
        isLocked ? 'border-border opacity-50' : '',
        !isAvailable && !isLocked ? 'border-border' : '',
      ].join(' ')}
    >
      {/* ── Main row ── */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${isAvailable ? 'cursor-pointer' : isLocked ? 'cursor-not-allowed' : 'cursor-default'}`}
        onClick={openDoc}
      >
        {/* Left: status badge + revision */}
        <div className="flex items-center gap-2 flex-shrink-0 w-36">
          <StatusBadge status={mod.status} />
          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Rev 1</span>
        </div>

        {/* Centre: title + description */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight ${isLocked ? 'text-slate-400' : 'text-slate-800'}`}>
            {mod.label}
          </p>
          <p className="text-xs text-slate-500 truncate mt-0.5 hidden sm:block">{mod.description}</p>
        </div>

        {/* Right: action toolbar — visible on hover (or always on touch) */}
        <div
          className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <ToolBtn icon={Copy}       label="Duplicate" />
          <ToolBtn icon={Share2}     label="Share" />
          <ToolBtn icon={Printer}    label="Print" />
          <ToolBtn icon={FileDown}   label="Export PDF" />
          <ToolBtn icon={FileOutput} label="Export DOCX" />
          <ToolBtn icon={Pencil}     label="Edit" onClick={openDoc} className="hover:text-orange-500" />
          <button
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
          >
            <ChevronDown size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Fallback chevron when toolbar is hidden (non-hover) */}
        {isAvailable && (
          <ChevronRight size={14} className="text-slate-300 group-hover:opacity-0 transition-opacity flex-shrink-0 -ml-1" />
        )}
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 flex flex-col gap-2">
          <p className="text-xs text-slate-600">{mod.description}</p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400">Category: <span className="text-slate-600 font-medium">{mod.category}</span></span>
          </div>
          {isAvailable && (
            <button
              onClick={openDoc}
              className="self-start mt-1 flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Pencil size={11} />
              Open in builder
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const navigate = useNavigate();

  const filtered = MODULES.filter(
    (m) => activeCategory === 'All' || m.category === activeCategory
  );

  const availableCount = MODULES.filter((m) => m.status === 'available').length;
  const comingSoonCount = MODULES.filter((m) => m.status === 'coming_soon').length;

  return (
    <div className="flex h-screen bg-[#F4F5F7] overflow-hidden">
      <Helmet>
        <title>Studio — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD Studio — build quotes, contracts, safety documents and more." />
        <link rel="canonical" href="https://iwillbuild.com/studio" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Layers size={18} className="text-orange-500" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">IWILLBUILD Studio</h1>
                <p className="text-xs text-slate-500">Build documents, forms and packs for your jobs</p>
              </div>
            </div>

            <button
              onClick={() => navigate('/studio/builder/new')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
            >
              <Plus size={15} />
              New document
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span><span className="text-slate-700 font-semibold">{availableCount}</span> ready now</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              <span><span className="text-slate-700 font-semibold">{comingSoonCount}</span> coming soon</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
              <span><span className="text-slate-700 font-semibold">{MODULES.length}</span> total modules</span>
            </div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto">
          {studioCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                activeCategory === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200',
              ].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Module list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
                <Layers size={22} className="text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No templates yet</p>
              <p className="text-xs text-slate-400 mt-1">Templates will appear here once loaded from the library</p>
            </div>
          ) : (
            <motion.div
              variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-2"
            >
              {filtered.map((mod, i) => (
                <ModuleTile key={mod.id} mod={mod} index={i} />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
