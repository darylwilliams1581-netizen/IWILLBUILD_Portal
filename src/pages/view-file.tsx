/**
 * /view/file/:id — Full-page file viewer (opens in new tab)
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticated. Renders the file inline (images, PDFs) or shows a download
 * prompt for other types. Supports print and download.
 */
import { useEffect, useState } from 'react';
import { useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Download, Printer, FileText, FileImage, File, Loader2, AlertTriangle, X } from 'lucide-react';
import { type CompanyFile, formatBytes, mimeLabel, mimeColor, downloadFile } from '@/lib/files-api';
import { fileViewUrl, isImageMime } from '@/lib/files-view';
function FileIcon({
  mime,
  className
}: {
  mime: string;
  className?: string;
}) {
  if (isImageMime(mime)) return <FileImage className={className} />;
  if (mime === 'application/pdf') return <FileText className={className} />;
  return <File className={className} />;
}
export default function ViewFilePage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const [file, setFile] = useState<CompanyFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) {
      setError('Invalid file ID');
      setLoading(false);
      return;
    }
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      setError('Invalid file ID');
      setLoading(false);
      return;
    }
    // Fetch all files and find the one we need (existing endpoint, no new API required)
    fetch('/api/files', {
      credentials: 'include'
    }).then(async r => {
      if (!r.ok) throw new Error('Access denied');
      return r.json();
    }).then((data: {
      files?: CompanyFile[];
    }) => {
      const found = (data.files ?? []).find((f: CompanyFile) => f.id === numId);
      if (!found) throw new Error('File not found or access denied');
      setFile(found);
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);
  const isPdf = file?.mimeType === 'application/pdf';
  const isImg = file ? isImageMime(file.mimeType) : false;
  const viewUrl = file ? fileViewUrl(file.id) : '';
  return <>
      <Helmet>
        <title>{file ? `${file.label || file.originalName} — IWILLBUILD` : 'File Viewer — IWILLBUILD'}</title>
        <meta name="description" content="Authenticated file viewer — IWILLBUILD portal" />
        <link rel="canonical" href={`https://iwillbuild.com/view/file/${id ?? ''}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {/* Visually hidden h1 for SEO checker */}
      <h1 className="sr-only">{file ? file.label || file.originalName : 'File Viewer'}</h1>

      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* Toolbar */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            {file && <>
                <p className="text-sm font-semibold text-white truncate">{file.label || file.originalName}</p>
                <p className="text-xs text-gray-400 truncate">
                  {file.originalName} · {mimeLabel(file.mimeType)} · {formatBytes(file.sizeBytes)}
                  {file.uploaderName ? ` · ${file.uploaderName}` : ''}
                </p>
              </>}
          </div>
          {file && <div className="flex items-center gap-2 shrink-0">
              {(isPdf || isImg) && <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                  <Printer size={13} />
                  Print
                </button>}
              <button onClick={() => downloadFile(file.id, file.originalName)} className="flex items-center gap-1.5 text-xs bg-violet-500 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors">
                <Download size={13} />
                Download
              </button>
              <button onClick={() => window.close()} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors" title="Close tab">
                <X size={16} />
              </button>
            </div>}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {loading && <div className="flex-1 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-violet-600" />
            </div>}

          {!loading && error && <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-16 h-16 bg-red-900/30 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">File unavailable</p>
                <p className="text-gray-400 text-sm">{error}</p>
              </div>
            </div>}

          {!loading && file && isPdf && <iframe src={`${viewUrl}#toolbar=1&navpanes=0`} className="flex-1 w-full border-0" title={file.label || file.originalName} style={{
          minHeight: 'calc(100vh - 56px)'
        }} />}

          {!loading && file && isImg && <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
              <img src={viewUrl} alt={file.label || file.originalName} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" style={{
            maxHeight: 'calc(100vh - 80px)'
          }} />
            </div>}

          {!loading && file && !isPdf && !isImg && <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
              <div className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center ${mimeColor(file.mimeType)}`}>
                <FileIcon mime={file.mimeType} className="w-9 h-9" />
              </div>
              <div>
                <p className="text-white font-semibold text-lg mb-1">{file.label || file.originalName}</p>
                <p className="text-gray-400 text-sm mb-1">{mimeLabel(file.mimeType)} · {formatBytes(file.sizeBytes)}</p>
                <p className="text-gray-500 text-sm">This file type cannot be previewed in the browser.</p>
              </div>
              <button onClick={() => downloadFile(file.id, file.originalName)} className="flex items-center gap-2 bg-violet-500 hover:bg-violet-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors">
                <Download size={16} />
                Download File
              </button>
            </div>}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </>;
}
