/**
 * /plan-manager/:drawingId
 *
 * Standalone route for a single drawing / plan sheet.
 * Opens the Plan Manager page with the specified drawing pre-selected.
 */
import { useEffect } from 'react';
import { useParams, useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2 } from 'lucide-react';
export default function PlanManagerDrawingPage() {
  const {
    drawingId
  } = useParams<{
    drawingId: string;
  }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/plan-manager?drawingId=${drawingId ?? ''}`, {
      replace: true
    });
  }, [drawingId, navigate]);
  return <>
      <Helmet>
        <title>Plan Manager — IWIllBUIlD</title>
        <meta name="description" content="View and annotate a drawing in Plan Manager." />
        <link rel="canonical" href={`https://iwillbuild.com/plan-manager/${drawingId}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center">
        <h1 className="sr-only">Plan Manager Drawing</h1>
        <Loader2 size={28} className="animate-spin text-violet-600" />
      </div>
    </>;
}
