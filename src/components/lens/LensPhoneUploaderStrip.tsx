import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, Trash2, X } from 'lucide-react';
import {
  getPhotoRuntimeStatus,
  openPhotoStoreReadonly,
  PHOTO_STORE_CHANGED_EVENT,
  removePhoto,
  type StoredPhoto,
} from '@/lib/offlinePhotoStore';
import { deleteLocalPhoto, readLocalPhoto } from '@/lib/capturePhotoLocally';

type PhonePhotoStatus = 'saved' | 'sending' | 'failed';

interface PhonePhoto {
  stored: StoredPhoto;
  previewUrl: string | null;
  status: PhonePhotoStatus;
}

function displayStatus(photo: StoredPhoto): PhonePhotoStatus | null {
  const runtimeStatus = getPhotoRuntimeStatus(photo.clientId);
  if (runtimeStatus === 'synced') return null;
  if (runtimeStatus === 'preparing' || runtimeStatus === 'uploading') return 'sending';
  if (runtimeStatus === 'failed') return 'failed';
  if (runtimeStatus === 'saved') return 'saved';
  return photo.attempts > 0 ? 'failed' : 'saved';
}

function statusClasses(status: PhonePhotoStatus): string {
  if (status === 'sending') return 'bg-violet-600 text-white';
  if (status === 'failed') return 'bg-red-600 text-white';
  return 'bg-slate-900/75 text-white';
}

export default function LensPhoneUploaderStrip() {
  const [items, setItems] = useState<PhonePhoto[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<PhonePhoto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);
  const loadGenerationRef = useRef(0);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPhonePhotos = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const storedPhotos = (await openPhotoStoreReadonly())
      .sort((a, b) => b.capturedAt - a.capturedAt);
    const nextItems: PhonePhoto[] = [];
    const nextUrls: string[] = [];

    for (const stored of storedPhotos) {
      const status = displayStatus(stored);
      if (!status) continue;

      let file: File | null = stored.file ?? null;
      if ((!file || file.size === 0) && stored.localPath) {
        file = await readLocalPhoto(stored.localPath, stored.fileName, stored.mimeType);
      }

      let previewUrl: string | null = null;
      if (file && file.size > 0) {
        try {
          previewUrl = URL.createObjectURL(file);
          nextUrls.push(previewUrl);
        } catch {
          previewUrl = null;
        }
      }

      nextItems.push({
        stored,
        previewUrl,
        status: previewUrl ? status : 'failed',
      });
    }

    if (generation !== loadGenerationRef.current) {
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
      return;
    }

    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = nextUrls;
    setItems(nextItems);
  }, []);

  const schedulePhonePhotosLoad = useCallback(() => {
    if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = window.setTimeout(() => {
      loadTimerRef.current = null;
      void loadPhonePhotos();
    }, 350);
  }, [loadPhonePhotos]);

  useEffect(() => {
    schedulePhonePhotosLoad();
    const refresh = () => schedulePhonePhotosLoad();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener(PHOTO_STORE_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      loadGenerationRef.current += 1;
      if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
      window.removeEventListener(PHOTO_STORE_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
    };
  }, [schedulePhonePhotosLoad]);

  const confirmRemove = useCallback(async () => {
    if (!deleteTarget || deleteTarget.status === 'sending') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removePhoto(deleteTarget.stored.clientId);
      if (deleteTarget.stored.localPath) {
        await deleteLocalPhoto(deleteTarget.stored.localPath);
      }
      setDeleteTarget(null);
      schedulePhonePhotosLoad();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not remove this photo');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, schedulePhonePhotosLoad]);

  if (items.length === 0) return null;
  const isSending = items.some((item) => item.status === 'sending');

  return (
    <section className="mb-4 rounded-2xl border border-violet-200 bg-white p-3 shadow-sm" aria-label="Photos waiting on this phone">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">On this phone</h2>
          <p className="text-[11px] text-slate-500">Uploads disappear here after they reach the job library.</p>
        </div>
        <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isSending ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
          {isSending && <Loader2 size={12} className="animate-spin" />}
          {isSending ? 'Sending…' : `${items.length} on phone`}
        </div>
      </div>

      <div className="flex snap-x gap-1.5 overflow-x-auto pb-1">
        {items.map((item) => (
          <div key={item.stored.clientId} className="group relative aspect-square w-[23%] min-w-[76px] max-w-[112px] shrink-0 snap-start overflow-hidden rounded-sm bg-slate-200">
            {item.previewUrl ? (
              <img src={item.previewUrl} alt={item.stored.fileName} className="h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <ImageOff size={24} />
              </div>
            )}

            <span className={`absolute bottom-1 left-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(item.status)}`}>
              {item.status}
            </span>

            {item.status !== 'sending' && (
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteTarget(item);
                }}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
                aria-label={`Remove ${item.stored.fileName} from this phone`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Remove photo?</p>
                <p className="truncate text-xs text-slate-500">{deleteTarget.stored.fileName}</p>
              </div>
              <button type="button" onClick={() => setDeleteTarget(null)} className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-slate-500" aria-label="Cancel">
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">Remove from this phone? It has not reached the job library.</p>
            {deleteError && <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{deleteError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="min-h-[44px] flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-50">
                Keep
              </button>
              <button type="button" onClick={() => void confirmRemove()} disabled={deleting} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
