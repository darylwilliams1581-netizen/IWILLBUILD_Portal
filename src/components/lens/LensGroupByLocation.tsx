/**
 * LensGroupByLocation
 * ─────────────────────────────────────────────────────────────────────────────
 * Groups photos by jobAddress (falls back to job name when address is null).
 * Collapsible sections, same square-thumbnail grid as Group by Job.
 */

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, MapPin, ImageOff, CheckSquare, Square, ExternalLink,
} from 'lucide-react';
import { type LensPhoto } from './lensTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function locationKey(p: LensPhoto): string {
  return p.jobAddress ?? p.jobName ?? `Job ${p.jobId}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return '';
  }
}

interface LocationGroup {
  key: string;
  latestDate: string;
  photos: LensPhoto[];
}

function buildGroups(photos: LensPhoto[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
  for (const p of photos) {
    const k = locationKey(p);
    let g = map.get(k);
    if (!g) {
      g = { key: k, latestDate: p.createdAt, photos: [] };
      map.set(k, g);
    }
    g.photos.push(p);
    if (p.createdAt > g.latestDate) g.latestDate = p.createdAt;
  }
  return Array.from(map.values()).sort((a, b) =>
    b.latestDate.localeCompare(a.latestDate)
  );
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

// ── Location section ──────────────────────────────────────────────────────────

interface LocationSectionProps {
  group: LocationGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenPhoto: (photo: LensPhoto, allPhotos: LensPhoto[]) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

function LocationSection({
  group, expanded, onToggle, onOpenPhoto,
  selectionMode, selectedIds, onToggleSelect,
}: LocationSectionProps) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <MapPin size={13} className="text-emerald-600" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{group.key}</p>
          <p className="text-xs text-slate-400">
            {group.photos.length} photo{group.photos.length !== 1 ? 's' : ''} · {formatDate(group.latestDate)}
          </p>
        </div>

        <div className="shrink-0 text-slate-400 ml-1">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="px-2 pb-2 pt-1 border-t border-slate-100">
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
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
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface LensGroupByLocationProps {
  photos: LensPhoto[];
  onOpenPhoto: (photo: LensPhoto, contextPhotos: LensPhoto[]) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

export default function LensGroupByLocation({
  photos, onOpenPhoto, selectionMode, selectedIds, onToggleSelect,
}: LensGroupByLocationProps) {
  const groups = useMemo(() => buildGroups(photos), [photos]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() =>
    groups.length === 1 ? new Set([groups[0].key]) : new Set()
  );

  function toggleGroup(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <LocationSection
          key={group.key}
          group={group}
          expanded={expandedKeys.has(group.key)}
          onToggle={() => toggleGroup(group.key)}
          onOpenPhoto={onOpenPhoto}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
