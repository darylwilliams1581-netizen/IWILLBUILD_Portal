import { Helmet } from '@dr.pogodin/react-helmet';
import { ClipboardList, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import PortalSidebar from '@/components/PortalSidebar';
import TakeoffPad from '@/components/estimating/TakeoffPad';

export default function TakeoffPadPage() {
  const navigate = useNavigate();
  return (
    <div className="portal-page">
      <Helmet>
        <title>Take-off Pad — IWILLBUILD</title>
        <meta name="description" content="Voice and manual quantity take-off pad for construction estimating." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/takeoff-pad" />
      </Helmet>

      {/* Shared portal chrome */}
      <PortalSidebar />

      {/* Content area — portal-content handles sidebar + topbar offsets */}
      <div className="portal-content">
        {/* Mobile back button — hidden on desktop where sidebar handles navigation */}
        <button
          onClick={() => navigate('/?page=2')}
          className="lg:hidden flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-4 -mt-1 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-600/20 flex items-center justify-center shrink-0">
            <ClipboardList size={18} className="text-violet-600" />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium leading-tight">Estimating</p>
            <h1 className="text-foreground font-bold text-xl leading-tight">Take-off Pad</h1>
          </div>
        </div>

        {/* Tool */}
        <div className="max-w-3xl w-full mx-auto">
          <TakeoffPad />
        </div>
      </div>
    </div>
  );
}
