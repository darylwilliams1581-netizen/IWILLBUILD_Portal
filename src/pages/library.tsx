/**
 * /library — Developer-Controlled Content Library
 *
 * Browse and install global library items into your company.
 * Items are developer/admin managed — no user publishing.
 * Installing creates a company-scoped editable copy.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  BookOpen, Search, Download, CheckCircle2, Loader2,
  Filter, ChevronDown, Star, RefreshCw, BookMarked,
  FileText, Shield, ClipboardList, Wrench, Calculator,
  Package, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibraryItem {
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

interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface InstalledItem {
  id: number;
  source_item_id: number;
  type: string;
  category: string | null;
  title: string;
  source_version: string;
  update_available: number;
  installed_at: string;
  updated_at: string;
  current_source_version: string | null;
  source_title: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ITEM_TYPES = [
  { value: '',               label: 'All types' },
  { value: 'policy',         label: 'Policy' },
  { value: 'procedure',      label: 'Procedure' },
  { value: 'swms',           label: 'SWMS' },
  { value: 'form',           label: 'Form' },
  { value: 'recipe',         label: 'Recipe' },
  { value: 'estimate_recipe',label: 'Estimate Recipe' },
  { value: 'scope_line',     label: 'Scope Line' },
];

const TYPE_ICONS: Record<string, React.ElementType> = {
  policy:          Shield,
  procedure:       FileText,
  swms:            AlertCircle,
  form:            ClipboardList,
  recipe:          Wrench,
  estimate_recipe: Calculator,
  scope_line:      Package,
};

const TYPE_COLORS: Record<string, string> = {
  policy:          'bg-blue-500/10 text-blue-600',
  procedure:       'bg-purple-500/10 text-purple-600',
  swms:            'bg-red-500/10 text-red-600',
  form:            'bg-emerald-500/10 text-emerald-600',
  recipe:          'bg-amber-500/10 text-amber-600',
  estimate_recipe: 'bg-orange-500/10 text-orange-600',
  scope_line:      'bg-teal-500/10 text-teal-600',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? BookOpen;
  const color = TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-500';
  const label = ITEM_TYPES.find((t) => t.value === type)?.label ?? type;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

function StarRating({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-xs text-slate-400">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-500">
      <Star size={11} fill="currentColor" />
      {avg.toFixed(1)}
      <span className="text-slate-400">({count})</span>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LibraryPage() {
  // ── Browse state ─────────────────────────────────────────────────────────
  const [items, setItems]           = useState<LibraryItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, pages: 0 });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [page, setPage]             = useState(1);

  // ── Installed tab ─────────────────────────────────────────────────────────
  const [tab, setTab]               = useState<'browse' | 'installed'>('browse');
  const [installed, setInstalled]   = useState<InstalledItem[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);

  // ── Install state ─────────────────────────────────────────────────────────
  const [installing, setInstalling] = useState<number | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set());
  const [installMsg, setInstallMsg] = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch browse items ────────────────────────────────────────────────────
  const fetchItems = useCallback(async (opts: {
    search?: string; type?: string; category?: string; page?: number;
  } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts.search)   params.set('search',   opts.search);
      if (opts.type)     params.set('type',     opts.type);
      if (opts.category) params.set('category', opts.category);
      params.set('page',  String(opts.page ?? 1));
      params.set('limit', '20');

      const res = await fetch(`/api/library/items?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ok: boolean; items: LibraryItem[]; pagination: Pagination };
      setItems(data.items ?? []);
      setPagination(data.pagination ?? { total: 0, page: 1, limit: 20, pages: 0 });
    } catch (e) {
      setError('Failed to load library. Please try again.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch installed ───────────────────────────────────────────────────────
  const fetchInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const res = await fetch('/api/library/my-installed?limit=200', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ok: boolean; items: InstalledItem[] };
      setInstalled(data.items ?? []);
      setInstalledIds(new Set((data.items ?? []).map((i) => i.source_item_id)));
    } catch (e) {
      console.error(e);
    } finally {
      setInstalledLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchItems({ search, type: typeFilter, category: catFilter, page });
    void fetchInstalled();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change (debounce search)
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      void fetchItems({ search, type: typeFilter, category: catFilter, page: 1 });
    }, 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, catFilter]);

  // Re-fetch when page changes
  useEffect(() => {
    void fetchItems({ search, type: typeFilter, category: catFilter, page });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Install handler ───────────────────────────────────────────────────────
  async function handleInstall(item: LibraryItem) {
    setInstalling(item.id);
    setInstallMsg(null);
    try {
      const res = await fetch(`/api/library/items/${item.id}/install`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { ok: boolean; message: string; alreadyInstalled?: boolean };
      setInstallMsg({ id: item.id, msg: data.message ?? (res.ok ? 'Installed.' : 'Failed.'), ok: res.ok });
      if (res.ok) {
        setInstalledIds((prev) => new Set([...prev, item.id]));
        void fetchInstalled();
      }
    } catch (e) {
      setInstallMsg({ id: item.id, msg: 'Install failed. Please try again.', ok: false });
    } finally {
      setInstalling(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={20} className="text-orange-500" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Content Library</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Browse and install templates into your company. Your installed copies are fully editable.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 w-fit">
              {(['browse', 'installed'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    if (t === 'installed') void fetchInstalled();
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    tab === t
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t === 'browse' ? (
                    <span className="flex items-center gap-1.5"><BookOpen size={14} />Browse</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <BookMarked size={14} />
                      Installed
                      {installedIds.size > 0 && (
                        <span className="bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full">
                          {installedIds.size}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Browse tab ─────────────────────────────────────────────── */}
            {tab === 'browse' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-3">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search title, summary, tags…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
                    />
                  </div>

                  {/* Type filter */}
                  <div className="relative">
                    <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="appearance-none bg-white border border-slate-200 rounded-lg pl-8 pr-7 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Refresh */}
                  <button
                    onClick={() => void fetchItems({ search, type: typeFilter, category: catFilter, page })}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                    <AlertCircle size={15} />
                    {error}
                  </div>
                )}

                {/* Results count */}
                {!loading && !error && (
                  <p className="text-xs text-slate-400">
                    {pagination.total === 0
                      ? 'No items found'
                      : `${pagination.total} item${pagination.total !== 1 ? 's' : ''} — page ${pagination.page} of ${pagination.pages}`}
                  </p>
                )}

                {/* Loading skeleton */}
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

                {/* Items list */}
                {!loading && items.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {items.map((item) => {
                      const isInstalled = installedIds.has(item.id);
                      const isInstalling = installing === item.id;
                      const msg = installMsg?.id === item.id ? installMsg : null;

                      return (
                        <div
                          key={item.id}
                          className="bg-white border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-primary/40 hover:shadow-sm transition-all duration-150"
                        >
                          {/* Type icon */}
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 border border-slate-200">
                            {(() => { const Icon = TYPE_ICONS[item.type] ?? BookOpen; return <Icon size={14} className="text-slate-500" />; })()}
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

                          {/* Right: rating + install + download */}
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
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download size={11} />
                                <span className="hidden sm:inline">Download</span>
                              </a>
                            )}

                            {isInstalled ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                                <CheckCircle2 size={13} />
                                Installed
                              </span>
                            ) : (
                              <button
                                onClick={() => void handleInstall(item)}
                                disabled={isInstalling}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                              >
                                {isInstalling ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Download size={12} />
                                )}
                                {isInstalling ? 'Installing…' : 'Install'}
                              </button>
                            )}
                          </div>

                          {/* Install message */}
                          {msg && (
                            <p className={`text-xs px-2 py-1 rounded ${msg.ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                              {msg.msg}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Empty state */}
                {!loading && !error && items.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <BookOpen size={36} className="text-slate-300" />
                    <p className="text-slate-500 text-sm">No library items found.</p>
                    {(search || typeFilter) && (
                      <button
                        onClick={() => { setSearch(''); setTypeFilter(''); }}
                        className="text-xs text-orange-500 hover:text-orange-600 underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || loading}
                      className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-slate-400">
                      Page {pagination.page} of {pagination.pages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                      disabled={page >= pagination.pages || loading}
                      className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Installed tab ───────────────────────────────────────────── */}
            {tab === 'installed' && (
              <div className="space-y-4">
                {installedLoading && (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    Loading installed items…
                  </div>
                )}

                {!installedLoading && installed.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <BookMarked size={36} className="text-slate-300" />
                    <p className="text-slate-500 text-sm">No items installed yet.</p>
                    <button
                      onClick={() => setTab('browse')}
                      className="text-xs text-orange-500 hover:text-orange-600 underline"
                    >
                      Browse the library
                    </button>
                  </div>
                )}

                {!installedLoading && installed.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {installed.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-primary/40 hover:shadow-sm transition-all duration-150"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 border border-slate-200">
                          {(() => { const Icon = TYPE_ICONS[item.type] ?? BookOpen; return <Icon size={14} className="text-slate-500" />; })()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 truncate">{item.title}</span>
                            <TypeBadge type={item.type} />
                            {item.update_available ? (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                                Update available
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">v{item.source_version}</span>
                            )}
                          </div>
                          {item.category && (
                            <p className="text-xs text-slate-400 mt-0.5">{item.category}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-slate-400">
                          <span className="hidden sm:block">Installed {new Date(item.installed_at).toLocaleDateString('en-AU')}</span>
                          <CheckCircle2 size={15} className="text-emerald-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
  );
}
export { LibraryPage as LibraryContent };

// ── /library route — redirect to Studio Library tab ──────────────────────────
export default function LibraryRedirect() {
  return (
    <>
      <Helmet>
        <title>Library — IWILLBUILD</title>
        <meta name="description" content="Browse and install safety, compliance and document templates for your trades business." />
        <link rel="canonical" href="https://iwillbuild.com/library" />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <Navigate to="/studio?tab=library" replace />
    </>
  );
}
