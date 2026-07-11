/**
 * /files — Main company files page.
 * Uses the shared FilePanel component (same as job/fleet tabs).
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { FolderOpen, Menu } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import FleetHeaderIcon from '@/components/FleetHeaderIcon';
import FilePanel from '@/components/FilePanel';
import JobContextTab from '@/components/JobContextTab';
import { fetchFiles, type CompanyFile, formatBytes } from '@/lib/files-api';
import { Skeleton } from '@/components/ui/skeleton';
import PageError from '@/components/ui/PageError';

export default function FilesPage() {
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

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <>
    <div className="portal-page">
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
      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={openMobileMenu}
              className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <FolderOpen size={20} className="text-primary" />
            <h1 className="font-heading font-bold text-lg">Files</h1>
            {loaded && (
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <FleetHeaderIcon />
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6">
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

          {/* Shared FilePanel — full category filter shown on main files page */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-visible">
            <FilePanel showCategoryFilter={true} />
          </div>
        </div>
      </div>
    </div>
    <JobContextTab />
    </>
  );
}
