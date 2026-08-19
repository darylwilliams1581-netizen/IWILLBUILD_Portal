import { Helmet } from '@dr.pogodin/react-helmet';
import { ClipboardList } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import DesktopDock from '@/components/DesktopDock';
import TakeoffPad from '@/components/estimating/TakeoffPad';

export default function TakeoffPadPage() {
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
      <DesktopDock />

      {/* Content area — portal-content handles sidebar + topbar offsets */}
      <div className="portal-content">
        {/* Page header */}
        <div className="op-page-header mb-6">
          <ClipboardList size={14} className="text-primary shrink-0" />
          <h1 className="op-page-title flex-1 min-w-0">Take-off Pad</h1>
        </div>

        {/* Tool */}
        <div className="max-w-3xl w-full mx-auto">
          <TakeoffPad />
        </div>
      </div>
    </div>
  );
}
