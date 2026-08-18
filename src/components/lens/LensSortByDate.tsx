/**
 * LensSortByDate
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders photos grouped by day, sorted newest-first or oldest-first.
 * Each day header shows the date and photo count.
 * Square thumbnails, 4-col mobile grid, same selection/lightbox wiring as
 * the main All Photos view.
 */

import { useMemo } from 'react';
import { Calendar, ImageOff, CheckSquare, Square, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { type LensPhoto } from './lensTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayKey(iso: string): string {
  // Returns "YYYY-MM-DD" in local time
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDayLabel(key: string): string {
  try {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const todayKey = dayKey(today.toISOString());
    const yestKey  = dayKey(yesterday.toISOString());

    if (key === todayKey)  return 'Today';
    if (key === yestKey)   return 'Yesterday';

    return date.toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return key;
  }
}

interface DayGroup {
  key: string;
  label: string;
  photos: LensPhoto[];
}

function buildDayGroups(photos: LensPhoto[], order: 'newest' | 'oldest'): DayGroup[] {
  const map = new Map<string, LensPhoto[]>();
  for (const p of photos) {
    const k = dayKey(p.createdAt);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  const keys = Array.from(map.keys()).sort((a, b) =>
    order === 'newest' ? b.localeCompare(a) : a.localeCompare(b)
  );
  return keys.map((k) => ({
    key: k,
    label: formatDayLabel(k),
    photos: map.get(k)!,
  }));
}

// ── Square thumbnail ──────────────────────────────────────────────────────────

interface ThumbProps {
  photo: LensPhoto;
  onOpen: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
}

function Thumb({ photo, onOpen, selectionMode, selected, onToggleSelect }: ThumbProps) {
  const [imgError, setImgError] = useState(false);
  const alt = photo.label ?? photo.caption ?? photo.originalName ?? `Photo ${photo.id}`;

  function handleClick() {
    if (selectionMode) onToggleSelect(photo.id);
    else onOpen();
  }

  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-sm cursor-pointer bg-slate-200 ${
        selectionMode && selected ? 'ring-2 ring-violet-500 ring-offset-1' : ''
      }`}
      onClick={handleClick}
    >
      {imgError ? (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <ImageOff size={20} />
        </div>
      ) : (
        <img
          src={photo.thumbnailUrl}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      )}

      {selectionMode && (
        <div className="absolute inset-0 pointer-events-none">
          {selected && <div className="absolute inset-0 bg-violet-600/20" />}
          <div className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center ${
            selected ? 'bg-violet-600 text-white' : 'bg-white/80 text-slate-400 border border-slate-300'
          }`}>
            {selected ? <CheckSquare size={12} /> : <Square size={12} />}
          </div>
        </div>
      )}

      {selectionMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 pointer-events-auto"
          aria-label="Preview photo"
        >
          <ExternalLink size={10} />
        </button>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface LensSortByDateProps {
  photos: LensPhoto[];
  order: 'newest' | 'oldest';
  onOpenPhoto: (photo: LensPhoto, contextPhotos: LensPhoto[]) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

export default function LensSortByDate({
  photos, order, onOpenPhoto, selectionMode, selectedIds, onToggleSelect,
}: LensSortByDateProps) {
  const groups = useMemo(() => buildDayGroups(photos, order), [photos, order]);

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key}>
          {/* Day header */}
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={13} className="text-slate-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {group.label}
            </span>
            <span className="text-xs text-slate-400">
              · {group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1">
            {group.photos.map((photo) => (
              <Thumb
                key={photo.id}
                photo={photo}
                onOpen={() => onOpenPhoto(photo, group.photos)}
                selectionMode={selectionMode}
                selected={selectedIds.has(photo.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
