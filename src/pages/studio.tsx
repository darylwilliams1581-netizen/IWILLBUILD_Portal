import { studio } from 'virtual:content';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Layers, FileText, HardHat, ShieldCheck, Calculator,
  ClipboardList, Truck, Users, BarChart2, Wrench,
  Package, Map, Camera, BookOpen, Zap, Star,
  ChevronRight, Plus, Clock, CheckCircle2, Lock,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

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

// ── Module definitions ────────────────────────────────────────────────────────

const MODULES: StudioModule[] = [
  // Documents & Contracts
  { id: 'quote-builder',       label: 'Quote Builder',         description: 'Professional quotes with line items, markup and GST',         icon: Calculator,    status: 'coming_soon', category: 'Documents',  color: '#f97316' },
  { id: 'contract-builder',    label: 'Contract Builder',      description: 'Build and send contracts with e-signature ready blocks',       icon: FileText,      status: 'coming_soon', category: 'Documents',  color: '#f97316' },
  { id: 'variation-order',     label: 'Variation Orders',      description: 'Scope change documentation with approval workflow',            icon: ClipboardList, status: 'coming_soon', category: 'Documents',  color: '#f97316' },
  { id: 'progress-claim',      label: 'Progress Claims',       description: 'Milestone-based payment claims tied to job stages',            icon: BarChart2,     status: 'coming_soon', category: 'Documents',  color: '#f97316' },
  // Safety
  { id: 'swms-builder',        label: 'SWMS Builder',          description: 'Safe Work Method Statements with hazard and control blocks',   icon: ShieldCheck,   status: 'coming_soon', category: 'Safety',     color: '#10b981' },
  { id: 'site-safety-plan',    label: 'Site Safety Plan',      description: 'Full project safety plan with emergency and induction info',   icon: HardHat,       status: 'coming_soon', category: 'Safety',     color: '#10b981' },
  { id: 'incident-report',     label: 'Incident Report',       description: 'Structured incident capture with photo attachments',           icon: Camera,        status: 'coming_soon', category: 'Safety',     color: '#10b981' },
  { id: 'toolbox-talk',        label: 'Toolbox Talk',          description: 'Pre-start meeting templates with sign-off capture',            icon: Users,         status: 'coming_soon', category: 'Safety',     color: '#10b981' },
  // Site & Planning
  { id: 'site-plan',           label: 'Site Plan',             description: 'Annotated site layout with zones, access and services',        icon: Map,           status: 'coming_soon', category: 'Planning',   color: '#6366f1' },
  { id: 'project-schedule',    label: 'Project Schedule',      description: 'Gantt-style milestone and task planner per job',               icon: Clock,         status: 'coming_soon', category: 'Planning',   color: '#6366f1' },
  { id: 'material-schedule',   label: 'Material Schedule',     description: 'Structured materials list with quantities and suppliers',       icon: Package,       status: 'coming_soon', category: 'Planning',   color: '#6366f1' },
  { id: 'subcontractor-pack',  label: 'Subcontractor Pack',    description: 'Scope, conditions and induction pack for subbies',             icon: Wrench,        status: 'coming_soon', category: 'Planning',   color: '#6366f1' },
  // Fleet & Equipment
  { id: 'plant-register',      label: 'Plant Register',        description: 'Asset register with service history and compliance status',    icon: Truck,         status: 'coming_soon', category: 'Fleet',      color: '#0ea5e9' },
  { id: 'pre-start-check',     label: 'Pre-Start Checklist',   description: 'Daily plant and vehicle pre-start inspection forms',           icon: CheckCircle2,  status: 'coming_soon', category: 'Fleet',      color: '#0ea5e9' },
  // Knowledge & Training
  { id: 'induction-pack',      label: 'Induction Pack',        description: 'Site induction with acknowledgement and sign-off',             icon: BookOpen,      status: 'coming_soon', category: 'Training',   color: '#a855f7' },
  { id: 'procedure-library',   label: 'Procedure Library',     description: 'Standard operating procedures and work instructions',          icon: Layers,        status: 'coming_soon', category: 'Training',   color: '#a855f7' },
  // Custom
  { id: 'custom-document',     label: 'Custom Document',       description: 'Start from a blank canvas with any block combination',         icon: Zap,           status: 'available',   category: 'Custom',     color: '#f97316' },
  { id: 'custom-form',         label: 'Custom Form',           description: 'Build data-capture forms with conditional logic',              icon: Star,          status: 'available',   category: 'Custom',     color: '#f97316' },
  // Locked (future plans)
  { id: 'tender-pack',         label: 'Tender Pack',           description: 'Full tender submission package — Business plan and above',     icon: FileText,      status: 'locked',      category: 'Documents',  color: '#94a3b8' },
  { id: 'handover-pack',       label: 'Handover Pack',         description: 'Project completion and handover documentation',                icon: CheckCircle2,  status: 'locked',      category: 'Documents',  color: '#94a3b8' },
];

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
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/30">
      <Lock size={9} />
      Plan upgrade
    </span>
  );
}

// ── Module card ───────────────────────────────────────────────────────────────

function ModuleCard({ mod, index }: { mod: StudioModule; index: number }) {
  const navigate = useNavigate();
  const Icon = mod.icon;
  const isAvailable = mod.status === 'available';
  const isLocked = mod.status === 'locked';

  function handleClick() {
    if (isAvailable) {
      navigate(`/studio/builder/new?type=${mod.id}`);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: 'easeOut' }}
      onClick={handleClick}
      className={[
        'group relative flex flex-col gap-3 rounded-xl border p-4 transition-all duration-200',
        isAvailable
          ? 'border-slate-700/60 bg-slate-800/60 hover:border-orange-500/50 hover:bg-slate-800 cursor-pointer hover:shadow-lg hover:shadow-orange-500/5'
          : isLocked
          ? 'border-slate-700/30 bg-slate-800/30 opacity-50 cursor-not-allowed'
          : 'border-slate-700/50 bg-slate-800/50 cursor-default',
      ].join(' ')}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${mod.color}18`, border: `1px solid ${mod.color}30` }}
      >
        <Icon size={18} style={{ color: isLocked ? '#64748b' : mod.color }} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className={`text-sm font-semibold leading-tight ${isLocked ? 'text-slate-500' : 'text-slate-100'}`}>
            {mod.label}
          </h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{mod.description}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <StatusBadge status={mod.status} />
        {isAvailable && (
          <ChevronRight size={14} className="text-slate-600 group-hover:text-orange-400 transition-colors" />
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
    <div className="flex h-screen bg-slate-900 overflow-hidden">
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
        <div className="flex-shrink-0 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
                <Layers size={18} className="text-orange-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-100 leading-tight">IWILLBUILD Studio</h1>
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
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span><span className="text-slate-200 font-semibold">{availableCount}</span> ready now</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              <span><span className="text-slate-200 font-semibold">{comingSoonCount}</span> coming soon</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
              <span><span className="text-slate-200 font-semibold">{MODULES.length}</span> total modules</span>
            </div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-slate-700/30 flex items-center gap-2 overflow-x-auto">
          {studio.CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                activeCategory === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700',
              ].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Module grid */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((mod, i) => (
              <ModuleCard key={mod.id} mod={mod} index={i} />
            ))}
          </div>

          {/* Recent documents placeholder */}
          <div className="mt-8 mb-2">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Recent documents</h2>
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-8 text-center">
              <Layers size={28} className="text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No documents yet</p>
              <p className="text-xs text-slate-600 mt-1">Documents you create will appear here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
