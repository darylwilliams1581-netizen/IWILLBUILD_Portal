/**
 * SafetyContent — the inner tab shell from the Safety page,
 * extracted so it can be embedded inside Studio without its own
 * page wrapper, sidebar, or Helmet.
 *
 * Visible tab order (spec):
 *   1. Documents          — JobSwmsTab (job-issued SWMS documents)
 *   2. Submissions        — SwmsSubmissionsTab (company sign-off register)
 *   3. Policies & Docs    — PoliciesTab + App Doc template list
 *   4. Doc Submissions    — SubmissionsTab (document template submissions)
 *   5. Policy Library     — LibraryView (embedded, safety-filtered)
 *
 * Removed (moved to Studio → Apply Widget):
 *   SWMS               — SwmsLibraryTab  (master doc creation now in Studio)
 *   Safety Plans       — SafetyPlansTab  (master doc creation now in Studio)
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
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  FileText, ClipboardCheck, BookOpen, Library, Inbox, Plus, FileUp, Layers,
} from 'lucide-react';

// Tab components from safety.tsx (unchanged behaviour)
import {
  PoliciesTab,
} from '@/pages/safety';

// New / feature components
import JobSwmsTab from './JobSwmsTab';
import SwmsSubmissionsTab from './SwmsSubmissionsTab';
import LibraryView from '../../features/library/LibraryView';
import { SubmissionsTab, type DocTemplate } from '../../pages/studio-documents';

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'documents',       label: 'Documents',       icon: FileText       },
  { id: 'submissions',     label: 'Submissions',      icon: ClipboardCheck },
  { id: 'policies',        label: 'Policies & Docs',  icon: BookOpen       },
  { id: 'doc-submissions', label: 'Doc Submissions',  icon: Inbox          },
  { id: 'library',         label: 'Policy Library',   icon: Library        },
] as const;

type TabId = typeof TABS[number]['id'];

const DEFAULT_TAB: TabId = 'documents';

// ── Component ─────────────────────────────────────────────────────────────────

export default function SafetyContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Read the safetyTab param; fall back to default.
  // Old tabs 'swms' and 'plans' are no longer in the tab strip — redirect them
  // to Studio so users land in the right place.
  const rawTab = searchParams.get('safetyTab');

  useEffect(() => {
    if (rawTab === 'swms' || rawTab === 'plans') {
      navigate('/studio/documents', { replace: true });
    }
  }, [rawTab, navigate]);

  const activeTab: TabId =
    TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : DEFAULT_TAB;

  // Optional jobId filter — passed through from /job-docs redirect or deep links
  const jobIdParam = searchParams.get('jobId');
  const initialJobId = jobIdParam ? Number(jobIdParam) : null;

  // Doc templates — loaded once, shared between Policies & Docs and Doc Submissions tabs
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const loadTemplates = useCallback(async () => {
    try {
      const r = await fetch('/api/document-templates', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json() as { templates?: DocTemplate[] };
      setTemplates(d.templates ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'policies' || activeTab === 'doc-submissions') {
      void loadTemplates();
    }
  }, [activeTab, loadTemplates]);

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
          {activeTab === 'documents'       && <JobSwmsTab initialJobId={initialJobId} />}
          {activeTab === 'submissions'     && <SwmsSubmissionsTab />}
          {activeTab === 'policies'        && (
            <>
              {/* App Doc template list — the document building tool */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers size={15} className="text-primary" />
                    <h2 className="text-sm font-bold text-slate-800">Document Templates</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void fetch('/api/document-templates', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ name: 'Imported Document', templateType: 'custom', blocks: [], layout: {}, theme: {} }),
                      }).then(r => r.json()).then((d: { id?: number }) => {
                        if (d.id) navigate(`/studio/builder/${d.id}`);
                      })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                    >
                      <FileUp size={13} />Import
                    </button>
                    <button
                      onClick={() => navigate('/studio/builder/new')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
                    >
                      <Plus size={13} />New Document
                    </button>
                  </div>
                </div>
                {templates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50 rounded-xl border border-slate-200">
                    <Layers size={20} className="text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-500">No document templates yet</p>
                    <p className="text-xs text-slate-400 mt-0.5">Click "New Document" to build your first policy or procedure</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => navigate(`/studio/builder/${t.id}`)}
                        className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-primary/40 hover:bg-violet-50/30 cursor-pointer transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                          <FileText size={14} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{t.name}</p>
                          {t.template_type && (
                            <p className="text-xs text-slate-400 capitalize">{t.template_type.replace(/_/g, ' ')}</p>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Existing policy files */}
              <PoliciesTab />
            </>
          )}
          {activeTab === 'doc-submissions' && <SubmissionsTab templates={templates} />}
          {activeTab === 'library'         && (
            <LibraryView initialTypeFilter="safety" />
          )}
        </motion.div>
      </div>
    </div>
  );
}
