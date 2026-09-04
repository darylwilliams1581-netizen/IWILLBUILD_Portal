/**
 * /studio/asset-manager/:assetId
 *
 * Standalone route for a single asset record.
 * Redirects to the Asset Manager page with the asset pre-selected.
 */
import { useEffect } from 'react';
import { useParams, useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2 } from 'lucide-react';
export default function AssetManagerDetailPage() {
  const {
    assetId
  } = useParams<{
    assetId: string;
  }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/studio/asset-manager?assetId=${assetId ?? ''}`, {
      replace: true
    });
  }, [assetId, navigate]);
  return <>
      <Helmet>
        <title>Asset Manager — IWIllBUIlD</title>
        <meta name="description" content="View and manage an asset record in Asset Manager." />
        <link rel="canonical" href={`https://iwillbuild.com/studio/asset-manager/${assetId}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center">
        <h1 className="sr-only">Asset Manager</h1>
        <Loader2 size={28} className="animate-spin text-violet-600" />
      </div>
    </>;
}
