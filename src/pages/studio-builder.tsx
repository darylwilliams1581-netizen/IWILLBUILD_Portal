/**
 * Studio Builder Page — /studio/builder/:id
 *
 * Mounts the DocumentBuilder for a specific template (edit) or a new
 * document (create). Handles loading state, error state, and navigation
 * back to /studio on close/save.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import DocumentBuilder from '@/components/DocumentBuilder';
import JobContextTab from '@/components/JobContextTab';
import DazzaBuilderAssistant from '@/components/DazzaBuilderAssistant';
import { buildDocumentBuilderContext, buildDocumentBuilderContextFromTemplate } from '@/components/DazzaBuilderAssistant/DocumentBuilderAdapter';
import { useDocumentStore } from '@/components/DocumentBuilder/useDocumentStore';
import type { DocumentTemplate, StudioDocumentType } from '@/components/DocumentBuilder/types';
import { DOC_KIND_ACKNOWLEDGEMENT_TYPES, DEFAULT_DOC_KIND_SETTINGS } from '@/components/DocumentBuilder/types';

// ── TYPE_MAP — Doc Studio only (no form types — those belong in /studio/forms) ─
const TYPE_MAP: Record<string, {
  type: StudioDocumentType;
  name: string;
}> = {
  'quote-builder': {
    type: 'quote_scope',
    name: 'New Quote'
  },
  'contract-builder': {
    type: 'custom',
    name: 'New Contract'
  },
  'variation-order': {
    type: 'custom',
    name: 'New Variation Order'
  },
  'progress-claim': {
    type: 'custom',
    name: 'New Progress Claim'
  },
  'swms-builder': {
    type: 'swms',
    name: 'New SWMS'
  },
  'site-safety-plan': {
    type: 'safety_plan',
    name: 'New Site Safety Plan'
  },
  'incident-report': {
    type: 'custom',
    name: 'New Incident Report'
  },
  'toolbox-talk': {
    type: 'toolbox_talk',
    name: 'New Toolbox Talk'
  },
  'site-plan': {
    type: 'custom',
    name: 'New Site Plan'
  },
  'project-schedule': {
    type: 'custom',
    name: 'New Project Schedule'
  },
  'material-schedule': {
    type: 'custom',
    name: 'New Material Schedule'
  },
  'subcontractor-pack': {
    type: 'custom',
    name: 'New Subcontractor Pack'
  },
  'induction-pack': {
    type: 'custom',
    name: 'New Induction Pack'
  },
  'procedure-library': {
    type: 'procedure',
    name: 'New Procedure'
  },
  'custom-document': {
    type: 'custom',
    name: 'New Document'
  },
  'tender-pack': {
    type: 'custom',
    name: 'New Tender Pack'
  },
  'handover-pack': {
    type: 'handover',
    name: 'New Handover Pack'
  }
  // Note: pre-start-check, plant-register, custom-form → /studio/forms
};

/**
 * Doc Studio always creates kind=doc.
 * SWMS/Safety Plan/Policy/Procedure/Toolbox Talk default to requiresAcknowledgement=true.
 * All other doc types default to requiresAcknowledgement=false.
 */
function defaultKindForType(type: StudioDocumentType): Partial<DocumentTemplate> {
  const needsSignOn = DOC_KIND_ACKNOWLEDGEMENT_TYPES.includes(type);
  return {
    docKind: 'doc',
    requiresAcknowledgement: needsSignOn,
    acknowledgementLabel: needsSignOn ? DEFAULT_DOC_KIND_SETTINGS.acknowledgementLabel : '',
    acknowledgementText: needsSignOn ? DEFAULT_DOC_KIND_SETTINGS.acknowledgementText : ''
  };
}
interface TemplateResponse {
  template: DocumentTemplate;
}
export default function StudioBuilderPage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const docTypeParam = searchParams.get('type') ?? 'custom-document';
  const mapped = TYPE_MAP[docTypeParam] ?? {
    type: 'custom' as StudioDocumentType,
    name: 'New Document'
  };

  // ?mode=use opens directly in Use Mode (fill/complete); default is Build Mode
  const initialMode = searchParams.get('mode') === 'use' ? 'use' : 'build';

  // ?tab=layout (or any BuilderTab) opens that sidebar tab on first load
  const initialTab = (searchParams.get('tab') ?? undefined) as import('@/components/DocumentBuilder/types').BuilderTab | undefined;
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  // Dazza Builder Assistant state
  const [dazzaOpen, setDazzaOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(0);

  // ── Zustand store subscriptions (must be before any early return) ──────────
  // Use individual primitive selectors — object selectors create a new object
  // every render and cause an infinite update loop in Zustand.
  const storeTemplateId   = useDocumentStore(s => s.templateId);
  const storeTemplateName = useDocumentStore(s => s.templateName);
  const storeTemplateType = useDocumentStore(s => s.templateType);
  const storeBlocks       = useDocumentStore(s => s.blocks);
  const storeLogicRules   = useDocumentStore(s => s.logicRules);
  const storeIsDirty      = useDocumentStore(s => s.isDirty);
  const storePageLayout   = useDocumentStore(s => s.pageLayout);
  const storeDocKind      = useDocumentStore(s => s.docKind);
  const storeReqAck       = useDocumentStore(s => s.requiresAcknowledgement);
  const selectedBlockId   = useDocumentStore(s => s.selection?.blockId ?? null);

  const loadTemplate = useDocumentStore(s => s.loadTemplate);

  const handleDazzaApplied = useCallback((versionId: string, versionNumber: number) => {
    setCurrentVersion(versionNumber);
    // Reload the template from server so builder reflects applied changes.
    // Also call loadTemplate directly so the Zustand store updates immediately
    // (isDirty → false, blocks updated) without waiting for a second render cycle.
    if (!isNew && id) {
      const numId = Number(id);
      if (numId) {
        fetch(`/api/document-templates/${numId}`, { credentials: 'include' })
          .then(r => r.json())
          .then(data => {
            if (data.template) {
              setTemplate(data.template);
              // Update the store directly so blocks appear immediately and
              // isDirty/canUndo reflect the new state without a full remount.
              loadTemplate(data.template);
            }
          })
          .catch(() => {});
      }
    }
    void versionId;
  }, [isNew, id, loadTemplate]);

  // Load existing template
  useEffect(() => {
    if (isNew) return;
    const numId = Number(id);
    if (!numId) {
      setError('Invalid document ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/document-templates/${numId}`, {
      credentials: 'include'
    }).then(r => r.json() as Promise<TemplateResponse & {
      error?: string;
    }>).then(data => {
      if (data.error) throw new Error(data.error);
      setTemplate(data.template);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load document')).finally(() => setLoading(false));
  }, [id, isNew]);
  function handleClose() {
    navigate('/studio/documents');
  }
  function handleSaved(savedId: number) {
    // If we just created a new doc, update the URL to the real ID
    if (isNew) {
      navigate(`/studio/builder/${savedId}`, {
        replace: true
      });
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return <div className="fixed inset-0 bg-[#F4F5F7] flex items-center justify-center z-50">
        <Helmet>
          <title>Loading — IWIIlBUILD Studio</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-violet-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading document…</p>
        </div>
      </div>;
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return <div className="fixed inset-0 bg-[#F4F5F7] flex items-center justify-center z-50">
        <Helmet>
          <title>Error — IWIIlBUILD Studio</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 mb-1">Could not load document</h1>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
          <button onClick={handleClose} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">
            Back to Studio
          </button>
        </div>
      </div>;
  }

  // ── Builder ────────────────────────────────────────────────────────────────
  // For new docs, pass null — DocumentBuilder calls resetToBlank internally.
  // We pass the desired name + type via a synthetic minimal template for new docs.
  const templateToLoad: DocumentTemplate | null = isNew ? {
    name: mapped.name,
    templateType: mapped.type,
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
    blocks: [],
    systemFields: [],
    sourceAttachments: [],
    // Apply kind defaults based on template type
    ...defaultKindForType(mapped.type)
  } : template;

  // Build Dazza context from the live Zustand store so Dazza always sees the
  // current document state (blocks, templateId, isDirty, etc.).
  // Fall back to the static template snapshot only when the store hasn't
  // loaded yet (templateId is null and we have a real template to load).
  // canonicalTemplateId is always derived from the URL param — it is the
  // authoritative ID used for apply when the store hasn't populated yet.
  const canonicalTemplateId = isNew ? null : (Number(id) || null);
  const storeTemplateLoaded = storeTemplateId !== null || isNew;
  const storeSnapshot = {
    templateId:               storeTemplateId,
    templateName:             storeTemplateName,
    templateType:             storeTemplateType,
    blocks:                   storeBlocks,
    logicRules:               storeLogicRules ?? [],
    isDirty:                  storeIsDirty,
    mode:                     initialMode,
    pageLayout:               storePageLayout,
    docKind:                  storeDocKind ?? 'doc',
    requiresAcknowledgement:  storeReqAck ?? false,
  };
  const dazzaContext = storeTemplateLoaded
    ? buildDocumentBuilderContext(storeSnapshot, selectedBlockId, [], currentVersion, canonicalTemplateId)
    : buildDocumentBuilderContextFromTemplate(templateToLoad, currentVersion, canonicalTemplateId);

  return <>
      <Helmet>
        <title>
          {isNew ? `New ${mapped.name}` : template?.name ?? 'Document'} — IWIIlBUILD Studio
        </title>
        <meta name="description" content="Build and edit documents in IWIIlBUILD Studio." />
        <link rel="canonical" href="https://iwillbuild.com/studio/builder" />
        <meta name="robots" content="noindex" />
      </Helmet>
      {/* Flex wrapper so sidebar can resize the builder workspace */}
      <div className="flex h-screen w-screen overflow-hidden">
        <div className={`flex-1 min-w-0 overflow-hidden transition-all duration-200`}>
          <DocumentBuilder template={templateToLoad} onClose={handleClose} onSaved={handleSaved} initialMode={initialMode} initialTab={initialTab} sidebarWidth={dazzaOpen ? 380 : 0} />
        </div>
        <div className="relative z-[60] shrink-0">
          <DazzaBuilderAssistant
            builderContext={dazzaContext}
            onApplied={handleDazzaApplied}
            onOpenChange={setDazzaOpen}
          />
        </div>
      </div>
      <JobContextTab />
    </>;
}
