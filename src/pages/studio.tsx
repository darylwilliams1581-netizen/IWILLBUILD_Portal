import { studio } from 'virtual:content';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Layers, ChevronRight, Plus, Lock, Building2,
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
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        Ready
      </span>
    );
  }
  if (status === 'coming_soon') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
        Coming soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      <Lock size={9} />
      Plan upgrade
    </span>
  );
}

// ── Module tile (compact row) ─────────────────────────────────────────────────

function ModuleTile({ mod, index }: { mod: StudioModule; index: number }) {
  const navigate = useNavigate();
  const Icon = mod.icon;
  const isAvailable = mod.status === 'available';
  const isLocked = mod.status === 'locked';

  function handleClick() {
    if (isAvailable) {
      if (mod.id === 'asset-manager') { navigate('/studio/asset-manager'); return; }
      if (mod.id === 'plan-manager')  { navigate('/plan-manager'); return; }
      navigate(`/studio/builder/new?type=${mod.id}`);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.02, ease: 'easeOut' }}
      onClick={handleClick}
      className={[
        'group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-150',
        isAvailable
          ? 'border-border bg-white hover:border-primary/40 hover:shadow-sm cursor-pointer'
          : isLocked
          ? 'border-border bg-slate-50 opacity-50 cursor-not-allowed'
          : 'border-border bg-white cursor-default',
      ].join(' ')}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${mod.color}15`, border: `1px solid ${mod.color}28` }}
      >
        <Icon size={15} style={{ color: isLocked ? '#94a3b8' : mod.color }} />
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span className={`text-sm font-semibold whitespace-nowrap ${isLocked ? 'text-slate-400' : 'text-slate-800'}`}>
          {mod.label}
        </span>
        <span className="text-xs text-muted-foreground truncate hidden sm:block">{mod.description}</span>
      </div>

      {/* Badge + chevron */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={mod.status} />
        {isAvailable && (
          <ChevronRight size={14} className="text-slate-300 group-hover:text-primary transition-colors" />
        )}
      </div>
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
