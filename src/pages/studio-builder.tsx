/**
 * Studio Builder Page — /studio/builder/:id
 *
 * Mounts the DocumentBuilder for a specific template (edit) or a new
 * document (create). Handles loading state, error state, and navigation
 * back to /studio on close/save.
 */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle } from 'lucide-react';
import DocumentBuilder from '@/components/DocumentBuilder';
import JobContextTab from '@/components/JobContextTab';
import type { DocumentTemplate, StudioDocumentType } from '@/components/DocumentBuilder/types';
import { DOC_KIND_ACKNOWLEDGEMENT_TYPES, DEFAULT_DOC_KIND_SETTINGS } from '@/components/DocumentBuilder/types';

// ── TYPE_MAP — Doc Studio only (no form types — those belong in /studio/forms) ─
const TYPE_MAP: Record<string, { type: StudioDocumentType; name: string }> = {
  'quote-builder':       { type: 'quote_scope',  name: 'New Quote'              },
  'contract-builder':    { type: 'custom',        name: 'New Contract'           },
  'variation-order':     { type: 'custom',        name: 'New Variation Order'    },
  'progress-claim':      { type: 'custom',        name: 'New Progress Claim'     },
  'swms-builder':        { type: 'swms',          name: 'New SWMS'               },
  'site-safety-plan':    { type: 'safety_plan',   name: 'New Site Safety Plan'   },
  'incident-report':     { type: 'custom',        name: 'New Incident Report'    },
  'toolbox-talk':        { type: 'toolbox_talk',  name: 'New Toolbox Talk'       },
  'site-plan':           { type: 'custom',        name: 'New Site Plan'          },
  'project-schedule':    { type: 'custom',        name: 'New Project Schedule'   },
  'material-schedule':   { type: 'custom',        name: 'New Material Schedule'  },
  'subcontractor-pack':  { type: 'custom',        name: 'New Subcontractor Pack' },
  'induction-pack':      { type: 'custom',        name: 'New Induction Pack'     },
  'procedure-library':   { type: 'procedure',     name: 'New Procedure'          },
  'custom-document':     { type: 'custom',        name: 'New Document'           },
  'tender-pack':         { type: 'custom',        name: 'New Tender Pack'        },
  'handover-pack':       { type: 'handover',      name: 'New Handover Pack'      },
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
    acknowledgementText: needsSignOn ? DEFAULT_DOC_KIND_SETTINGS.acknowledgementText : '',
  };
}

interface TemplateResponse {
  template: DocumentTemplate;
}

export default function StudioBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isNew = id === 'new';
  const docTypeParam = searchParams.get('type') ?? 'custom-document';
  const mapped = TYPE_MAP[docTypeParam] ?? { type: 'custom' as StudioDocumentType, name: 'New Document' };

  // ?mode=use opens directly in Use Mode (fill/complete); default is Build Mode
  const initialMode = searchParams.get('mode') === 'use' ? 'use' : 'build';

  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  // Load existing template
  useEffect(() => {
    if (isNew) return;
    const numId = Number(id);
    if (!numId) { setError('Invalid document ID'); setLoading(false); return; }

    setLoading(true);
    fetch(`/api/document-templates/${numId}`, { credentials: 'include' })
      .then((r) => r.json() as Promise<TemplateResponse & { error?: string }>)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTemplate(data.template);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load document'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function handleClose() {
    navigate('/studio/documents');
  }

  function handleSaved(savedId: number) {
    // If we just created a new doc, update the URL to the real ID
    if (isNew) {
      navigate(`/studio/builder/${savedId}`, { replace: true });
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#F4F5F7] flex items-center justify-center z-50">
        <Helmet>
          <title>Loading — IWILLBUILD Studio</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-orange-500 animate-spin" />
          <p className="text-sm text-slate-500">Loading document…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 bg-[#F4F5F7] flex items-center justify-center z-50">
        <Helmet>
          <title>Error — IWILLBUILD Studio</title>
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
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
          >
            Back to Studio
          </button>
        </div>
      </div>
    );
  }

  // ── Builder ────────────────────────────────────────────────────────────────
  // For new docs, pass null — DocumentBuilder calls resetToBlank internally.
  // We pass the desired name + type via a synthetic minimal template for new docs.
  const templateToLoad: DocumentTemplate | null = isNew
    ? {
        name: mapped.name,
        templateType: mapped.type,
        pageLayout: { paperSize: 'A4', orientation: 'portrait', margins: 'standard' },
        theme: {
          backgroundColor: '#ffffff',
          accentColor: '#f97316',
          textColor: '#1e293b',
          tableHeaderColor: '#1e293b',
          tableHeaderTextColor: '#ffffff',
        },
        blocks: [],
        systemFields: [],
        sourceAttachments: [],
        // Apply kind defaults based on template type
        ...defaultKindForType(mapped.type),
      }
    : template;

  return (
    <>
      <Helmet>
        <title>
          {isNew ? `New ${mapped.name}` : (template?.name ?? 'Document')} — IWILLBUILD Studio
        </title>
        <meta name="description" content="Build and edit documents in IWILLBUILD Studio." />
        <link rel="canonical" href="https://iwillbuild.com/studio/builder" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <DocumentBuilder
        template={templateToLoad}
        onClose={handleClose}
        onSaved={handleSaved}
        initialMode={initialMode}
      />
      <JobContextTab />
    </>
  );
}
