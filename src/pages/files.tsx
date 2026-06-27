/**
 * /files — Main company files page.
 * Uses the shared FilePanel component (same as job/fleet tabs).
 */
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { FolderOpen, Menu } from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import FilePanel from '@/components/FilePanel';
import { fetchFiles, type CompanyFile, formatBytes } from '@/lib/files-api';

export default function FilesPage() {
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchFiles();
      setFiles(data);
    } catch { /* FilePanel shows its own error */ }
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <div className="portal-page">
      <Helmet>
        <title>Files — IWILLBUILD Portal</title>
        <meta name="description" content="Store and organise job files, plans and documents in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/files" />
        <meta name="robots" content="noindex" />
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
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {/* Stats row */}
          {loaded && files.length > 0 && (
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
  );
}
