/**
 * ShareLibraryTab — Studio → Global Library tab
 *
 * Platform owner only. Shows:
 *   1. Quick-publish picker: select a document from this company and publish to Global Library
 *   2. Recently published items (from library_items, platform owner can see all)
 *
 * Regular company users never see this tab (filtered out in studio.tsx).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Library, Search, ChevronDown, Loader2, AlertTriangle,
  CheckCircle2, Globe, FileText, RefreshCw, BookOpen, Plus,
  Eye, EyeOff, Tag,
} from 'lucide-react';
import ShareToLibraryModal from './ShareToLibraryModal';
import { AnimatePresence } from 'motion/react';

interface DocTemplate {
  id: number;
  name: string;
  template_type: string | null;
  updated_at: string;
}

interface LibItem {
  id: number;
  title: string;
  type: string;
  version: string;
  status: string;
  visibility: string;
  install_count: number;
  created_at: string;
}

interface Props {
  isPlatformOwner?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  swms: 'SWMS', policy: 'Policy', procedure: 'Procedure', form: 'Form',
  contract: 'Contract', quote: 'Quote', report: 'Report', induction: 'Induction',
  checklist: 'Checklist', toolbox_talk: 'Toolbox Talk', prestart: 'Pre-start', custom: 'Custom',
};

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

export default function ShareLibraryTab({ isPlatformOwner = false }: Props) {
  // Guard — this tab should never render for non-owners, but be safe
  if (!isPlatformOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
          <Library size={22} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-600 mb-1">Access restricted</p>
        <p className="text-xs text-slate-400 max-w-xs">Only the platform owner can publish to the Global Library.</p>
      </div>
    );
  }

  const [templates,   setTemplates]   = useState<DocTemplate[]>([]);
  const [loadingTpls, setLoadingTpls] = useState(true);
  const [search,      setSearch]      = useState('');
  const [selectedId,  setSelectedId]  = useState<number | null>(null);
  const [showModal,   setShowModal]   = useState(false);

  const [recentItems,    setRecentItems]    = useState<LibItem[]>([]);
  const [loadingRecent,  setLoadingRecent]  = useState(true);

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

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const r = await fetch('/api/owner-console/library/items?limit=20', { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { items?: LibItem[] };
        setRecentItems(d.items ?? []);
      }
    } catch { /* silent */ }
    finally { setLoadingRecent(false); }
  }, []);

  useEffect(() => {
    void loadTemplates();
    void loadRecent();
  }, [loadTemplates, loadRecent]);

  const filtered = templates.filter((t) =>
    !search.trim() || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedDoc = templates.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Globe size={14} className="text-violet-600" />
            Publish to Global Library
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Select a document from this company and publish it as a global master.
          </p>
        </div>
        <button onClick={() => { void loadTemplates(); void loadRecent(); }} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Document picker */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Search size={13} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="flex-1 text-sm bg-transparent focus:outline-none placeholder-slate-400"
          />
        </div>

        {loadingTpls ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 size={16} className="animate-spin mr-2" />
            <span className="text-xs">Loading documents…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            {search ? 'No documents match your search.' : 'No documents in this company yet.'}
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  selectedId === t.id ? 'bg-violet-50 border-l-2 border-violet-400' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={12} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                  <p className="text-xs text-slate-400">
                    {t.template_type ? TYPE_LABELS[t.template_type] ?? t.template_type : 'Document'} · Updated {fmtDate(t.updated_at)}
                  </p>
                </div>
                {selectedId === t.id && <CheckCircle2 size={14} className="text-violet-600 flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Publish button */}
      <button
        onClick={() => { if (selectedId) setShowModal(true); }}
        disabled={!selectedId}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Globe size={14} />
        {selectedId ? `Publish "${selectedDoc?.name ?? ''}" to Global Library` : 'Select a document above to publish'}
      </button>

      {/* Recently published */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen size={12} />
            Recently in Global Library
          </h4>
          <a href="/owner-console" className="text-xs text-violet-600 font-semibold hover:underline">
            Manage all →
          </a>
        </div>

        {loadingRecent ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
            <Loader2 size={13} className="animate-spin" />
            Loading…
          </div>
        ) : recentItems.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">Nothing published yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentItems.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
                  <Library size={12} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                  <p className="text-xs text-slate-400">
                    {TYPE_LABELS[item.type] ?? item.type} · v{item.version} · {fmtDate(item.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    item.visibility === 'public' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.visibility === 'public' ? 'Public' : 'Private'}
                  </span>
                  <span className="text-xs text-slate-400">{item.install_count} installed</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Publish modal */}
      <AnimatePresence>
        {showModal && selectedDoc && (
          <ShareToLibraryModal
            templateId={selectedDoc.id}
            templateName={selectedDoc.name}
            isPlatformOwner={true}
            onClose={() => {
              setShowModal(false);
              setSelectedId(null);
              void loadRecent();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
