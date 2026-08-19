import { Helmet } from '@dr.pogodin/react-helmet';
import { Calculator } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import DesktopDock from '@/components/DesktopDock';
import BuildersCalc from '@/components/estimating/BuildersCalc';

export default function BuildersCalcPage() {
  return (
    <div className="portal-page">
      <Helmet>
        <title>Builders Calc — IWILLBUILD</title>
        <meta name="description" content="Construction calculators for areas, volumes, materials and more. Part of the IWILLBUILD construction management platform for Australian tradies." />
        <link rel="canonical" href="https://iwillbuild.com/builders-calc" />
        <meta property="og:title" content="Builders Calc — IWILLBUILD" />
        <meta property="og:description" content="Construction calculators for areas, volumes, materials and more. Part of the IWILLBUILD construction management platform." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/builders-calc" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Builders Calc — IWILLBUILD" />
        <meta name="twitter:description" content="Construction calculators for areas, volumes, materials and more." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": "https://iwillbuild.com/builders-calc#webpage",
          "name": "Builders Calc — IWILLBUILD",
          "url": "https://iwillbuild.com/builders-calc",
          "description": "Construction calculators for areas, volumes, materials and more.",
          "isPartOf": { "@id": "https://iwillbuild.com/#website" },
          "about": { "@id": "https://iwillbuild.com/#organization" }
        })}</script>
      </Helmet>

      {/* Shared portal chrome */}
      <PortalSidebar />
      <DesktopDock />

      {/* Content area — portal-content handles sidebar + topbar offsets */}
      <div className="portal-content">
        {/* Page header */}
        <div className="op-page-header mb-6">
          <Calculator size={14} className="text-primary shrink-0" />
          <h1 className="op-page-title flex-1 min-w-0">Builders Calc</h1>
        </div>

        {/* Tool */}
        <div className="max-w-4xl w-full mx-auto">
          <BuildersCalc />
        </div>
      </div>
    </div>
  );
}
