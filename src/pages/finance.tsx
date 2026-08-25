/**
 * /finance — Finance workspace
 * Tabs: Estimates | Invoices | Job Ledger | Settings
 * URL param: financeTab=estimates|invoices|ledger|settings
 * Settings sub-param: settingsTab=accounting|costing|pdf-style
 *
 * Does NOT delete any existing routes.
 * Invoices tab navigates to /invoices (safe — InvoicesPage has no named exports).
 */
// @seo-exempt
import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { DollarSign, FileText, BookOpen, Settings, Receipt, ShoppingCart, Clock, ArrowLeft } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import DesktopDock from '@/components/DesktopDock';
import FinanceEstimatesTab from '@/components/finance/FinanceEstimatesTab';
import FinancePurchaseOrdersTab from '@/components/finance/FinancePurchaseOrdersTab';
import FinanceLedgerTab from '@/components/finance/FinanceLedgerTab';
import FinanceSettingsTab from '@/components/finance/FinanceSettingsTab';
import FinanceTimesheetsTab from '@/components/finance/FinanceTimesheetsTab';

// ── Types ─────────────────────────────────────────────────────────────────────

type FinanceTab = 'estimates' | 'purchase-orders' | 'timesheets' | 'invoices' | 'ledger' | 'settings';

const TABS: { key: FinanceTab; label: string; icon: React.ElementType }[] = [
  { key: 'estimates',       label: 'Estimates',       icon: FileText     },
  { key: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
  { key: 'timesheets',      label: 'Timesheets',      icon: Clock        },
  { key: 'invoices',        label: 'Invoices',        icon: Receipt      },
  { key: 'ledger',          label: 'Ledger',          icon: BookOpen     },
  { key: 'settings',        label: 'Settings',        icon: Settings     },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const rawTab = searchParams.get('financeTab') as FinanceTab | null;
  const activeTab: FinanceTab = TABS.some(t => t.key === rawTab) ? rawTab! : 'estimates';
  const settingsTab = searchParams.get('settingsTab') ?? 'accounting';

  // Normalise URL — if no valid financeTab, redirect to estimates
  useEffect(() => {
    if (!rawTab || !TABS.some(t => t.key === rawTab)) {
      setSearchParams({ financeTab: 'estimates' }, { replace: true });
    }
  }, [rawTab, setSearchParams]);

  // Invoices tab navigates to the existing /invoices route
  useEffect(() => {
    if (activeTab === 'invoices') {
      navigate('/invoices', { replace: false });
    }
  }, [activeTab, navigate]);

  function setTab(tab: FinanceTab) {
    if (tab === 'invoices') {
      navigate('/invoices');
      return;
    }
    const next: Record<string, string> = { financeTab: tab };
    if (tab === 'settings') next.settingsTab = settingsTab;
    setSearchParams(next, { replace: false });
  }

  function setSettingsTab(st: string) {
    setSearchParams({ financeTab: 'settings', settingsTab: st }, { replace: false });
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>Finance — IWILLBUILD</title>
        <meta name="description" content="Company-wide estimates, invoices, job cost ledger and finance settings." />
        <link rel="canonical" href="https://iwillbuild.com/finance" />
      </Helmet>

      <PortalSidebar />
      <DesktopDock />

      <div className="portal-content flex flex-col h-[100dvh] overflow-hidden">
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <DollarSign size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Finance</h1>
            <p className="text-xs text-muted-foreground">Company-wide estimates, invoices and costs</p>
          </div>
        </div>

        {/* ── Tab strip ───────────────────────────────────────────────────── */}
        <div className="flex border-b border-border shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'estimates'       && <FinanceEstimatesTab />}
          {activeTab === 'purchase-orders' && <FinancePurchaseOrdersTab />}
          {activeTab === 'timesheets'      && <FinanceTimesheetsTab />}
          {activeTab === 'ledger'          && <FinanceLedgerTab />}
          {activeTab === 'settings'        && (
            <FinanceSettingsTab
              settingsTab={settingsTab}
              key={settingsTab}
            />
          )}
          {/* invoices tab redirects — render nothing while navigating */}
        </div>
      </div>
    </div>
  );
}
