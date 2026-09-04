import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, Image } from 'lucide-react';
import { PostersTab } from '@/pages/safety';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';

// NOTE: DesktopTopBar is intentionally NOT imported here.
// PortalSidebar renders DesktopTopBar internally (PortalSidebar.tsx line 715).
// Every portal page that renders <PortalSidebar /> already gets one DesktopTopBar.
// Adding a second import here would produce a visible duplicate at lg+ viewports.

export default function SafetyPostersPage() {
  const navigate = useNavigate();
  return <div className="flex flex-col flex-1 min-h-0">
      <Helmet>
        <title>Safety Posters — IWIllBUIlD</title>
        <meta name="description" content="IWIllBUIlD safety posters — generate and print job-linked safety posters." />
        <link rel="canonical" href="https://iwillbuild.com/safety/posters" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Desktop nav — PortalSidebar owns DesktopTopBar; DesktopDock is separate */}
      <PortalSidebar />
      <DesktopDock />

      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-30 h-12 bg-white border-b border-border flex items-center px-4 shrink-0 gap-2 safe-top">
        <button onClick={() => goBack(navigate, '/home')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="Back to Home">
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Home</span>
        </button>
        <span className="text-gray-300">|</span>
        <Image size={17} className="text-primary shrink-0" />
        <h1 className="font-heading font-bold text-base truncate flex-1">Safety Posters</h1>
      </header>

      {/* Posters content */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-0 lg-portal">
        <PostersTab />
      </div>
    </div>;
}
