/**
 * AssetPhotos — per-asset photo gallery
 * Upload, view, delete photos. Independent of inspections.
 */
import { useState, useEffect } from 'react';
import { Camera, Plus, Trash2, Loader2, X, ZoomIn } from 'lucide-react';
import { useUploadQueue } from '@/hooks/useUploadQueue';

interface AssetPhoto {
  id: number;
  file_path: string;
  file_name: string;
  caption: string | null;
  created_at: string;
}

export default function AssetPhotos({ assetId }: { assetId: number }) {
  const [photos, setPhotos] = useState<AssetPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<AssetPhoto | null>(null);

  const q = useUploadQueue({
    endpoint: `/api/asset-manager/assets/${assetId}/photos`,
    fieldName: 'file',
    accept: 'image/*',
    multiple: true,
    onSuccess: () => { void load(); },
  });
  const uploading = q.isUploading;
  const fileRef = q.inputRef;

  useEffect(() => { load(); }, [assetId]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/asset-manager/assets/${assetId}/photos`, { credentials: 'include' });
      const d = await r.json() as { photos?: AssetPhoto[] };
      setPhotos(d.photos ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  async function deletePhoto(id: number) {
    if (!confirm('Delete this photo?')) return;
    const r = await fetch(`/api/asset-manager/assets/${assetId}/photos/${id}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (r.ok) {
      setPhotos(prev => prev.filter(p => p.id !== id));
      if (lightbox?.id === id) setLightbox(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">{photos.length} Photo{photos.length !== 1 ? 's' : ''}</h3>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {uploading ? 'Uploading…' : 'Add Photos'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={q.handleInputChange}
        />
      </div>

      {/* Drop zone when empty */}
      {photos.length === 0 && (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-2xl hover:border-violet-300 hover:bg-violet-50/30 transition-all text-center cursor-pointer"
        >
          <div className="text-slate-300 mb-3"><Camera size={32} /></div>
          <p className="text-sm font-semibold text-slate-500">No photos yet</p>
          <p className="text-xs text-slate-400 mt-1">Click to upload asset photos</p>
        </button>
      )}

      {/* Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 hover:border-violet-300 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setLightbox(photo)}>
              <img
                src={photo.file_path}
                alt={photo.caption ?? photo.file_name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <ZoomIn size={20} className="text-white drop-shadow" />
              </div>
              {/* Delete button */}
              <button
                onClick={e => { e.stopPropagation(); void deletePhoto(photo.id); }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 pointer-events-auto"
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
              {/* Caption */}
              {photo.caption && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 pointer-events-none">
                  <p className="text-[10px] text-white truncate">{photo.caption}</p>
                </div>
              )}
            </div>
          ))}
          {/* Upload tile */}
          <button
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 transition-all flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-violet-600"
          >
            <Plus size={20} />
            <span className="text-[10px] font-semibold">Add</span>
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X size={18} />
          </button>
          <img
            src={lightbox.file_path}
            alt={lightbox.caption ?? lightbox.file_name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          {lightbox.caption && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-4 py-2 rounded-full">
              {lightbox.caption}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
