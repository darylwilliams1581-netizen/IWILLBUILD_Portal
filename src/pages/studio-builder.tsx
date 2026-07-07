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

// Map URL ?type= param → StudioDocumentType + default name
const TYPE_MAP: Record<string, { type: StudioDocumentType; name: string }> = {
  'quote-builder':       { type: 'quote_scope',       name: 'New Quote'              },
  'contract-builder':    { type: 'custom',             name: 'New Contract'           },
  'variation-order':     { type: 'custom',             name: 'New Variation Order'    },
  'progress-claim':      { type: 'custom',             name: 'New Progress Claim'     },
  'swms-builder':        { type: 'swms',               name: 'New SWMS'               },
  'site-safety-plan':    { type: 'safety_plan',        name: 'New Site Safety Plan'   },
  'incident-report':     { type: 'custom',             name: 'New Incident Report'    },
  'toolbox-talk':        { type: 'toolbox_talk',       name: 'New Toolbox Talk'       },
  'site-plan':           { type: 'custom',             name: 'New Site Plan'          },
  'project-schedule':    { type: 'custom',             name: 'New Project Schedule'   },
  'material-schedule':   { type: 'custom',             name: 'New Material Schedule'  },
  'subcontractor-pack':  { type: 'custom',             name: 'New Subcontractor Pack' },
  'plant-register':      { type: 'register',           name: 'New Plant Register'     },
  'pre-start-check':     { type: 'pre_start',          name: 'New Pre-Start Check'    },
  'induction-pack':      { type: 'custom',             name: 'New Induction Pack'     },
  'procedure-library':   { type: 'procedure',          name: 'New Procedure'          },
  'custom-document':     { type: 'custom',             name: 'New Document'           },
  'custom-form':         { type: 'user_form',          name: 'New Form'               },
  'tender-pack':         { type: 'custom',             name: 'New Tender Pack'        },
  'handover-pack':       { type: 'handover',           name: 'New Handover Pack'      },
};

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

  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  // Load existing template
  useEffect(() => {
    if (isNew) return;
    const numId = Number(id);
    if (!numId) { setError('Invalid document ID'); setLoading(false); return; }

    setLoading(true);
    fetch(`/api/document-templates/${numId}`)
      .then((r) => r.json() as Promise<TemplateResponse & { error?: string }>)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTemplate(data.template);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load document'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function handleClose() {
    navigate('/studio');
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
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
        <Helmet>
          <title>Loading — IWILLBUILD Studio</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-orange-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading document…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
        <Helmet>
          <title>Error — IWILLBUILD Studio</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertCircle size={22} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-200 mb-1">Could not load document</h1>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition-colors"
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
      />
      <JobContextTab />
    </>
  );
}
