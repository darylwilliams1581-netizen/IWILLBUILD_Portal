/**
 * /studio — Document template list + Safety tab
 * Row layout: status badge + rev | bold title + type | icon toolbar
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Layers, Plus, Lock, Copy, Share2, Pencil, PlayCircle, ChevronDown, AlertTriangle, Trash2, X, ShieldCheck, ArrowLeft, FileUp } from 'lucide-react';
import DocxImporter from '@/components/DocumentBuilder/DocxImporter';
import type { DocumentBlock } from '@/components/DocumentBuilder/types';
import { toast } from 'sonner';
import { AnimatePresence } from 'motion/react';
import { usePermissions } from '@/lib/usePermissions';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';

// Tab content — lazy-imported to keep bundle lean
import SafetyContent from '@/components/safety/SafetyContent';

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
  custom: 'Custom'
};
const TYPE_COLORS: Record<string, string> = {
  swms: 'bg-red-100 text-red-700 border-red-200',
  policy: 'bg-blue-100 text-blue-700 border-blue-200',
  procedure: 'bg-purple-100 text-purple-700 border-purple-200',
  form: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  contract: 'bg-amber-100 text-amber-700 border-amber-200',
  quote: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  report: 'bg-violet-100 text-violet-800 border-violet-200',
  induction: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  custom: 'bg-slate-100 text-slate-600 border-slate-200'
};

// ── Top-level studio tabs ─────────────────────────────────────────────────────

const STUDIO_TABS = [{
  id: 'safety',
  label: 'Safety',
  icon: ShieldCheck
}] as const;
type StudioTabId = typeof STUDIO_TABS[number]['id'];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Toolbar icon button ───────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    isPlatformOwner
  } = usePermissions();

  // Read tab from ?tab= query param so direct links and sidebar work
  const tabParam = searchParams.get('tab');
  const validTabs: StudioTabId[] = ['safety'];
  const [activeTab, setActiveTab] = useState<StudioTabId>(validTabs.includes(tabParam as StudioTabId) ? tabParam as StudioTabId : 'safety');
  function switchTab(id: StudioTabId) {
    setActiveTab(id);
    setSearchParams(id === 'safety' ? {} : {
      tab: id
    }, {
      replace: true
    });
  }

  // Sync if URL param changes externally (e.g. sidebar link)
  useEffect(() => {
    const p = searchParams.get('tab') as StudioTabId | null;
    if (p && validTabs.includes(p) && p !== activeTab) setActiveTab(p);
    if (!p && activeTab !== 'safety') setActiveTab('safety');
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Import DOCX/PDF from Studio page ─────────────────────────────────────
  const [showImporter, setShowImporter] = useState(false);
  // Pre-created template ID so DocxImporter can POST to the parse endpoint immediately
  const [importTemplateId, setImportTemplateId] = useState<number | null>(null);
  const handleOpenImporter = useCallback(async () => {
    // Create a blank placeholder template first so the parse endpoint has a valid ID
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
          pageLayout: {
            paperSize: 'A4',
            orientation: 'portrait',
            margins: 'standard'
          },
          theme: {
            backgroundColor: '#ffffff',
            accentColor: '#7c3aed',
            textColor: '#1e293b',
            tableHeaderColor: '#1e293b',
            tableHeaderTextColor: '#ffffff'
          },
          systemFields: [],
          sourceAttachments: []
        })
      });
      const data = (await res.json()) as {
        id?: number;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Could not create document');
      setImportTemplateId(data.id!);
      setShowImporter(true);
    } catch (e) {
      toast.error('Could not start import: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  }, []);
  const handleStudioImported = useCallback(async (blocks: DocumentBlock[], docxName: string, templateId: number) => {
    // Update the placeholder template with the real name and parsed blocks
    try {
      const res = await fetch(`/api/document-templates/${templateId}`, {
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
      const data = (await res.json()) as {
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Save failed');
      navigate(`/studio/builder/${templateId}`);
    } catch (e) {
      // Even if rename fails, navigate to the builder — the content is already there
      navigate(`/studio/builder/${templateId}`);
    }
  }, [navigate]);
  return <div className="flex flex-col flex-1 min-h-0 lg-portal">
      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Studio — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD Studio — build quotes, contracts, safety documents and more." />
        <link rel="canonical" href="https://iwillbuild.com/studio" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ── Sticky header — matches fleet/jobs pattern ── */}
      <header className="sticky top-0 z-30 h-12 bg-white border-b border-border flex items-center px-4 shrink-0 gap-2 safe-top">
        <button onClick={() => navigate('/home')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="Back to Home">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Home</span>
        </button>
        <span className="text-gray-300">|</span>
        <Layers size={17} className="text-primary shrink-0" />
        <h1 className="font-heading font-bold text-base truncate flex-1">Studio</h1>

        {/* Action buttons — only on documents tab (now a separate page, but keep import for direct /studio access) */}
        {activeTab === 'safety' && <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => void handleOpenImporter()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors">
              <FileUp size={14} />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button onClick={() => navigate('/studio/builder/new')} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-700 text-white text-sm font-semibold transition-colors">
              <Plus size={15} />
              <span className="hidden sm:inline">New document</span>
            </button>
          </div>}
      </header>

      {/* ── Tab bar ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 md:px-6 overflow-x-auto">
        <div className="flex gap-0.5 py-2 min-w-max">
          {STUDIO_TABS.map(({
          id,
          label,
          icon: Icon
        }) => <button key={id} onClick={() => switchTab(id)} className={['flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap', activeTab === id ? 'bg-violet-50 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted'].join(' ')}>
              <Icon size={14} className={activeTab === id ? 'text-primary' : 'text-muted-foreground'} />
              {label}
              {activeTab === id && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
            </button>)}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className={`flex-1 min-h-0 overflow-hidden`}>
        {activeTab === 'safety' && <SafetyContent />}
      </div>

      {/* ── Import DOCX/PDF modal ── */}
      {showImporter && importTemplateId !== null && <DocxImporter templateId={importTemplateId} hasExistingBlocks={false} onClose={() => {
      setShowImporter(false);
      setImportTemplateId(null);
    }} onImported={(blocks, name) => {
      setShowImporter(false);
      void handleStudioImported(blocks, name, importTemplateId);
    }} onSaveFirst={async () => importTemplateId} />}
    </div>;
}
