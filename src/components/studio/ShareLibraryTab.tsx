/**
 * ShareLibraryTab
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Share to Library" tab inside the Studio Documents section.
 *
 * Shows:
 *   1. A picker to select which document to share (or pre-selected via prop)
 *   2. The ShareToLibraryModal inline (not as an overlay) for a seamless tab UX
 *   3. A "My submissions" list showing documents this company has already shared
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Library, Search, ChevronDown, Loader2, AlertTriangle,
  Clock, CheckCircle, Globe, FileText, RefreshCw,
} from 'lucide-react';
import ShareToLibraryModal from './ShareToLibraryModal';
import { AnimatePresence } from 'motion/react';

interface DocTemplate {
  id: number;
  name: string;
  template_type: string | null;
  updated_at: string;
}

interface Submission {
  id: number;
  title: string;
  type: string;
  visibility: 'public' | 'pending' | 'rejected';
  status: string;
  created_at: string;
  reviewer_notes?: string | null;
}

interface Props {
  /** Pre-select a specific template (e.g. from DocRow "Share" button) */
  preSelectedId?: number | null;
  isPlatformOwner?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  swms: 'SWMS', policy: 'Policy', procedure: 'Procedure', form: 'Form',
  contract: 'Contract', quote: 'Quote', report: 'Report', induction: 'Induction',
  checklist: 'Checklist', toolbox_talk: 'Toolbox Talk', prestart: 'Pre-start', custom: 'Custom',
};

export default function ShareLibraryTab({ preSelectedId, isPlatformOwner = false }: Props) {
  const [templates,    setTemplates]    = useState<DocTemplate[]>([]);
  const [loadingTpls,  setLoadingTpls]  = useState(true);
  const [search,       setSearch]       = useState('');
  const [selectedId,   setSelectedId]   = useState<number | null>(preSelectedId ?? null);
  const [showModal,    setShowModal]     = useState(false);
  const [submissions,  setSubmissions]  = useState<Submission[]>([]);
  const [loadingSubs,  setLoadingSubs]  = useState(true);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setLoadingTpls(true);
    try {
      const r = await fetch('/api/document-templates', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed');
      const d = await r.json() as { templates?: DocTemplate[] };
      setTemplates(d.templates ?? []);
    } catch { /* silent */ }
    finally { setLoadingTpls(false); }
  }, []);

  // Load this company's submissions
  const loadSubmissions = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const r = await fetch('/api/library/my-submissions', { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { submissions?: Submission[] };
        setSubmissions(d.submissions ?? []);
      }
    } catch { /* silent — endpoint may not exist yet */ }
    finally { setLoadingSubs(false); }
  }, []);

  useEffect(() => {
    void loadTemplates();
    void loadSubmissions();
  }, [loadTemplates, loadSubmissions]);

  // Sync pre-selected id
  useEffect(() => {
    if (preSelectedId) setSelectedId(preSelectedId);
  }, [preSelectedId]);

  const filtered = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
            <Library size={15} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Share to Global Library</p>
            <p className="text-xs text-slate-500">
              {isPlatformOwner
                ? 'Publish documents directly to the global library for all companies.'
                : 'Submit documents for review. Once approved, they appear in the library for all companies to install.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-6">

          {/* ── Step 1: Pick a document ─────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              1. Select a document to share
            </h3>

            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your documents…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60"
              />
            </div>

            {loadingTpls ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={18} className="animate-spin text-slate-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">
                {templates.length === 0 ? 'No documents yet — create one in the Documents tab first.' : 'No results.'}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all ${
                      selectedId === t.id
                        ? 'border-primary/50 bg-orange-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedId === t.id ? 'bg-primary/10' : 'bg-slate-100'
                    }`}>
                      <FileText size={14} className={selectedId === t.id ? 'text-primary' : 'text-slate-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${selectedId === t.id ? 'text-primary' : 'text-slate-700'}`}>
                        {t.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {TYPE_LABELS[t.template_type ?? ''] ?? 'Custom'} · Updated {new Date(t.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    {selectedId === t.id && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <CheckCircle size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Step 2: Share button ────────────────────────────────────── */}
          {selectedTemplate && (
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                2. Submit details
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
                  <FileText size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{selectedTemplate.name}</p>
                  <p className="text-xs text-slate-500">
                    {isPlatformOwner ? 'Will be published immediately' : 'Will be submitted for review'}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
                >
                  <Library size={13} />
                  {isPlatformOwner ? 'Publish' : 'Share'}
                </button>
              </div>
            </motion.section>
          )}

          {/* ── My submissions ──────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                My submissions
              </h3>
              <button
                onClick={() => void loadSubmissions()}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <RefreshCw size={11} />Refresh
              </button>
            </div>

            {loadingSubs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-slate-400" />
              </div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-2xl">
                <Library size={22} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No submissions yet</p>
                <p className="text-xs text-slate-400 mt-0.5">Documents you share will appear here</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {submissions.map((sub) => (
                  <SubmissionRow key={sub.id} submission={sub} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Share modal */}
      <AnimatePresence>
        {showModal && selectedTemplate && (
          <ShareToLibraryModal
            templateId={selectedTemplate.id}
            templateName={selectedTemplate.name}
            isPlatformOwner={isPlatformOwner}
            onClose={() => {
              setShowModal(false);
              void loadSubmissions();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Submission row ────────────────────────────────────────────────────────────

function SubmissionRow({ submission }: { submission: Submission }) {
  const vis = submission.visibility;
  const badge = vis === 'public'
    ? { icon: <Globe size={11} />, label: 'Live', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
    : vis === 'rejected'
    ? { icon: <AlertTriangle size={11} />, label: 'Rejected', cls: 'bg-red-100 text-red-700 border-red-200' }
    : { icon: <Clock size={11} />, label: 'Pending review', cls: 'bg-amber-100 text-amber-700 border-amber-200' };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Library size={13} className="text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700 truncate">{submission.title}</p>
        <p className="text-xs text-slate-400">
          {TYPE_LABELS[submission.type] ?? submission.type} · Submitted {new Date(submission.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        {submission.reviewer_notes && (
          <p className="text-xs text-slate-500 mt-0.5 italic">"{submission.reviewer_notes}"</p>
        )}
      </div>
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.cls}`}>
        {badge.icon}{badge.label}
      </span>
    </div>
  );
}
