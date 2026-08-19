/**
 * SafetyContent — the inner tab shell from the Safety page,
 * extracted so it can be embedded inside Studio without its own
 * page wrapper, sidebar, or Helmet.
 *
 * Visible tab order (spec):
 *   1. Documents          — JobSwmsTab (job-issued SWMS documents)
 *   2. Submissions        — SwmsSubmissionsTab (company sign-off register)
 *   3. SWMS               — SwmsLibraryTab + merged header actions
 *   4. Safety Plans       — SafetyPlansTab
 *   5. Policies & Docs    — PoliciesTab
 *   6. Document Library   — LibraryView (embedded, safety-filtered)
 *
 * Hidden (preserved, not deleted):
 *   Dashboard — SafetyDashboardTab (component intact, not rendered in tab strip)
 *   Posters   — PostersTab (component intact, not rendered in tab strip)
 *
 * URL param: safetyTab (namespaced to avoid colliding with Studio's tab param).
 * Browser back/forward and reload retain the selected section.
 *
 * This component does NOT render PortalSidebar, Helmet, or the outer page header.
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import {
  FileText, ClipboardCheck, HardHat, ClipboardList, BookOpen, Library,
} from 'lucide-react';

// Tab components from safety.tsx (unchanged behaviour)
import {
  SwmsLibraryTab,
  SafetyPlansTab,
  PoliciesTab,
} from '@/pages/safety';

// New / feature components
import JobSwmsTab from './JobSwmsTab';
import SwmsSubmissionsTab from './SwmsSubmissionsTab';
import LibraryView from '../../features/library/LibraryView';

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'documents',   label: 'Documents',         icon: FileText       },
  { id: 'submissions', label: 'Submissions',        icon: ClipboardCheck },
  { id: 'swms',        label: 'SWMS',               icon: HardHat        },
  { id: 'plans',       label: 'Safety Plans',       icon: ClipboardList  },
  { id: 'policies',    label: 'Policies & Docs',    icon: BookOpen       },
  { id: 'library',     label: 'Document Library',   icon: Library        },
] as const;

type TabId = typeof TABS[number]['id'];

const DEFAULT_TAB: TabId = 'documents';

// ── Component ─────────────────────────────────────────────────────────────────

export default function SafetyContent() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read the safetyTab param; fall back to default.
  const rawTab = searchParams.get('safetyTab');
  const activeTab: TabId =
    TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : DEFAULT_TAB;

  // Optional jobId filter — passed through from /job-docs redirect or deep links
  const jobIdParam = searchParams.get('jobId');
  const initialJobId = jobIdParam ? Number(jobIdParam) : null;

  function setTab(id: TabId) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('safetyTab', id);
        return next;
      },
      { replace: false },
    );
  }

  // Run migration on mount (idempotent)
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;
    fetch('/api/migrate-safety', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6">
        <div className="flex gap-1 py-2 overflow-x-auto" role="tablist" aria-label="Safety sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setTab(id)}
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
          {activeTab === 'documents'   && <JobSwmsTab initialJobId={initialJobId} />}
          {activeTab === 'submissions' && <SwmsSubmissionsTab />}
          {activeTab === 'swms'        && <SwmsLibraryTab />}
          {activeTab === 'plans'       && <SafetyPlansTab />}
          {activeTab === 'policies'    && <PoliciesTab />}
          {activeTab === 'library'     && (
            <LibraryView initialTypeFilter="swms" />
          )}
        </motion.div>
      </div>
    </div>
  );
}
