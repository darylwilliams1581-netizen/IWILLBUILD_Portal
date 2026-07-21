/**
 * JobPhotoPicker
 * Shown inside the Image Insert panel when the document has a sourceJobId.
 * Fetches job photos from /api/jobs/:id/photos/picker and lets the user
 * click one to insert it as an image block.
 */
import { useState, useEffect } from 'react';
import { Camera, Loader2 } from 'lucide-react';

interface JobPhoto {
  id: number;
  label: string;
  thumbUrl: string | null;
  downloadUrl: string;
}

interface Props {
  jobId: number;
  size: 'small' | 'medium' | 'large' | 'full';
  align: 'left' | 'center' | 'right';
  onInsertPhoto: (src: string, alt: string) => void;
}

export default function JobPhotoPicker({ jobId, onInsertPhoto }: Props) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/jobs/${jobId}/photos/picker`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { photos?: JobPhoto[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setPhotos(d.photos ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load photos'))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={16} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return <p className="text-[10px] text-red-500 px-1">{error}</p>;
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4 gap-1.5">
        <Camera size={18} className="text-slate-300" />
        <p className="text-[10px] text-slate-400 text-center">No photos uploaded for this job yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] text-slate-400">Click a photo to insert it</p>
      <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto">
        {photos.map(photo => (
          <button
            key={photo.id}
            type="button"
            title={photo.label}
            onClick={() =>
              onInsertPhoto(
                `/api/jobs/${jobId}/photos/${photo.id}/download?inline=1`,
                photo.label
              )
            }
            className="relative aspect-square rounded overflow-hidden border border-slate-200 hover:border-primary transition-colors group"
          >
            {photo.thumbUrl ? (
              <img
                src={photo.thumbUrl}
                alt={photo.label}
                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
              />
            ) : (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                <Camera size={12} className="text-slate-400" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
