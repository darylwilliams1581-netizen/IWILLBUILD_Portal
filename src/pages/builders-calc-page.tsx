import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ChevronLeft } from 'lucide-react';
import BuildersCalc from '@/components/estimating/BuildersCalc';

export default function BuildersCalcPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>Builders Calc — IWILLBUILD</title>
        <meta name="description" content="Construction calculators for areas, volumes, materials and more. Part of the IWILLBUILD construction management platform for Australian tradies." />
        <meta name="robots" content="noindex" />
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
      <h1 className="sr-only">Builders Calc</h1>

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4 shrink-0" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/home')}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-gray-400 text-xs font-medium leading-tight">Estimating</p>
            <p className="text-gray-900 font-bold text-xl leading-tight">Builders Calc</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl w-full mx-auto">
          <BuildersCalc />
        </div>
      </div>
    </div>
  );
}
