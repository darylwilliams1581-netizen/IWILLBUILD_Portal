/**
 * /timesheets — Employee self-service timesheet page.
 *
 * Accessible from the Manage page tile. Opens directly to the employee's own
 * timesheets — no job picker, no employee selector. The authenticated user is
 * the implicit employee. A Back button returns to the Manage page (page 2 of
 * the home screen).
 *
 * Finance administration (all-employee view, approve/reject) remains on
 * /finance?financeTab=timesheets — this page is for workers only.
 */
// @seo-exempt
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, Clock } from 'lucide-react';
import FinanceTimesheetsTab from '@/components/finance/FinanceTimesheetsTab';
import PortalSidebar from '@/components/PortalSidebar';
import DesktopDock from '@/components/DesktopDock';

export default function TimesheetsPage() {
  const navigate = useNavigate();

  function handleBack() {
    // Return to home screen on the Manage page (page index 2)
    navigate('/?page=2');
  }

  return (
    <div className="portal-page" data-testid="timesheets-page">
      <Helmet>
        <title>Timesheets — IWILLBUILD</title>
        <meta name="description" content="Enter and submit your weekly hours." />
        <link rel="canonical" href="https://iwillbuild.com/timesheets" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Desktop sidebar + dock (hidden on mobile) */}
      <PortalSidebar />
      <DesktopDock />

      {/* Main content */}
      <div className="portal-content flex flex-col min-h-0">
        {/* ── Mobile header with back button ── */}
        <header
          className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shrink-0 md:hidden"
          data-testid="timesheets-page-header"
        >
          <button
            onClick={handleBack}
            aria-label="Back to Manage"
            data-testid="timesheets-back-button"
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors shrink-0"
          >
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Clock size={16} className="text-white" />
            </div>
            <h1 className="font-bold text-slate-800 text-base truncate">Timesheets</h1>
          </div>
        </header>

        {/* ── Desktop header (visible md+) ── */}
        <header
          className="hidden md:flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-100 shrink-0"
        >
          <button
            onClick={handleBack}
            aria-label="Back to Manage"
            data-testid="timesheets-back-button-desktop"
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors shrink-0"
          >
            <ArrowLeft size={18} strokeWidth={2.2} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Clock size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-800 text-lg" aria-hidden="true">Timesheets</span>
          </div>
        </header>

        {/* ── Timesheet content — reuses the existing Finance tab component ── */}
        <div className="flex-1 min-h-0 overflow-y-auto" data-testid="timesheets-content">
          <FinanceTimesheetsTab />
        </div>
      </div>
    </div>
  );
}
