/**
 * SafetyContent — the inner tab shell from the Safety page,
 * extracted so it can be embedded inside Studio without its own
 * page wrapper, sidebar, or Helmet.
 *
 * All tab components (SwmsLibraryTab, SafetyPlansTab, etc.) live in
 * safety.tsx and are re-exported from here via a thin re-export so
 * we don't duplicate hundreds of lines.
 *
 * This component renders:
 *   - Safety sub-tab bar (Dashboard / SWMS Library / Safety Plans / Policies / Posters)
 *   - Active tab content
 * It does NOT render PortalSidebar, Helmet, or the outer page header.
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ShieldAlert, ShieldCheck, ClipboardList, BookOpen, Image,
} from 'lucide-react';

// Re-use the tab components directly from the safety page module.
import {
  SafetyDashboardTab,
  SwmsLibraryTab,
  SafetyPlansTab,
  PoliciesTab,
  PostersTab,
} from '@/pages/safety';

const TABS = [
  { id: 'dashboard', label: 'Dashboard',    icon: ShieldCheck },
  { id: 'swms',      label: 'SWMS Library', icon: ShieldAlert },
  { id: 'plans',     label: 'Safety Plans', icon: ClipboardList },
  { id: 'policies',  label: 'Policies',     icon: BookOpen },
  { id: 'posters',   label: 'Posters',      icon: Image },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SafetyContent() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // Run migration on mount (idempotent)
  useEffect(() => {
    fetch('/api/migrate-safety', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1 py-2 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap',
                activeTab === id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'dashboard' && <SafetyDashboardTab />}
          {activeTab === 'swms'      && <SwmsLibraryTab />}
          {activeTab === 'plans'     && <SafetyPlansTab />}
          {activeTab === 'policies'  && <PoliciesTab />}
          {activeTab === 'posters'   && <PostersTab />}
        </motion.div>
      </div>
    </div>
  );
}
