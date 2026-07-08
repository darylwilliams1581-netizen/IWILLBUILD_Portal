import { asset_manager } from 'virtual:content';
/**
 * /studio/asset-manager — Asset Manager module
 * Tabs: Assets | Inspections | Defects | Tenders/Quotes | Monitoring | Induction & Completion Docs | Shared Reports
 */
import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Building2, ClipboardCheck, AlertTriangle, FileText,
  Activity, BookOpen, Share2, ChevronLeft, Menu,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PortalSidebar from '@/components/PortalSidebar';
import AMAssetsTab from '@/components/AssetManager/AMAssetsTab';
import AMInspectionsTab from '@/components/AssetManager/AMInspectionsTab';
import AMDefectsTab from '@/components/AssetManager/AMDefectsTab';
import AMTendersTab from '@/components/AssetManager/AMTendersTab';
import AMMonitoringTab from '@/components/AssetManager/AMMonitoringTab';
import AMCloseoutTab from '@/components/AssetManager/AMCloseoutTab';
import AMSharedReportsTab from '@/components/AssetManager/AMSharedReportsTab';
import AssetDetailPanel from '@/components/AssetManager/AssetDetailPanel';

type Tab = 'assets' | 'inspections' | 'defects' | 'tenders' | 'monitoring' | 'closeout' | 'shared';

const TABSMeta = [
  {
    icon: Building2
  },
  {
    icon: ClipboardCheck
  },
  {
    icon: AlertTriangle
  },
  {
    icon: FileText
  },
  {
    icon: Activity
  },
  {
    icon: BookOpen
  },
  {
    icon: Share2
  },
];

export default function AssetManagerPage() {
  const [tab, setTab] = useState<Tab>('assets');
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Support ?assetId= deep-link (from the old redirect route)
  useEffect(() => {
    const id = searchParams.get('assetId');
    if (id) {
      const parsed = parseInt(id, 10);
      if (!isNaN(parsed)) setSelectedAssetId(parsed);
    }
  }, [searchParams]);

  return (
    <div className="portal-page">
      <Helmet>
        <title>Asset Manager — IWILLBUILD</title>
        <meta name="description" content="Inspect and manage assets, defects, photos, tenders, contracts, and closeout documents." />
        <link rel="canonical" href="https://iwillbuild.com/studio/asset-manager" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <PortalSidebar />
      <div className="portal-main">

        {/* ── Asset detail panel (replaces tab content when an asset is selected) ── */}
        {selectedAssetId !== null ? (
          <AssetDetailPanel
            assetId={selectedAssetId}
            onBack={() => setSelectedAssetId(null)}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4 md:px-6 py-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.dispatchEvent(new Event('portal:open-menu'))}
                  className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Open menu"
                >
                  <Menu size={20} />
                </button>
                <button
                  onClick={() => navigate('/studio')}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors mr-1"
                >
                  <ChevronLeft size={14} />
                  <span className="hidden sm:inline">Studio</span>
                </button>
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-cyan-600" />
                </div>
                <div>
                  <h1 className="text-base md:text-lg font-bold text-slate-900 leading-tight">Asset Manager</h1>
                  <p className="text-xs text-slate-500 hidden sm:block">Inspect and manage assets, defects, photos, tenders, contracts, and closeout documents</p>
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 md:px-6 flex items-center gap-1 overflow-x-auto">
              {asset_manager.TABS.map((t, _airoIdx) => {
                const Icon = TABSMeta[_airoIdx].icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={[
                      'flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
                      active
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700',
                    ].join(' ')}
                  >
                    <Icon size={13} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {tab === 'assets'      && <AMAssetsTab onSelectAsset={setSelectedAssetId} />}
              {tab === 'inspections' && <AMInspectionsTab />}
              {tab === 'defects'     && <AMDefectsTab />}
              {tab === 'tenders'     && <AMTendersTab />}
              {tab === 'monitoring'  && <AMMonitoringTab />}
              {tab === 'closeout'    && <AMCloseoutTab />}
              {tab === 'shared'      && <AMSharedReportsTab />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
