import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Settings,
  Building2,
  Users,
  Bell,
  Database,
  ChevronRight,
  Layers,
  Megaphone,
  FileText,
  Plug,
  Receipt,
  User,
  Truck,
  Smartphone,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';
import CompanyStructureTab from '@/components/settings/CompanyStructureTab';
import DashboardBannerTab from '@/components/settings/DashboardBannerTab';
import NotificationsTab from '@/components/settings/NotificationsTab';
import TeamPermissionsTab from '@/components/settings/TeamPermissionsTab';
import PdfStyleTab from '@/components/settings/PdfStyleTab';
import DataBackupTab from '@/components/settings/DataBackupTab';
import IntegrationsTab from '@/components/settings/IntegrationsTab';
import AccountingTab from '@/components/settings/AccountingTab';
import CompanyTab from '@/components/settings/CompanyTab';
import MyAccountTab from '@/components/settings/MyAccountTab';
import FleetAnalyticsTab from '@/components/settings/FleetAnalyticsTab';
import { Skeleton } from '@/components/ui/skeleton';

const tabs = [
  { id: 'account',      label: 'My Account',        icon: User },
  { id: 'company',      label: 'Company Profile',    icon: Building2 },
  { id: 'team',         label: 'Team & Permissions', icon: Users },
  { id: 'structure',    label: 'Company Structure',  icon: Layers },
  { id: 'pdf',          label: 'PDF / Print Style',  icon: FileText },
  { id: 'accounting',   label: 'Accounting',         icon: Receipt },
  { id: 'banner',       label: 'Dashboard Banner',   icon: Megaphone },
  { id: 'notifications',label: 'Notifications',      icon: Bell },
  { id: 'integrations', label: 'Integrations',       icon: Plug },
  { id: 'fleet',        label: 'Fleet Analytics',     icon: Truck },
  { id: 'data',         label: 'Data & Backup',       icon: Database },
];

interface Company {
  id: number;
  name: string;
  abn: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
}

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
  const tabFromUrl = searchParams.get('tab');
  const validTab = tabs.find((t) => t.id === tabFromUrl)?.id ?? 'account';
  const [activeTab, setActiveTab] = useState(validTab);
  const { me, isAdmin } = usePermissions();
  const isOwner = me?.profile?.role === 'owner';

  // Run migration once on mount to ensure company_settings table exists
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/migrate-company-settings', { method: 'POST', credentials: 'include' })
      .catch(() => { /* silent — table may already exist */ });
  }, [isAdmin]);

  return (
    <div className="portal-page">
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

      <PortalSidebar />

      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 shrink-0 gap-3">
          <Settings size={20} className="text-primary mr-1" />
          <h1 className="font-heading font-bold text-lg flex-1">Settings</h1>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6">

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
                {activeTab === 'team'       && <TeamPermissionsTab isAdmin={isAdmin} />}
                {activeTab === 'structure'  && <CompanyStructureTab isAdmin={isAdmin} />}
                {activeTab === 'pdf'        && <PdfStyleTab isAdmin={isAdmin} />}
                {activeTab === 'accounting' && <AccountingTab isAdmin={isAdmin} isOwner={isOwner} />}
                {activeTab === 'banner'     && <DashboardBannerTab isAdmin={isAdmin} />}
                {activeTab === 'notifications' && <NotificationsTab />}
                {activeTab === 'integrations' && <IntegrationsTab isOwner={isOwner} />}
                {activeTab === 'fleet'        && <FleetAnalyticsTab isAdmin={isAdmin} />}
                {activeTab === 'data' && <DataBackupTab isAdmin={isAdmin} />}
              </Suspense>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
