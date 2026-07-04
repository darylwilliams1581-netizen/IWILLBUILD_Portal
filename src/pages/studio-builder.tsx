import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, Layers } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

export default function StudioBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const docType = searchParams.get('type') ?? 'custom-document';
  const isNew = id === 'new';

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <Helmet>
        <title>Studio Builder — IWILLBUILD</title>
        <meta name="description" content="Build and edit documents in IWILLBUILD Studio." />
        <link rel="canonical" href="https://iwillbuild.com/studio/builder" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/studio')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Studio
          </button>
          <div className="w-px h-5 bg-slate-700" />
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-orange-400" />
            <span className="text-sm font-semibold text-slate-200">
              {isNew ? 'New document' : `Document #${id}`}
            </span>
            {docType && docType !== 'custom-document' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20 capitalize">
                {docType.replace(/-/g, ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Canvas placeholder */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <Layers size={28} className="text-orange-400" />
            </div>
            <h1 className="text-lg font-bold text-slate-200 mb-2">Document Builder</h1>
            <p className="text-sm text-slate-500 max-w-xs">
              The full canvas builder is coming in Studio Phase 2. For now, use the Document Builder under Forms.
            </p>
            <button
              onClick={() => navigate('/forms')}
              className="mt-4 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
            >
              Go to Forms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
