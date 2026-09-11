/**
 * SafetyContent — the inner tab shell from the Safety page,
 * extracted so it can be embedded inside Studio without its own
 * page wrapper, sidebar, or Helmet.
 *
 * Visible tab order (Step 2 spec):
 *   1. company-documents  — Documents tab: /api/document-templates list only
 *   2. documents          — Safety Documents tab: JobSwmsTab (job-assigned SWMS)
 *
 * Removed from tab bar (components preserved, not deleted):
 *   submissions     — SwmsSubmissionsTab  (sign-offs still visible inside each job)
 *   policies        — PoliciesTab         (component preserved in src/pages/safety.tsx; not rendered here)
 *   doc-submissions — SubmissionsTab      (preserved, not rendered)
 *   library         — LibraryView         (preserved, not rendered)
 *
 * Legacy redirect map (safetyTab param):
 *   submissions, swms, plans → documents (Safety Documents)
 *   policies, doc-submissions, library   → company-documents (Documents)
 *   no param / unknown                   → company-documents (default)
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
  FileText, ShieldCheck, Plus, FileUp, Layers,
} from 'lucide-react';

// Tab components from safety.tsx (preserved, not rendered in SafetyContent)
// PoliciesTab remains exported from src/pages/safety.tsx for use elsewhere.

// Feature components
import JobSwmsTab from './JobSwmsTab';
import { type DocTemplate } from '../../pages/studio-documents';

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'company-documents', label: 'Documents',         icon: FileText    },
  { id: 'documents',         label: 'Safety Documents',  icon: ShieldCheck },
] as const;

type TabId = typeof TABS[number]['id'];

const DEFAULT_TAB: TabId = 'company-documents';

// ── Legacy tab → new tab redirect map ────────────────────────────────────────
// Removed tabs redirect to the closest equivalent so old bookmarks/links still work.
const LEGACY_REDIRECT: Record<string, TabId> = {
  // Removed tabs that map to Safety Documents
  submissions:        'documents',
  // Removed tabs that map to Documents
  swms:               'company-documents',
  plans:              'company-documents',
  policies:           'company-documents',
  'doc-submissions':  'company-documents',
  library:            'company-documents',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SafetyContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const rawTab = searchParams.get('safetyTab');

  // Redirect legacy tab IDs via URL replacement so the address bar is clean.
  useEffect(() => {
    if (!rawTab) return;
    const redirect = LEGACY_REDIRECT[rawTab];
    if (redirect) {
      // Replace in-place so the legacy URL doesn't pollute history.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('safetyTab', redirect);
          return next;
        },
        { replace: true },
      );
    }
  }, [rawTab, setSearchParams]);

  const activeTab: TabId =
    TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : DEFAULT_TAB;

  // Optional jobId filter — passed through from /job-docs redirect or deep links.
  // Kept on the documents (Safety Documents) tab for job-specific filtering.
  const jobIdParam = searchParams.get('jobId');
  const initialJobId = jobIdParam ? Number(jobIdParam) : null;

  // Doc templates — loaded for the company-documents tab
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
    if (activeTab === 'company-documents') {
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
          {/* ── Documents tab: company document templates only ── */}
          {activeTab === 'company-documents' && (
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
          )}

          {/* ── Safety Documents tab: job-assigned SWMS (JobSwmsTab — unchanged) ── */}
          {activeTab === 'documents' && <JobSwmsTab initialJobId={initialJobId} />}
        </motion.div>
      </div>
    </div>
  );
}
