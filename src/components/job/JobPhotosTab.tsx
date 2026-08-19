/**
 * JobPhotosTab
 *
 * Embeds the full photos experience (grid + toolbar) inside the job-detail
 * tab panel so it stays within the sidebar layout — no full-screen navigate.
 */
import { useState, useRef } from 'react';
import { useNavigate } from "react-router";
import { Upload, Camera, Grid2x2, Grid3x3, LayoutGrid, Loader2 } from 'lucide-react';
import JobPhotos, { type JobPhotosHandle } from '@/components/JobPhotos';
type ViewSize = 'small' | 'medium' | 'large';
interface Props {
  jobId: number;
  jobName?: string;
}
export default function JobPhotosTab({
  jobId,
  jobName
}: Props) {
  const photosRef = useRef<JobPhotosHandle>(null);
  const navigate = useNavigate();
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [viewSize, setViewSizeLocal] = useState<ViewSize>(() => {
    try {
      const s = localStorage.getItem('jobPhotosZoom');
      if (s === 'small' || s === 'medium' || s === 'large') return s;
    } catch (_) {}
    return window.innerWidth < 768 ? 'small' : 'medium';
  });
  const atLimit = photoCount >= 200;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSetViewSize = (s: ViewSize) => {
    setViewSizeLocal(s);
    photosRef.current?.setViewSize(s);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return <div className="flex flex-col gap-0 -m-4 md:-m-6">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white border-b border-border sticky top-0 z-10 flex-wrap">

        {/* Photo count */}
        <span className="text-xs text-muted-foreground mr-1 shrink-0">
          {photoCount} photo{photoCount !== 1 ? 's' : ''}
        </span>

        {/* Upload — icon only, no fill */}
        <button onClick={() => photosRef.current?.openFilePicker()} disabled={uploading || atLimit} title="Upload photos" className="flex items-center justify-center w-8 h-8 border border-border hover:bg-muted disabled:opacity-50 text-foreground rounded-lg transition-colors">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        </button>

        {/* Camera — bigger, purple */}
        <button onClick={() => navigate(`/jobs/${jobId}/camera`)} disabled={uploading || atLimit} title="Take a photo" className="flex items-center justify-center w-8 h-8 bg-primary hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition-colors">
          <Camera size={16} />
        </button>

        {/* View size toggle */}
        <div className="ml-auto flex items-center bg-muted rounded-lg overflow-hidden shrink-0">
          {(['small', 'medium', 'large'] as const).map(size => <button key={size} onClick={() => handleSetViewSize(size)} title={`${size.charAt(0).toUpperCase() + size.slice(1)} thumbnails`} className={`px-2 py-1.5 text-xs font-semibold transition-colors ${viewSize === size ? 'bg-white text-gray-800 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {size === 'small' ? <Grid3x3 size={12} /> : size === 'medium' ? <Grid2x2 size={12} /> : <LayoutGrid size={12} />}
            </button>)}
        </div>
      </div>

      {/* ── Photo grid ── */}
      <div className="px-2 py-2 md:px-4 md:py-4">
        <JobPhotos ref={photosRef} jobId={jobId} onPhotoCount={setPhotoCount} onUploading={setUploading} />
      </div>
    </div>;
}
