/**
 * /library — Developer-Controlled Content Library
 *
 * Browse and install global library items into your company.
 * Items are developer/admin managed — no user publishing.
 * Installing creates a company-scoped editable copy.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import PortalSidebar from '@/components/PortalSidebar';
import {
  BookOpen, Search, Download, CheckCircle2, Loader2,
  Filter, ChevronDown, Star, Tag, RefreshCw, BookMarked,
  FileText, Shield, ClipboardList, Wrench, Calculator,
  Package, AlertCircle, ExternalLink,
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
  policy:          'bg-blue-500/15 text-blue-300',
  procedure:       'bg-purple-500/15 text-purple-300',
  swms:            'bg-red-500/15 text-red-300',
  form:            'bg-green-500/15 text-green-300',
  recipe:          'bg-amber-500/15 text-amber-300',
  estimate_recipe: 'bg-orange-500/15 text-orange-300',
  scope_line:      'bg-teal-500/15 text-teal-300',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? BookOpen;
  const color = TYPE_COLORS[type] ?? 'bg-slate-500/15 text-slate-300';
  const label = ITEM_TYPES.find((t) => t.value === type)?.label ?? type;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

function StarRating({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return <span className="text-xs text-white/30">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-400">
      <Star size={11} fill="currentColor" />
      {avg.toFixed(1)}
      <span className="text-white/30">({count})</span>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LibraryPage() {
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
    <>
      <Helmet>
        <title>Content Library — IWILLBUILD Portal</title>
        <meta name="description" content="Browse and install developer-managed content templates into your company." />
        <link rel="canonical" href="https://iwillbuild.com/library" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex h-screen overflow-hidden bg-[#0F1117]">
        <PortalSidebar />

        <main className="flex-1 overflow-y-auto portal-main">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={20} className="text-orange-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Content Library</h1>
                  <p className="text-sm text-white/50 mt-0.5">
                    Browse and install templates into your company. Your installed copies are fully editable.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
              {(['browse', 'installed'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    if (t === 'installed') void fetchInstalled();
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    tab === t
                      ? 'bg-orange-500 text-white'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {t === 'browse' ? (
                    <span className="flex items-center gap-1.5"><BookOpen size={14} />Browse</span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <BookMarked size={14} />
                      Installed
                      {installedIds.size > 0 && (
                        <span className="bg-orange-500/20 text-orange-300 text-xs px-1.5 py-0.5 rounded-full">
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
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search title, summary, tags…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40"
                    />
                  </div>

                  {/* Type filter */}
                  <div className="relative">
                    <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="appearance-none bg-white/5 border border-white/10 rounded-lg pl-8 pr-7 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t.value} value={t.value} className="bg-[#1a1d27]">{t.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  </div>

                  {/* Refresh */}
                  <button
                    onClick={() => void fetchItems({ search, type: typeFilter, category: catFilter, page })}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">
                    <AlertCircle size={15} />
                    {error}
                  </div>
                )}

                {/* Results count */}
                {!loading && !error && (
                  <p className="text-xs text-white/40">
                    {pagination.total === 0
                      ? 'No items found'
                      : `${pagination.total} item${pagination.total !== 1 ? 's' : ''} — page ${pagination.page} of ${pagination.pages}`}
                  </p>
                )}

                {/* Loading skeleton */}
                {loading && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-white/5 border border-white/8 rounded-xl p-4 animate-pulse">
                        <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-white/8 rounded w-1/2 mb-3" />
                        <div className="h-3 bg-white/6 rounded w-full" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Items grid */}
                {!loading && items.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((item) => {
                      const isInstalled = installedIds.has(item.id);
                      const isInstalling = installing === item.id;
                      const msg = installMsg?.id === item.id ? installMsg : null;

                      return (
                        <div
                          key={item.id}
                          className="bg-white/4 border border-white/8 rounded-xl p-4 flex flex-col gap-3 hover:border-white/15 transition-colors"
                        >
                          {/* Top row */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <TypeBadge type={item.type} />
                                {item.category && (
                                  <span className="text-xs text-white/40">{item.category}</span>
                                )}
                              </div>
                              <h3 className="text-sm font-semibold text-white leading-snug">{item.title}</h3>
                            </div>
                          </div>

                          {/* Summary */}
                          {item.summary && (
                            <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{item.summary}</p>
                          )}

                          {/* Tags */}
                          {item.tags && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <Tag size={10} className="text-white/25 flex-shrink-0" />
                              {item.tags.split(',').slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  onClick={() => setCatFilter(tag.trim())}
                                  className="text-xs text-white/35 bg-white/5 rounded px-1.5 py-0.5 cursor-pointer hover:text-white/60 hover:bg-white/10 transition-colors"
                                >
                                  {tag.trim()}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Footer */}
                          <div className="flex items-center justify-between gap-2 mt-auto pt-1 border-t border-white/6">
                            <div className="flex items-center gap-3">
                              <StarRating avg={Number(item.avg_rating)} count={item.rating_count} />
                              <span className="text-xs text-white/30 flex items-center gap-1">
                                <Download size={10} />
                                {item.install_count}
                              </span>
                              <span className="text-xs text-white/25">v{item.version}</span>
                            </div>

                            {/* Install button */}
                            {isInstalled ? (
                              <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
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
                            <p className={`text-xs px-2 py-1 rounded ${msg.ok ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-red-500/10'}`}>
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
                    <BookOpen size={36} className="text-white/15" />
                    <p className="text-white/40 text-sm">No library items found.</p>
                    {(search || typeFilter) && (
                      <button
                        onClick={() => { setSearch(''); setTypeFilter(''); }}
                        className="text-xs text-orange-400 hover:text-orange-300 underline"
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
                      className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white/60 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-white/40">
                      Page {pagination.page} of {pagination.pages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                      disabled={page >= pagination.pages || loading}
                      className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white/60 hover:text-white disabled:opacity-30 transition-colors"
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
                  <div className="flex items-center gap-2 text-sm text-white/40">
                    <Loader2 size={14} className="animate-spin" />
                    Loading installed items…
                  </div>
                )}

                {!installedLoading && installed.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <BookMarked size={36} className="text-white/15" />
                    <p className="text-white/40 text-sm">No items installed yet.</p>
                    <button
                      onClick={() => setTab('browse')}
                      className="text-xs text-orange-400 hover:text-orange-300 underline"
                    >
                      Browse the library
                    </button>
                  </div>
                )}

                {!installedLoading && installed.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {installed.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white/4 border border-white/8 rounded-xl p-4 flex flex-col gap-2 hover:border-white/15 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <TypeBadge type={item.type} />
                              {item.update_available ? (
                                <span className="text-xs bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                                  Update available
                                </span>
                              ) : (
                                <span className="text-xs text-white/25">v{item.source_version}</span>
                              )}
                            </div>
                            <h3 className="text-sm font-semibold text-white leading-snug">{item.title}</h3>
                            {item.category && (
                              <p className="text-xs text-white/40 mt-0.5">{item.category}</p>
                            )}
                          </div>
                          <CheckCircle2 size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/6 text-xs text-white/30">
                          <span>Installed {new Date(item.installed_at).toLocaleDateString('en-AU')}</span>
                          <span>Updated {new Date(item.updated_at).toLocaleDateString('en-AU')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  );
}
