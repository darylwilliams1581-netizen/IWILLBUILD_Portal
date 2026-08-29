/**
 * ImageBlock — renders a document image block.
 *
 * Internal images (authenticated API download endpoints) are fetched with
 * credentials via useAuthImage and displayed as a blob URL. This keeps auth
 * cookies in play for same-origin API images without exposing credentials in
 * the img src attribute.
 *
 * External / slot images (airo-assets, etc.) are rendered directly.
 *
 * Broken / legacy images (expired presigned URLs, old blob: URLs, etc.) show a
 * controlled editable placeholder instead of a raw broken <img> icon.
 *
 * Print: the browser prints the DOM as-is. Blob URLs are valid during the print
 * session because the component is mounted. External URLs print directly.
 */
import { useState } from 'react';
import { Image as ImageIcon, RefreshCw } from 'lucide-react';
import { useDocumentStore } from '../useDocumentStore';
import type { ImageBlock } from '../types';
import { useAuthImage, isInternalSrc } from '../useAuthImage';

interface Props {
  block: ImageBlock;
  columnsBlockId?: string;
  columnId?: string;
}

const SZ: Record<string, string> = {
  small:  'max-w-[200px]',
  medium: 'max-w-[400px]',
  large:  'max-w-[600px]',
  full:   'w-full',
};
const AL: Record<string, string> = {
  left:   'mr-auto',
  center: 'mx-auto',
  right:  'ml-auto',
};

export default function ImageBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();
  const [nativeError, setNativeError] = useState(false);

  const upd = (p: Partial<ImageBlock>) =>
    columnsBlockId && columnId
      ? updateBlockInColumn(columnsBlockId, columnId, block.id, p)
      : updateBlock(block.id, p);

  const sz = SZ[block.size]  ?? SZ.medium;
  const al = AL[block.align] ?? AL.center;

  // Internal API images go through the auth-fetch hook (credentials: include).
  const isInternal = !!block.src && isInternalSrc(block.src);
  const { blobUrl, loading, failed: authFailed } = useAuthImage(isInternal ? block.src : undefined);

  // Display source: blob URL for internal images, raw src for everything else.
  const displaySrc = isInternal ? blobUrl : (block.src || null);

  // ── Empty block placeholder ───────────────────────────────────────────────
  if (!block.src) {
    if (mode !== 'edit') return null;
    return (
      <div
        data-testid="image-block-empty"
        className={`my-2 ${sz} ${al} border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center gap-2`}
      >
        <ImageIcon size={28} className="text-slate-300" />
        <p className="text-xs font-medium text-slate-500">Image block</p>
        <p className="text-[10px] text-slate-400">Select this block then use the inspector to add an image.</p>
      </div>
    );
  }

  // ── Loading spinner (internal image fetching) ─────────────────────────────
  if (isInternal && loading) {
    return (
      <div
        data-testid="image-block-loading"
        className={`my-2 ${sz} ${al} flex items-center justify-center h-20 rounded-lg bg-slate-50 border border-slate-200`}
      >
        <div className="w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // ── Auth-fetch failed (internal image 401/404/network error) ─────────────
  if (isInternal && authFailed) {
    return (
      <div
        data-testid="image-block-broken"
        className={`my-2 ${sz} ${al} flex flex-col items-center justify-center h-20 rounded-lg bg-amber-50 border border-amber-200 gap-1.5`}
      >
        <ImageIcon size={18} className="text-amber-400" />
        <p className="text-[10px] text-amber-600 font-medium">Image unavailable</p>
        {mode === 'edit' && (
          <p className="text-[9px] text-amber-500">Use the inspector to replace or remove this image.</p>
        )}
      </div>
    );
  }

  // ── No display src resolved ───────────────────────────────────────────────
  if (!displaySrc) return null;

  // ── Native load error (external / slot URL that failed) ──────────────────
  if (nativeError) {
    return (
      <div
        data-testid="image-block-broken"
        className={`my-2 ${sz} ${al} flex flex-col items-center justify-center h-20 rounded-lg bg-amber-50 border border-amber-200 gap-1.5`}
      >
        <ImageIcon size={18} className="text-amber-400" />
        <p className="text-[10px] text-amber-600 font-medium">Image unavailable</p>
        {mode === 'edit' && (
          <button
            onClick={() => { setNativeError(false); upd({ src: block.src }); }}
            className="flex items-center gap-1 text-[9px] text-amber-500 hover:text-amber-700 transition-colors"
          >
            <RefreshCw size={9} /> Retry
          </button>
        )}
      </div>
    );
  }

  // ── Normal render ─────────────────────────────────────────────────────────
  return (
    <div className={`my-2 ${sz} ${al}`}>
      <img
        src={displaySrc}
        alt={block.alt}
        className={`rounded ${block.preserveAspectRatio ? 'object-contain' : 'object-cover'} w-full`}
        onError={() => setNativeError(true)}
      />
      {block.caption && (
        <p className="text-xs text-slate-500 text-center mt-1 italic">{block.caption}</p>
      )}
    </div>
  );
}
