import { useState, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Building2,
  Bell,
  Calculator,
  Database,
  ChevronRight,
  Layers,
  Megaphone,
  FileText,
  Plug,
  Receipt,
  User,
  Truck,
  Home,
  ShieldCheck,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import CompanyStructureTab from '@/components/settings/CompanyStructureTab';
import DashboardBannerTab from '@/components/settings/DashboardBannerTab';
import NotificationsTab from '@/components/settings/NotificationsTab';
import PdfStyleTab from '@/components/settings/PdfStyleTab';
import DataBackupTab from '@/components/settings/DataBackupTab';
import IntegrationsTab from '@/components/settings/IntegrationsTab';
import AccountingTab from '@/components/settings/AccountingTab';
import CompanyTab from '@/components/settings/CompanyTab';
import MyAccountTab from '@/components/settings/MyAccountTab';
import FleetAnalyticsTab from '@/components/settings/FleetAnalyticsTab';
import AppPermissionsTab from '@/components/settings/AppPermissionsTab';
import CostingTab from '@/components/settings/CostingTab';
import { Skeleton } from '@/components/ui/skeleton';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

const tabs = [
  { id: 'account',      label: 'My Account',        icon: User },
  { id: 'company',      label: 'Company Profile',    icon: Building2 },
  { id: 'structure',    label: 'Company Structure',  icon: Layers },
  { id: 'pdf',          label: 'PDF / Print Style',  icon: FileText },
  { id: 'accounting',   label: 'Accounting',         icon: Receipt },
  { id: 'banner',       label: 'Dashboard Banner',   icon: Megaphone },
  { id: 'notifications',label: 'Notifications',      icon: Bell },
  { id: 'permissions',  label: 'App Permissions',    icon: ShieldCheck },
  { id: 'integrations', label: 'Integrations',       icon: Plug },
  { id: 'costing',      label: 'Costing',             icon: Calculator },
  { id: 'fleet',        label: 'Fleet Analytics',    icon: Truck },
  { id: 'data',         label: 'Data & Backup',      icon: Database },
];

/** Fallback shown while a settings sub-tab is loading */
function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <Skeleton className="h-5 w-40 rounded" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabFromUrl = searchParams.get('tab');
  const validTab = tabs.find((t) => t.id === tabFromUrl)?.id ?? 'account';
  const [activeTab, setActiveTab] = useState(validTab);
  const { me, isAdmin } = usePermissions();
  const isOwner = me?.profile?.role === 'owner';

  return (
    <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden lg:pt-[96px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Settings — IWILLBUILD Portal</title>
        <meta name="description" content="Configure company profile, users, permissions and data settings for the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/settings" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Settings — IWILLBUILD Portal" />
        <meta property="og:description" content="Configure company profile, users, permissions and data settings for the IWILLBUILD portal." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/settings" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Settings — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Configure company profile, users, permissions and data settings for the IWILLBUILD portal." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      {/* Header */}
      <header
        className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}
      >
        <button
          onClick={() => navigate('/home')}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500 text-white hover:bg-violet-700 active:bg-violet-800 transition-colors touch-manipulation shadow-sm shrink-0"
          title="Dashboard"
        >
          <Home size={18} />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center min-w-0">
          <h1 className="text-gray-900 font-bold text-sm leading-tight">Settings</h1>
          <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
            <button onClick={() => navigate('/home')} className="hover:text-violet-600 transition-colors">Home</button>
            <span>/</span>
            <span className="text-gray-500 font-medium">Settings</span>
          </div>
        </div>
        <div className="w-9 shrink-0" />
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6 max-w-6xl mx-auto w-full">

            {/* Mobile: dropdown tab selector */}
            <div className="md:hidden">
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>{tab.label}</option>
                ))}
              </select>
            </div>

            {/* Desktop: sidebar tabs */}
            <div className="hidden md:block w-52 shrink-0">
              <nav className="flex flex-col gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors text-left ${
                        activeTab === tab.id
                          ? 'bg-primary text-white'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={15} />
                        {tab.label}
                      </span>
                      <ChevronRight size={13} className="opacity-50" />
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <Suspense fallback={<TabSkeleton />}>
                {activeTab === 'account'    && <MyAccountTab />}
                {activeTab === 'company'    && <CompanyTab />}
                {activeTab === 'structure'  && <CompanyStructureTab isAdmin={isAdmin} />}
                {activeTab === 'pdf'        && <PdfStyleTab isAdmin={isAdmin} />}
                {activeTab === 'accounting' && <AccountingTab isAdmin={isAdmin} isOwner={isOwner} />}
                {activeTab === 'banner'     && <DashboardBannerTab isAdmin={isAdmin} />}
                {activeTab === 'notifications' && <NotificationsTab />}
                {activeTab === 'permissions'  && <AppPermissionsTab />}
                {activeTab === 'integrations' && <IntegrationsTab isOwner={isOwner} />}
                {activeTab === 'costing'      && <CostingTab />}
                {activeTab === 'fleet'        && <FleetAnalyticsTab isAdmin={isAdmin} />}
                {activeTab === 'data' && <DataBackupTab isAdmin={isAdmin} />}
              </Suspense>
            </div>

          </div>
        </div>
    </div>
  );
}
