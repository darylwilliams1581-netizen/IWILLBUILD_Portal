/**
 * /files — Main company files page.
 * Standalone full-page layout — matches fleet.tsx pattern.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { FolderOpen, ArrowLeft } from 'lucide-react';
import FilePanel from '@/components/FilePanel';
import { fetchFiles, type CompanyFile, formatBytes } from '@/lib/files-api';
import { Skeleton } from '@/components/ui/skeleton';
import PageError from '@/components/ui/PageError';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';

export default function FilesPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await fetchFiles();
      setFiles(data);
    } catch {
      setLoadError(true);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

  return (
    <div className="flex-1 bg-gray-50 flex flex-col lg-portal">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Files — IWILLBUILD Portal</title>
        <meta name="description" content="Store and organise job files, plans and documents in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/files" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Files — IWILLBUILD Portal" />
        <meta property="og:description" content="Store and organise job files, plans and documents in the IWILLBUILD portal." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/files" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Files — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Store and organise job files, plans and documents in the IWILLBUILD portal." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      {/* Sticky top bar */}
      <header className="sticky top-0 z-30 h-14 md:h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 safe-top">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/home')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Back to Home"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Home</span>
          </button>
          <span className="text-slate-300">|</span>
          <FolderOpen size={18} className="text-primary shrink-0" />
          <h1 className="font-heading font-bold text-base truncate">Files</h1>
          {loaded && (
            <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="w-full">

          {/* Loading skeleton for stats */}
          {!loaded && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-7 w-12 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {loaded && loadError && (
            <PageError message="Could not load files. Please try again." onRetry={load} />
          )}

          {/* Stats row */}
          {loaded && !loadError && files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Files</p>
                <p className="font-heading font-black text-2xl text-slate-800">{files.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Total Size</p>
                <p className="font-heading font-black text-2xl text-slate-800">{formatBytes(totalSize)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Job Files</p>
                <p className="font-heading font-black text-2xl text-slate-800">{files.filter(f => f.jobId).length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Fleet Files</p>
                <p className="font-heading font-black text-2xl text-slate-800">{files.filter(f => f.fleetAssetId).length}</p>
              </div>
            </div>
          )}

          {/* Shared FilePanel */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-visible">
            <FilePanel showCategoryFilter={true} />
          </div>

        </div>
      </div>
    </div>
  );
}
