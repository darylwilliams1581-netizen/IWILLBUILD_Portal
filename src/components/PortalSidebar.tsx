import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, HardHat, Truck, Camera, LogOut, Settings, FolderOpen, Menu, X, ShieldCheck, CreditCard, AlertTriangle, CalendarDays, Users, Receipt, Bot, PanelLeftClose, PanelLeftOpen, Zap, AlertCircle,
// Desktop sidebar icons
Map, FileStack, Building2, TriangleAlert, FileText, ClipboardList, BookOpen, Link2, TableProperties, ScrollText, History, UserCircle, HelpCircle, ShieldAlert } from 'lucide-react';
import { signOut } from '@/lib/auth/auth-client';
import { usePermissions, invalidateMeCache } from '@/lib/usePermissions';
import DesktopTopBar from '@/components/DesktopTopBar';
import { useTerminology, invalidateTerminologyCache } from '@/lib/useTerminology';
import { invalidateSubscriptionCache } from '@/lib/useSubscriptionGate';
import { invalidateSupportModeCache } from '@/lib/useSupportMode';
import { useSessionTimeout } from '@/lib/auth/useSessionTimeout';
import SessionExpiredBanner from '@/components/auth/SessionExpiredBanner';

// ── Sidebar collapse persistence ──────────────────────────────────────────────
const LS_KEY = 'iwb_desktop_sidebar_collapsed';
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}
function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(LS_KEY, v ? '1' : '0');
  } catch {/* ignore */}
}

// ── Sidebar widths ────────────────────────────────────────────────────────────
const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 64;

// ── Company logo hook ─────────────────────────────────────────────────────────
function useCompanyLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/company', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((d: {
      company?: {
        logo_url?: string | null;
      };
    } | null) => {
      setLogoUrl(d?.company?.logo_url ?? null);
    }).catch(() => {});
  }, []);
  return logoUrl;
}

// ── Trial/subscription status hook ───────────────────────────────────────────
interface SubInfo {
  status: 'active' | 'trial' | 'trial_expired' | 'cancelled' | 'past_due' | 'no_company';
  plan: string;
  daysLeft: number | null;
}
function useSubscriptionStatus() {
  const [info, setInfo] = useState<SubInfo | null>(null);
  useEffect(() => {
    fetch('/api/subscription/status', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then((d: SubInfo | null) => {
      if (d) setInfo(d);
    }).catch(() => {});
  }, []);
  return info;
}

// ── Desktop sidebar nav structure ─────────────────────────────────────────────
//
// TEMPORARY: Two-digit index numbers prefix every label so Daryl and the
// developer can reference items by number (e.g. "move 07 above 05").
// Numbers are fixed IDs — reordering an item does NOT change its number.
// Remove the numbers after Daryl approves the final arrangement.
// Numbers must NOT appear in page titles, routes, mobile nav, or DB records.
//
interface DesktopNavItem {
  id: string; // stable fixed ID — never changes on reorder
  idx: string; // two-digit display prefix, e.g. "01"
  label: string; // label without the index
  icon: React.ElementType;
  href: string;
  adminOnly?: boolean;
  ownerOnly?: boolean;
}
interface DesktopNavGroup {
  heading: string | null; // null = no heading (Main)
  items: DesktopNavItem[];
}
const DESKTOP_NAV_GROUPS: DesktopNavGroup[] = [{
  heading: null,
  items: [{
    id: 'nav-01',
    idx: '01',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/home'
  }]
}, {
  heading: 'Work',
  items: [{
    id: 'nav-02',
    idx: '02',
    label: 'Jobs',
    icon: HardHat,
    href: '/jobs'
  }, {
    id: 'nav-03',
    idx: '03',
    label: 'Job Cards',
    icon: Zap,
    href: '/job-cards'
  }, {
    id: 'nav-04',
    idx: '04',
    label: 'Scheduler',
    icon: CalendarDays,
    href: '/scheduler'
  }]
}, {
  heading: 'Field & Files',
  items: [{
    id: 'nav-06',
    idx: '06',
    label: 'Plan Manager',
    icon: Map,
    href: '/plan-manager'
  }, {
    id: 'nav-07',
    idx: '07',
    label: 'Files',
    icon: FolderOpen,
    href: '/files'
  }, {
    id: 'nav-08',
    idx: '08',
    label: 'Lens',
    icon: Camera,
    href: '/lens'
  }]
}, {
  heading: 'Fleet',
  items: [{
    id: 'nav-09',
    idx: '09',
    label: 'Fleet',
    icon: Truck,
    href: '/fleet'
  }, {
    id: 'nav-10',
    idx: '10',
    label: 'Equipment',
    icon: Building2,
    href: '/studio/asset-manager'
  }]
}, {
  heading: 'Finance',
  items: [{
    id: 'nav-11',
    idx: '11',
    label: 'Invoices',
    icon: Receipt,
    href: '/invoices'
  }, {
    id: 'nav-12',
    idx: '12',
    label: 'Contacts',
    icon: Users,
    href: '/customers'
  }]
}, {
  heading: 'Safety',
  items: [{
    id: 'nav-05',
    idx: '05',
    label: 'Field Docs',
    icon: FileStack,
    href: '/safety?safetyTab=documents'
  }, {
    id: 'nav-18',
    idx: '18',
    label: 'Forms',
    icon: ClipboardList,
    href: '/studio/forms'
  }, {
    id: 'nav-13',
    idx: '13',
    label: 'Safety',
    icon: ShieldCheck,
    href: '/safety?safetyTab=documents'
  }, {
    id: 'nav-14',
    idx: '14',
    label: 'Safety Posters',
    icon: ShieldAlert,
    href: '/safety/posters'
  }, {
    id: 'nav-15',
    idx: '15',
    label: 'Incidents',
    icon: AlertCircle,
    href: '/incidents'
  }, {
    id: 'nav-16',
    idx: '16',
    label: 'Risk Register',
    icon: TriangleAlert,
    href: '/risk-register'
  }]
}, {
  heading: 'Studio',
  items: [{
    id: 'nav-17',
    idx: '17',
    label: 'App Docs',
    icon: FileText,
    href: '/studio/documents'
  }, {
    id: 'nav-19',
    idx: '19',
    label: 'Library',
    icon: BookOpen,
    href: '/studio/library'
  }, {
    id: 'nav-20',
    idx: '20',
    label: 'Quick Links',
    icon: Link2,
    href: '/quick-links'
  }, {
    id: 'nav-21',
    idx: '21',
    label: 'Lists',
    icon: TableProperties,
    href: '/lists'
  }]
}, {
  heading: 'Administration',
  items: [{
    id: 'nav-22',
    idx: '22',
    label: 'User Logs',
    icon: ScrollText,
    href: '/user-logs',
    adminOnly: true
  }, {
    id: 'nav-23',
    idx: '23',
    label: 'Sign-in History',
    icon: History,
    href: '/signin-history',
    adminOnly: true
  }, {
    id: 'nav-24',
    idx: '24',
    label: 'Team',
    icon: UserCircle,
    href: '/team',
    adminOnly: true
  }, {
    id: 'nav-25',
    idx: '25',
    label: 'My Billing',
    icon: CreditCard,
    href: '/billing'
  }, {
    id: 'nav-26',
    idx: '26',
    label: 'Help',
    icon: HelpCircle,
    href: '/help'
  }]
}];

// ── Mobile nav (unchanged — 10 items, no index numbers) ───────────────────────
interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  permKey: string | null;
  ownerOnly?: boolean;
}
function buildNavEntries(_workPlural: string): NavItem[] {
  return [{
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/home',
    permKey: null
  }, {
    label: 'Jobs',
    icon: HardHat,
    href: '/jobs',
    permKey: 'jobs'
  }, {
    label: 'Job Cards',
    icon: Zap,
    href: '/job-cards',
    permKey: 'jobs'
  }, {
    label: 'Scheduler',
    icon: CalendarDays,
    href: '/scheduler',
    permKey: 'jobs'
  }, {
    label: 'Fleet',
    icon: Truck,
    href: '/fleet',
    permKey: 'fleet'
  }, {
    label: 'Invoices',
    icon: Receipt,
    href: '/invoices',
    permKey: 'invoices'
  }, {
    label: 'Files',
    icon: FolderOpen,
    href: '/files',
    permKey: 'files'
  }, {
    label: 'Safety',
    icon: ShieldCheck,
    href: '/safety?safetyTab=documents',
    permKey: null
  }, {
    label: 'Incidents',
    icon: AlertCircle,
    href: '/incidents',
    permKey: null
  }, {
    label: 'Contacts',
    icon: Users,
    href: '/customers',
    permKey: 'jobs'
  }];
}

// ── Manage group (mobile only) ────────────────────────────────────────────────
const adminItems = [{
  label: 'My Billing',
  icon: CreditCard,
  href: '/billing',
  adminOnly: false,
  ownerOnly: false,
  permKey: null as string | null
}, {
  label: 'Settings',
  icon: Settings,
  href: '/settings',
  adminOnly: false,
  ownerOnly: false,
  permKey: null as string | null
}, {
  label: 'Dazza AI',
  icon: Bot,
  href: '/dazza-ai',
  adminOnly: false,
  ownerOnly: true,
  permKey: null as string | null
}] as const;

// ─── User strip sub-component ─────────────────────────────────────────────────
function SidebarUserStrip({
  sessionUser,
  me,
  collapsed
}: {
  sessionUser: {
    name?: string;
    email?: string;
  } | null;
  me: import('@/lib/usePermissions').MeData | null;
  collapsed: boolean;
}) {
  const displayName = me?.user?.name ?? sessionUser?.name ?? '';
  const displayEmail = me?.user?.email ?? sessionUser?.email ?? '';
  const initial = (displayName || displayEmail || '?')[0].toUpperCase();
  if (!me && !sessionUser) {
    return <div className="mt-1 px-2 py-2 rounded bg-gray-50 flex items-center gap-2 opacity-40">
        <div className="w-6 h-6 rounded bg-gray-200 shrink-0" />
        {!collapsed && <div className="min-w-0 flex-1"><div className="h-2 w-16 bg-gray-200 rounded" /></div>}
      </div>;
  }
  if (collapsed) {
    return <div className="mt-1 flex items-center justify-center py-2" title={displayName || displayEmail || 'User'}>
        <div className="w-7 h-7 rounded bg-primary flex items-center justify-center text-white font-black text-[11px] shrink-0">
          {initial}
        </div>
      </div>;
  }
  return <div className="mt-1 px-2 py-2 rounded bg-gray-50 flex items-center gap-2">
      <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-white font-black text-[10px] shrink-0">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-gray-800 truncate">{displayName || 'User'}</div>
        <div className="text-[10px] text-gray-400 truncate">{displayEmail}</div>
      </div>
    </div>;
}

// ─── Desktop sidebar content ──────────────────────────────────────────────────
function DesktopSidebarContent({
  collapsed,
  onToggleCollapse
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const location = useLocation();
  const {
    isAdmin,
    isOwner,
    isPlatformOwner,
    loading: permsLoading,
    me
  } = usePermissions();
  const subInfo = useSubscriptionStatus();
  const companyLogoUrl = useCompanyLogo();
  const companyName = me?.company?.name ?? 'Portal';
  const canSeeAdmin = !permsLoading && (isAdmin || isOwner || isPlatformOwner);
  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + '/');
  async function handleLogout() {
    try {
      invalidateMeCache();
      invalidateSubscriptionCache();
      invalidateTerminologyCache();
      invalidateSupportModeCache();
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k?.startsWith('dazza_conv_id_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
      } catch {/* sessionStorage unavailable */}
      await signOut();
    } catch {/* ignore */} finally {
      window.location.replace('/login');
    }
  }
  const linkCls = (active: boolean) => {
    const base = `flex items-center rounded-lg transition-colors duration-100 group relative ${collapsed ? 'justify-center px-0 py-2 mx-1 w-10 h-10' : 'gap-2.5 px-2.5 py-1.5 w-full'}`;
    return `${base} ${active ? 'bg-violet-50 text-primary font-semibold' + (!collapsed ? ' border-r-2 border-primary' : '') : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-medium'}`;
  };
  return <div className="flex flex-col h-full overflow-hidden bg-white border-r border-gray-100">

      {/* ── Logo / header ── */}
      <div className={`flex border-b border-gray-100 shrink-0 ${collapsed ? 'flex-col items-center justify-center gap-1 py-3 px-2 min-h-[56px]' : 'flex-row items-center gap-2.5 px-3 py-0 min-h-[56px]'}`}>
        {companyLogoUrl ? <img src={companyLogoUrl} alt={companyName} className="h-8 w-8 object-contain rounded-lg shrink-0" /> : <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0 select-none shadow-sm" title={companyName}>
            <span className="text-white text-sm font-black leading-none">{companyName.trim()[0]?.toUpperCase() ?? 'P'}</span>
          </div>}
        {!collapsed && <div className="flex-1 min-w-0 relative overflow-hidden">
            <span className="block text-[13px] font-bold text-gray-800 leading-tight whitespace-nowrap">{companyName}</span>
            <span className="block text-[10px] text-gray-400 font-medium leading-tight mt-0.5">Portal</span>
            <span className="sidebar-name-fade absolute inset-y-0 right-0 w-6 pointer-events-none" aria-hidden="true" />
          </div>}
      </div>

      {/* ── Collapse toggle ── */}
      <div className={`flex shrink-0 border-b border-gray-100 ${collapsed ? 'justify-center py-1.5' : 'justify-end px-2 py-1.5'}`}>
        <button onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors duration-150">
          {collapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
        </button>
      </div>

      {/* ── Nav groups ── */}
      <nav className={`flex-1 overflow-y-auto py-2 flex flex-col gap-0 ${collapsed ? 'px-0 items-center' : 'px-2'}`} aria-label="Desktop navigation">
        {DESKTOP_NAV_GROUPS.map(group => {
        const visibleItems = group.items.filter(item => {
          if (item.ownerOnly && (permsLoading || !isPlatformOwner)) return false;
          if (item.adminOnly && !canSeeAdmin) return false;
          return true;
        });
        if (visibleItems.length === 0) return null;
        return <div key={group.heading ?? '__main__'} className="mb-1">
              {group.heading && !collapsed && <p className="px-2.5 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-gray-300 select-none">
                  {group.heading}
                </p>}
              {group.heading && collapsed && <div className="mx-1 my-1 border-t border-gray-100" aria-hidden="true" />}

              {visibleItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);
            // Tooltip shows "01 Dashboard" in both expanded and collapsed states
            // TEMPORARY: index prefix — remove after Daryl approves final arrangement
            const tooltip = `${item.idx} ${item.label}`;
            return <Link key={item.id} to={item.href} aria-current={active ? 'page' : undefined} aria-label={collapsed ? tooltip : undefined} title={tooltip} className={linkCls(active)}>
                    <Icon size={15} className="shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate flex-1 text-[13px]">
                        {/* TEMPORARY index prefix — remove after Daryl approves final arrangement */}
                        <span className="text-[10px] font-mono text-gray-300 mr-1.5 select-none">{item.idx}</span>
                        {item.label}
                      </span>}
                  </Link>;
          })}
            </div>;
      })}
      </nav>

      {/* ── Divider ── */}
      <div className="mx-2 border-t border-gray-100" />

      {/* ── Bottom strip ── */}
      <div className={`py-2 flex flex-col gap-0 ${collapsed ? 'px-0 items-center' : 'px-2'}`}>
        <button onClick={handleLogout} aria-label="Log out" title={collapsed ? 'Log out' : undefined} className={`flex items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors duration-100 w-full text-[13px] font-medium ${collapsed ? 'justify-center px-0 py-2 w-10 h-10' : 'gap-2.5 px-2.5 py-1.5'}`}>
          <LogOut size={15} className="shrink-0" aria-hidden="true" />
          {!collapsed && <span>Log out</span>}
        </button>

        {!collapsed && subInfo && !isOwner && subInfo.status !== 'active' && <Link to="/billing" className={`mx-2 mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due' ? 'bg-red-50 hover:bg-red-100 border border-red-200' : (subInfo.daysLeft ?? 14) <= 5 ? 'bg-amber-50 hover:bg-amber-100 border border-amber-200' : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'}`}>
            {subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due' ? <AlertTriangle size={13} className="text-red-500 shrink-0" /> : <CreditCard size={13} className="text-amber-500 shrink-0" />}
            <div className="min-w-0 flex-1">
              {subInfo.status === 'trial_expired' ? <p className="text-xs font-bold text-red-600">Trial expired</p> : subInfo.status === 'cancelled' ? <p className="text-xs font-bold text-red-600">Subscription cancelled</p> : subInfo.status === 'past_due' ? <p className="text-xs text-red-600 font-bold">Payment past due</p> : <><p className="text-xs font-bold text-amber-600">Free trial</p><p className="text-[10px] text-gray-500">{subInfo.daysLeft ?? 0} day{subInfo.daysLeft !== 1 ? 's' : ''} remaining</p></>}
            </div>
          </Link>}

        {collapsed && subInfo && !isOwner && subInfo.status !== 'active' && <Link to="/billing" title={subInfo.status === 'trial_expired' ? 'Trial expired — upgrade' : subInfo.status === 'cancelled' ? 'Subscription cancelled' : subInfo.status === 'past_due' ? 'Payment past due' : `Free trial — ${subInfo.daysLeft ?? 0}d left`} className="flex justify-center py-1">
            <span className={`w-2 h-2 rounded-full ${subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due' ? 'bg-red-500' : 'bg-amber-400'}`} />
          </Link>}

        <SidebarUserStrip sessionUser={me?.user ?? null} me={me} collapsed={collapsed} />
      </div>
    </div>;
}

// ─── Shared nav content (mobile drawer only) ─────────────────────────────────
function SidebarContent({
  onClose
}: {
  onClose?: () => void;
}) {
  const location = useLocation();
  const {
    isAdmin,
    loading: permsLoading,
    can,
    isOwner,
    isPlatformOwner,
    me
  } = usePermissions();
  const subInfo = useSubscriptionStatus();
  const {
    workPlural
  } = useTerminology();
  const navEntries = buildNavEntries(workPlural);
  const companyLogoUrl = useCompanyLogo();
  const companyName = me?.company?.name ?? 'Portal';
  const isActive = (href: string) => {
    if (href.includes('?')) {
      const [hPath, hQuery] = href.split('?');
      const hParams = new URLSearchParams(hQuery);
      const locParams = new URLSearchParams(location.search);
      if (location.pathname !== hPath) return false;
      for (const [k, v] of hParams.entries()) {
        if (locParams.get(k) !== v) return false;
      }
      return true;
    }
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };
  async function handleLogout() {
    try {
      invalidateMeCache();
      invalidateSubscriptionCache();
      invalidateTerminologyCache();
      invalidateSupportModeCache();
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k?.startsWith('dazza_conv_id_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
      } catch {/* sessionStorage unavailable */}
      await signOut();
    } catch {/* ignore */} finally {
      window.location.replace('/login');
    }
  }
  const navLinkClass = (active: boolean, isDazza = false) => {
    const base = `flex items-center rounded transition-colors duration-100 group relative text-[13px] gap-2.5 px-3 py-1.5`;
    if (isDazza) {
      return `${base} ${active ? 'bg-violet-50 text-primary font-semibold border-r-2 border-primary' : 'text-violet-600 hover:bg-violet-50 hover:text-violet-700 font-medium'}`;
    }
    return `${base} ${active ? 'bg-violet-50 text-primary font-semibold border-r-2 border-primary' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-medium'}`;
  };
  return <>
      {/* ── Logo / header ── */}
      <div className="flex flex-row items-center gap-2.5 px-3 py-0 min-h-[60px] border-b border-gray-100 shrink-0">
        {companyLogoUrl ? <img src={companyLogoUrl} alt={companyName} className="h-8 w-8 object-contain rounded-lg shrink-0" /> : <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0 select-none shadow-sm" title={companyName}>
            <span className="text-white text-sm font-black leading-none">{companyName.trim()[0]?.toUpperCase() ?? 'P'}</span>
          </div>}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          <span className="block text-[13px] font-bold text-gray-800 leading-tight whitespace-nowrap">{companyName}</span>
          <span className="block text-[10px] text-gray-400 font-medium leading-tight mt-0.5">Portal</span>
          <span className="sidebar-name-fade absolute inset-y-0 right-0 w-6 pointer-events-none" aria-hidden="true" />
        </div>
        {onClose && <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 transition-colors shrink-0" aria-label="Close menu">
            <X size={16} />
          </button>}
      </div>

      {/* ── Main nav ── */}
      <nav className="flex-1 overflow-y-auto py-2 flex flex-col gap-0 px-2" aria-label="Main navigation">
        {navEntries.map(item => {
        if (!permsLoading && item.permKey !== null && me?.profile && !can(item.permKey as any)) return null;
        if (item.ownerOnly && (permsLoading || !isPlatformOwner)) return null;
        const Icon = item.icon;
        const active = isActive(item.href);
        const isDazza = item.href === '/dazza-ai';
        return <Link key={item.href} to={item.href} onClick={onClose} aria-current={active ? 'page' : undefined} className={navLinkClass(active, isDazza)}>
              <Icon size={15} className="shrink-0" aria-hidden="true" />
              <span className="truncate flex-1">{item.label}</span>
            </Link>;
      })}

        {/* ── Manage group ── */}
        <div className="mt-2">
          <p className="px-3 mb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-300 select-none">Manage</p>
          {adminItems.map(item => {
          if (!permsLoading && item.adminOnly && !isAdmin) return null;
          if ((item as {
            ownerOnly?: boolean;
          }).ownerOnly && (permsLoading || !isPlatformOwner)) return null;
          const Icon = item.icon;
          const active = isActive(item.href);
          const isDazza = item.href === '/dazza-ai';
          return <Link key={item.href} to={item.href} onClick={onClose} aria-current={active ? 'page' : undefined} className={navLinkClass(active, isDazza)}>
                <Icon size={15} className="shrink-0" aria-hidden="true" />
                <span className="truncate flex-1">{item.label}</span>
              </Link>;
        })}
          {(permsLoading || isPlatformOwner) && (() => {
          if (!permsLoading && !isPlatformOwner) return null;
          const active = isActive('/owner-console');
          return <Link to="/owner-console" onClick={onClose} aria-current={active ? 'page' : undefined} className={`${navLinkClass(active)} border border-violet-200`}>
                <ShieldCheck size={15} className="shrink-0 text-violet-600" aria-hidden="true" />
                <span className="truncate flex-1 text-violet-700">Developer Console</span>
              </Link>;
        })()}
        </div>
      </nav>

      <div className="mx-2 border-t border-gray-100" />

      <div className="py-2 flex flex-col gap-0 px-2">
        <button onClick={handleLogout} aria-label="Log out" className="flex items-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors duration-100 w-full text-[13px] font-medium gap-2.5 px-3 py-1.5">
          <LogOut size={15} className="shrink-0" aria-hidden="true" />
          <span>Log out</span>
        </button>
        {subInfo && !isOwner && subInfo.status !== 'active' && <Link to="/billing" className={`mx-2 mb-2 flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due' ? 'bg-red-50 hover:bg-red-100 border border-red-200' : (subInfo.daysLeft ?? 14) <= 5 ? 'bg-amber-50 hover:bg-amber-100 border border-amber-200' : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'}`}>
            {subInfo.status === 'trial_expired' || subInfo.status === 'cancelled' || subInfo.status === 'past_due' ? <AlertTriangle size={13} className="text-red-500 shrink-0" /> : <CreditCard size={13} className="text-amber-500 shrink-0" />}
            <div className="min-w-0 flex-1">
              {subInfo.status === 'trial_expired' ? <p className="text-xs font-bold text-red-600">Trial expired</p> : subInfo.status === 'cancelled' ? <p className="text-xs font-bold text-red-600">Subscription cancelled</p> : subInfo.status === 'past_due' ? <p className="text-xs text-red-600 font-bold">Payment past due</p> : <><p className="text-xs font-bold text-amber-600">Free trial</p><p className="text-[10px] text-gray-500">{subInfo.daysLeft ?? 0} day{subInfo.daysLeft !== 1 ? 's' : ''} remaining</p></>}
            </div>
          </Link>}
        <SidebarUserStrip sessionUser={me?.user ?? null} me={me} collapsed={false} />
      </div>
    </>;
}

// ─── Mobile hamburger button (exported for use in page top bars) ──────────────
export function MobileMenuButton({
  onClick
}: {
  onClick: () => void;
}) {
  return <button onClick={onClick} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150" aria-label="Open menu">
      <Menu size={20} />
    </button>;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function PortalSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());
  const location = useLocation();
  const _sidebarRef = useRef<HTMLElement>(null);

  // ── Session timeout enforcement ───────────────────────────────────────────
  const {
    isExpired
  } = useSessionTimeout();
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  function handleToggleCollapse() {
    setCollapsed(prev => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  // ── Sync --iwb-sidebar-w CSS variable on body so .lg-portal pages offset correctly ──
  useEffect(() => {
    document.body.style.setProperty('--iwb-sidebar-w', `${sidebarWidth}px`);
  }, [sidebarWidth]);
  return <>
      {/* ── Session expired banner ── */}
      {isExpired && <SessionExpiredBanner />}

      {/* ── Desktop top bar — fixed, full-width, z-1100 ── */}
      <DesktopTopBar />

      {/* ── Desktop sidebar — fixed left rail, below topbar, lg+ only ── */}
      <aside ref={_sidebarRef} aria-label="Desktop sidebar navigation" className="hidden lg:flex flex-col" style={{
      position: 'fixed',
      top: 56,
      left: 0,
      bottom: 0,
      width: sidebarWidth,
      zIndex: 1050,
      transition: 'width 0.2s ease',
      overflowX: 'hidden',
      overflowY: 'hidden'
    }}>
        <DesktopSidebarContent collapsed={collapsed} onToggleCollapse={handleToggleCollapse} />
      </aside>

      {/* ── Mobile overlay drawer ── */}
      <AnimatePresence>
        {mobileOpen && <>
            <motion.div key="backdrop" initial={{
          opacity: 0
        }} animate={{
          opacity: 1
        }} exit={{
          opacity: 0
        }} transition={{
          duration: 0.2
        }} onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/50 z-40 lg:hidden" />
            <motion.aside key="drawer" initial={{
          x: -280
        }} animate={{
          x: 0
        }} exit={{
          x: -280
        }} transition={{
          duration: 0.25,
          ease: 'easeOut' as const
        }} className="fixed top-0 left-0 h-[100dvh] w-72 max-w-[85vw] bg-white flex flex-col z-50 lg:hidden shadow-2xl border-r border-gray-200" style={{
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </motion.aside>
          </>}
      </AnimatePresence>

      <MobileMenuTrigger onOpen={() => setMobileOpen(true)} />
    </>;
}

// Listens for the custom event dispatched by MobileMenuButton in page top bars
function MobileMenuTrigger({
  onOpen
}: {
  onOpen: () => void;
}) {
  useEffect(() => {
    const handler = () => onOpen();
    window.addEventListener('portal:open-menu', handler);
    return () => window.removeEventListener('portal:open-menu', handler);
  }, [onOpen]);
  return null;
}

// ─── Global mobile SOS modal ──────────────────────────────────────────────────
// Shown when the user taps SOS in the bottom nav.
