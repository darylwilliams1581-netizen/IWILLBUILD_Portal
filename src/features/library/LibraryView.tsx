/**
 * LibraryView — Reusable Library feature component
 *
 * Contains all reusable Library functionality:
 *   - Browse tab with search and type filter
 *   - Download handler — writes directly into the company's real template tables
 *     (form_templates, swms_templates, document_templates) so the user edits
 *     the downloaded copy in Forms / Safety / Documents like any other template.
 *   - Loading, error and empty states
 *   - Permission behaviour (isPlatformOwner delete gate)
 *
 * Does NOT contain:
 *   - Helmet / page metadata (route page responsibility)
 *   - Redirects or route navigation (route page responsibility)
 *   - Route-level wrappers or shell chrome
 *
 * Consumed by:
 *   - src/pages/library.tsx          (re-exports as LibraryPage for backwards compat)
 *   - src/pages/studio-library.tsx   (as LibraryContent)
 *   - src/pages/studio-documents.tsx (as LibraryPage — Library tab)
 *   - src/pages/forms.tsx            (as LibraryPage — Library tab)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Search, Download, CheckCircle2, Loader2, Filter,
  ChevronDown, Star, RefreshCw, FileText, Shield,
  ClipboardList, Wrench, Calculator, Package, AlertCircle, Trash2, ArrowRight,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LibraryItem {
  id: number;
  type: string;
  category: string | null;
  title: string;
  summary: string | null;
  tags: string | null;
  discipline: string | null;
  version: string;
  status: string;
  install_count: number;
  avg_rating: number;
  rating_count: number;
  source_file_name: string | null;
  has_file: number;
  updated_at: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const ITEM_TYPES = [
  { value: '', label: 'All types' },
  { value: 'policy', label: 'Policy' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'swms', label: 'SWMS' },
  { value: 'form', label: 'Form' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'estimate_recipe', label: 'Estimate Recipe' },
  { value: 'scope_line', label: 'Scope Line' },
];

export const TYPE_ICONS: Record<string, React.ElementType> = {
  policy: Shield,
  procedure: FileText,
  swms: AlertCircle,
  form: ClipboardList,
  recipe: Wrench,
  estimate_recipe: Calculator,
  scope_line: Package,
};

export const TYPE_COLORS: Record<string, string> = {
  policy: 'bg-blue-500/10 text-blue-600',
  procedure: 'bg-purple-500/10 text-purple-600',
  swms: 'bg-red-500/10 text-red-600',
  form: 'bg-emerald-500/10 text-emerald-600',
  recipe: 'bg-amber-500/10 text-amber-600',
  estimate_recipe: 'bg-violet-500/10 text-violet-700',
  scope_line: 'bg-teal-500/10 text-teal-600',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? BookOpen;
  const color = TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-500';
  const label = ITEM_TYPES.find(t => t.value === type)?.label ?? type;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

export function StarRating({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-xs text-slate-400">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-500">
      <Star size={11} fill="currentColor" />
      {avg.toFixed(1)}
      <span className="text-slate-400">({count})</span>
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LibraryViewProps {
  /** Pre-select a type filter on mount (e.g. "form", "document"). */
  initialTypeFilter?: string;
}

// ── LibraryView ───────────────────────────────────────────────────────────────

export function LibraryView({ initialTypeFilter }: LibraryViewProps = {}) {
  const { isPlatformOwner } = usePermissions();

  // ── Browse state ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0, page: 1, limit: 20, pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(initialTypeFilter ?? '');
  const [page, setPage] = useState(1);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Download state ────────────────────────────────────────────────────────
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<{
    id: number; msg: string; ok: boolean; redirectTarget?: string; redirectLabel?: string;
  } | null>(null);

  // ── Fetch browse items ────────────────────────────────────────────────────
  const fetchItems = useCallback(async (opts: {
    search?: string;
    type?: string;
    category?: string;
    page?: number;
  } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts.search) params.set('search', opts.search);
      if (opts.type) params.set('type', opts.type);
      if (opts.category) params.set('category', opts.category);
      params.set('page', String(opts.page ?? 1));
      params.set('limit', '20');
      const res = await fetch(`/api/library/items?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        ok: boolean;
        items: LibraryItem[];
        pagination: Pagination;
      };
      setItems(data.items ?? []);
      setPagination(data.pagination ?? { total: 0, page: 1, limit: 20, pages: 0 });
    } catch (e) {
      setError('Failed to load library. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchItems({ search, type: typeFilter, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change (debounce search)
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      void fetchItems({ search, type: typeFilter, page: 1 });
    }, 350);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  // Re-fetch when page changes
  useEffect(() => {
    void fetchItems({ search, type: typeFilter, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Download handler ──────────────────────────────────────────────────────
  async function handleDownload(item: LibraryItem) {
    setDownloading(item.id);
    setDownloadMsg(null);
    try {
      const res = await fetch(`/api/library/items/${item.id}/install`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as {
        ok: boolean; message: string;
        redirectTarget?: string; redirectLabel?: string;
      };
      setDownloadMsg({
        id: item.id,
        msg: data.message ?? (res.ok ? 'Downloaded.' : 'Failed.'),
        ok: res.ok,
        redirectTarget: data.redirectTarget,
        redirectLabel: data.redirectLabel,
      });
    } catch {
      setDownloadMsg({ id: item.id, msg: 'Download failed. Please try again.', ok: false });
    } finally {
      setDownloading(null);
    }
  }

  // ── Delete handler (platform owner only) ─────────────────────────────────
  async function handleDelete(item: LibraryItem) {
    if (!confirm(`Delete "${item.title}" from the Global Library? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/owner-console/library/items/${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        if (downloadMsg?.id === item.id) setDownloadMsg(null);
      } else {
        alert('Delete failed. Please try again.');
      }
    } catch {
      alert('Network error — could not delete item.');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-600/20 flex items-center justify-center flex-shrink-0">
                <BookOpen size={20} className="text-violet-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Content Library</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Browse templates and download them into your account. Edit and tweak them like any template you created yourself.
                </p>
              </div>
            </div>
          </div>

          {/* ── Filters ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search title, summary, tags…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-600/30 focus:border-violet-400"
              />
            </div>

            {/* Type filter */}
            <div className="relative">
              <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="appearance-none bg-white border border-slate-200 rounded-lg pl-8 pr-7 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-600/30"
              >
                {ITEM_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Refresh */}
            <button
              onClick={() => void fetchItems({ search, type: typeFilter, page })}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          </div>

          {/* ── Error ──────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {/* ── Results count ───────────────────────────────────────────── */}
          {!loading && !error && (
            <p className="text-xs text-slate-400">
              {pagination.total === 0
                ? 'No items found'
                : `${pagination.total} item${pagination.total !== 1 ? 's' : ''} — page ${pagination.page} of ${pagination.pages}`}
            </p>
          )}

          {/* ── Loading skeleton ────────────────────────────────────────── */}
          {loading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* ── Items list ──────────────────────────────────────────────── */}
          {!loading && items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map(item => {
                const isDownloading = downloading === item.id;
                const msg = downloadMsg?.id === item.id ? downloadMsg : null;
                return (
                  <div key={item.id} className="flex flex-col">
                    <div className="bg-white border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-primary/40 hover:shadow-sm transition-all duration-150">
                      {/* Type icon */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 border border-slate-200">
                        {(() => {
                          const Icon = TYPE_ICONS[item.type] ?? BookOpen;
                          return <Icon size={14} className="text-slate-500" />;
                        })()}
                      </div>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800 truncate">{item.title}</span>
                          <TypeBadge type={item.type} />
                          {item.category && (
                            <span className="text-xs text-slate-400 hidden sm:inline">{item.category}</span>
                          )}
                        </div>
                        {item.summary && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{item.summary}</p>
                        )}
                      </div>

                      {/* Right: rating + download count + actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StarRating avg={Number(item.avg_rating)} count={item.rating_count} />
                        <span className="text-xs text-slate-400 hidden md:flex items-center gap-1">
                          <Download size={10} />{item.install_count}
                        </span>

                        {/* Download original file if available */}
                        {!!item.has_file && (
                          <a
                            href={`/api/library/items/${item.id}/download`}
                            download={item.source_file_name ?? undefined}
                            title={`Download ${item.source_file_name ?? 'original file'}`}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <Download size={11} />
                            <span className="hidden sm:inline">File</span>
                          </a>
                        )}

                        {/* Download into templates */}
                        <button
                          onClick={() => void handleDownload(item)}
                          disabled={isDownloading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                          {isDownloading ? 'Downloading…' : 'Download to My Templates'}
                        </button>

                        {/* Platform-owner delete */}
                        {isPlatformOwner && (
                          <button
                            onClick={() => void handleDelete(item)}
                            title="Delete from Global Library"
                            className="p-1.5 rounded-md text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Download success / error message */}
                    {msg && (
                      <div className={`mt-1 mx-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                        msg.ok
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                          : 'bg-red-50 border border-red-200 text-red-600'
                      }`}>
                        {msg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                        <span className="flex-1">{msg.msg}</span>
                        {msg.ok && msg.redirectTarget && (
                          <a
                            href={msg.redirectTarget}
                            className="flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-900 underline"
                          >
                            Open in {msg.redirectLabel} <ArrowRight size={11} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Empty state ─────────────────────────────────────────────── */}
          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <BookOpen size={36} className="text-slate-300" />
              <p className="text-slate-500 text-sm">No library items found.</p>
              {(search || typeFilter) && (
                <button
                  onClick={() => { setSearch(''); setTypeFilter(''); }}
                  className="text-xs text-violet-600 hover:text-violet-700 underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* ── Pagination ──────────────────────────────────────────────── */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-slate-400">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages || loading}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Default export for convenience
export default LibraryView;
