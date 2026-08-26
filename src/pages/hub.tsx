/**
 * /hub — IWILLBUILD Application Hub
 *
 * Blank authenticated page. Hub modules will be added in a future stage.
 */
import { Helmet } from '@dr.pogodin/react-helmet';
import PortalSidebar from '@/components/PortalSidebar';

export default function HubPage() {
  return (
    <div className="portal-page">
      <PortalSidebar />
      <Helmet>
        <title>Hub — IWILLBUILD</title>
        <meta name="description" content="IWILLBUILD application hub." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/hub" />
      </Helmet>

      <div className="portal-main">
        {/* ── Desktop page header — sticks below the dock (112px) ── */}
        <header className="op-page-header hidden md:flex sticky top-[112px] z-20">
          <span className="op-page-title">IWILLBUILD Hub</span>
        </header>

        {/* ── Mobile header — sticks at top (no top dock on mobile) ── */}
        <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center px-4 shrink-0 sticky top-0 z-20 safe-top">
          <h1 className="font-heading font-bold text-base text-gray-900">IWILLBUILD Hub</h1>
        </header>

        {/* ── Blank content area ── */}
        <div className="flex-1 overflow-y-auto" />
      </div>
    </div>
  );
}
