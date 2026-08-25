import { Helmet } from '@dr.pogodin/react-helmet';
import { Calculator, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import PortalSidebar from '@/components/PortalSidebar';
import BuildersCalc from '@/components/estimating/BuildersCalc';

export default function BuildersCalcPage() {
  const navigate = useNavigate();
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
            <Calculator size={18} className="text-violet-600" />
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium leading-tight">Estimating</p>
            <h1 className="text-foreground font-bold text-xl leading-tight">Builders Calc</h1>
          </div>
        </div>

        {/* Tool */}
        <div className="max-w-4xl w-full mx-auto">
          <BuildersCalc />
        </div>
      </div>
    </div>
  );
}
