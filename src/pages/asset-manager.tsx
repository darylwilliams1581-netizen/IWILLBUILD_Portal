/**
 * /studio/asset-manager — Equipment Manager
 */
import { useState, useEffect, Suspense } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Wrench, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AMAssetsTab from '@/components/AssetManager/AMAssetsTab';
import EquipmentDetailPanel from '@/components/AssetManager/EquipmentDetailPanel';

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 size={20} className="animate-spin mr-2" /> Loading...
    </div>
  );
}

export default function AssetManagerPage() {
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const id = searchParams.get('assetId');
    if (id) {
      const parsed = parseInt(id, 10);
      if (!isNaN(parsed)) setSelectedAssetId(parsed);
    }
  }, [searchParams]);

  // Run migration on mount to ensure new columns exist
  useEffect(() => {
    fetch('/api/migrate-asset-manager', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <div className="portal-page">
      <Helmet>
        <title>Equipment Manager — IWILLBUILD</title>
        <meta name="description" content="Manage equipment, tools, plant, safety gear and hire items." />
        <link rel="canonical" href="https://iwillbuild.com/studio/asset-manager" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="portal-main">

        {selectedAssetId !== null ? (
          <Suspense fallback={<TabFallback />}>
            <EquipmentDetailPanel
              assetId={selectedAssetId}
              onBack={() => setSelectedAssetId(null)}
            />
          </Suspense>
        ) : (
          <>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4 md:px-6 py-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/home')}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Back to Home"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-600/20 flex items-center justify-center shrink-0">
                  <Wrench size={18} className="text-violet-600" />
                </div>
                <div>
                  <h1 className="text-base md:text-lg font-bold text-slate-900 leading-tight">Equipment Manager</h1>
                  <p className="text-xs text-slate-500 hidden sm:block">Tools, plant, safety gear and hire items</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<TabFallback />}>
                <AMAssetsTab onSelectAsset={setSelectedAssetId} />
              </Suspense>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
