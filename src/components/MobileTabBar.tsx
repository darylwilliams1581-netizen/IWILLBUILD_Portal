/**
 * MobileTabBar — Field-first bottom navigation for iPhone / Android.
 *
 * Visible only on mobile (hidden md:hidden).
 * Five tabs: Home · Jobs · Camera · Sign In/Out · More
 *
 * "More" opens a slide-up sheet with access to the full portal nav.
 * This keeps the primary field workflow in 1–2 taps while hiding
 * heavy desktop tools behind a single overflow menu.
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home,
  HardHat,
  Camera,
  LogIn,
  MoreHorizontal,
  X,
  Truck,
  ShieldAlert,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Layers,
  Users,
  CalendarDays,
  Settings,
  LayoutDashboard,
  Map,
  Receipt,
  Building2,
  Calculator,
  Bot,
  CreditCard,
  UserCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TabItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  action?: () => void;
  matchPaths?: string[];
}

interface MoreItem {
  label: string;
  icon: React.ElementType;
  href: string;
  iconBg: string;
  iconFg: string;
}

// ── More menu items ───────────────────────────────────────────────────────────

const MORE_ITEMS: MoreItem[] = [
  { label: 'Dashboard',     icon: LayoutDashboard, href: '/dashboard',          iconBg: 'bg-slate-100',   iconFg: 'text-slate-600' },
  { label: 'Fleet',         icon: Truck,           href: '/fleet',              iconBg: 'bg-blue-100',    iconFg: 'text-blue-600' },
  { label: 'Risk & Permits',icon: ShieldAlert,     href: '/jobs',               iconBg: 'bg-rose-100',    iconFg: 'text-rose-600' },
  { label: 'Prestart',      icon: ClipboardCheck,  href: '/prestart',           iconBg: 'bg-orange-100',  iconFg: 'text-orange-600' },
  { label: 'Drawings',      icon: Map,             href: '/plan-manager',       iconBg: 'bg-lime-100',    iconFg: 'text-lime-600' },
  { label: 'Forms',         icon: FileText,        href: '/studio/forms',       iconBg: 'bg-violet-100',  iconFg: 'text-violet-600' },
  { label: 'Files',         icon: FolderOpen,      href: '/files',              iconBg: 'bg-amber-100',   iconFg: 'text-amber-600' },
  { label: 'Studio',        icon: Layers,          href: '/studio',             iconBg: 'bg-indigo-100',  iconFg: 'text-indigo-600' },
  { label: 'Scheduler',     icon: CalendarDays,    href: '/scheduler',          iconBg: 'bg-cyan-100',    iconFg: 'text-cyan-600' },
  { label: 'Team',          icon: Users,           href: '/team',               iconBg: 'bg-emerald-100', iconFg: 'text-emerald-600' },
  { label: 'Invoices',      icon: Receipt,         href: '/invoices',           iconBg: 'bg-green-100',   iconFg: 'text-green-600' },
  { label: 'Equipment',     icon: Building2,       href: '/studio/asset-manager', iconBg: 'bg-gray-100', iconFg: 'text-gray-600' },
  { label: 'Estimating',    icon: Calculator,      href: '/estimating',         iconBg: 'bg-yellow-100',  iconFg: 'text-yellow-600' },
  { label: 'Dazza AI',      icon: Bot,             href: '/dazza-ai',           iconBg: 'bg-purple-100',  iconFg: 'text-purple-600' },
  { label: 'Billing',       icon: CreditCard,      href: '/billing',            iconBg: 'bg-pink-100',    iconFg: 'text-pink-600' },
  { label: 'Profile',       icon: UserCircle,      href: '/profile',            iconBg: 'bg-teal-100',    iconFg: 'text-teal-600' },
  { label: 'Settings',      icon: Settings,        href: '/settings',           iconBg: 'bg-gray-100',    iconFg: 'text-gray-500' },
];

// ── More sheet ────────────────────────────────────────────────────────────────

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  function go(href: string) {
    onClose();
    navigate(href);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl flex flex-col"
            style={{
              maxHeight: 'calc(100dvh - 80px)',
              boxShadow: '0 -4px 32px rgba(0,0,0,0.14)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <h2 className="text-gray-900 font-bold text-base">More</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Grid of items */}
            <div className="overflow-y-auto flex-1 px-4 py-4">
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
              >
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => go(item.href)}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors text-center"
                    >
                      <div className={`w-11 h-11 rounded-xl ${item.iconBg} flex items-center justify-center`}>
                        <Icon size={20} className={item.iconFg} />
                      </div>
                      <span className="text-[11px] font-semibold text-gray-700 leading-tight">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── MobileTabBar ──────────────────────────────────────────────────────────────

interface MobileTabBarProps {
  /** Called when the Camera tab is tapped — opens the camera job picker */
  onCameraPress?: () => void;
  /** Called when the Sign In/Out tab is tapped — opens the sign-in sheet */
  onSignInPress?: () => void;
}

export default function MobileTabBar({ onCameraPress, onSignInPress }: MobileTabBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs: TabItem[] = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      href: '/home',
      matchPaths: ['/home'],
    },
    {
      id: 'jobs',
      label: 'Jobs',
      icon: HardHat,
      href: '/jobs',
      matchPaths: ['/jobs'],
    },
    {
      id: 'camera',
      label: 'Camera',
      icon: Camera,
      action: onCameraPress,
    },
    {
      id: 'signin',
      label: 'Sign In',
      icon: LogIn,
      action: onSignInPress,
    },
    {
      id: 'more',
      label: 'More',
      icon: MoreHorizontal,
      action: () => setMoreOpen(true),
    },
  ];

  function isActive(tab: TabItem): boolean {
    if (!tab.href && !tab.matchPaths) return false;
    const paths = tab.matchPaths ?? (tab.href ? [tab.href] : []);
    return paths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
  }

  function handleTab(tab: TabItem) {
    if (tab.action) {
      tab.action();
    } else if (tab.href) {
      navigate(tab.href);
    }
  }

  return (
    <>
      {/* Tab bar — only visible on mobile */}
      <nav
        aria-label="Field navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom), 4px)',
          boxShadow: '0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-stretch">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab);
            const isCamera = tab.id === 'camera';

            return (
              <button
                key={tab.id}
                onClick={() => handleTab(tab)}
                className={`
                  flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1
                  transition-colors duration-150 outline-none
                  ${isCamera
                    ? 'relative'
                    : active
                      ? 'text-orange-500'
                      : 'text-gray-400 hover:text-gray-600 active:text-gray-700'
                  }
                `}
                style={isCamera ? { WebkitTapHighlightColor: 'transparent' } : undefined}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
              >
                {isCamera ? (
                  /* Camera FAB — raised pill, no ring/border colour */
                  <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-200 -mt-5 ring-4 ring-white">
                    <Icon size={22} className="text-white" strokeWidth={2} />
                  </div>
                ) : (
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.2 : 1.8}
                    className={active ? 'text-orange-500' : 'text-gray-400'}
                  />
                )}
                <span
                  className={`text-[10px] font-semibold leading-none ${
                    isCamera ? 'mt-1 text-orange-500' : active ? 'text-orange-500' : 'text-gray-400'
                  }`}
                >
                  {tab.label}
                </span>
                {/* Active indicator dot */}
                {active && !isCamera && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-orange-500" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* More sheet */}
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
