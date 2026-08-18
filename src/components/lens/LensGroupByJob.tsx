/**
 * LensGroupByJob
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the "Group by Job" view for the Lens gallery.
 *
 * - Collapsible job headers (Plan Manager style)
 * - 4-column square thumbnail grid inside each job section
 * - Upload / Camera launched from an expanded job pre-seeds that job ID
 * - Selection mode works across all expanded sections
 * - No duplicate records; uses the same LensPhoto[] passed from the parent
 */

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, Briefcase, Camera, Upload,
  ImageOff, CheckSquare, Square, ExternalLink,
} from 'lucide-react';
import { type LensPhoto } from './lensTypes';
import { type LensJobOption } from './LensJobPickerSheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return '';
  }
}

function photoAlt(p: LensPhoto): string {
  return p.label ?? p.caption ?? p.originalName ?? `Photo ${p.id}`;
}

// ── Job group ─────────────────────────────────────────────────────────────────

interface JobGroup {
  jobId: number;
  jobNumber: string | null;
  jobName: string | null;
  latestDate: string;
  photos: LensPhoto[];
}

function buildGroups(photos: LensPhoto[]): JobGroup[] {
  const map = new Map<number, JobGroup>();
  for (const p of photos) {
    let g = map.get(p.jobId);
    if (!g) {
      g = {
        jobId: p.jobId,
        jobNumber: p.jobNumber,
        jobName: p.jobName,
        latestDate: p.createdAt,
        photos: [],
      };
      map.set(p.jobId, g);
    }
    g.photos.push(p);
    if (p.createdAt > g.latestDate) g.latestDate = p.createdAt;
  }
  return Array.from(map.values()).sort((a, b) =>
    b.latestDate.localeCompare(a.latestDate)
  );
}

/** Build a LensJobOption from a JobGroup so we can pre-seed Upload/Camera */
function groupToJobOption(g: JobGroup): LensJobOption {
  return {
    id: g.jobId,
    jobNumber: g.jobNumber,
    name: g.jobName ?? 'Unnamed job',
    status: 'active',
  };
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
          alt={photoAlt(photo)}
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

// ── Job section ───────────────────────────────────────────────────────────────

interface JobSectionProps {
  group: JobGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenPhoto: (photo: LensPhoto, allPhotos: LensPhoto[]) => void;
  onUpload: (job: LensJobOption) => void;
  onCamera: (job: LensJobOption) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

function JobSection({
  group, expanded, onToggle, onOpenPhoto, onUpload, onCamera,
  selectionMode, selectedIds, onToggleSelect,
}: JobSectionProps) {
  const label = group.jobNumber
    ? `${group.jobNumber} — ${group.jobName ?? 'Unnamed job'}`
    : (group.jobName ?? 'Unnamed job');

  const jobOption = groupToJobOption(group);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Briefcase size={13} className="text-violet-600" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{label}</p>
          <p className="text-xs text-slate-400">
            {group.photos.length} photo{group.photos.length !== 1 ? 's' : ''} · {formatDate(group.latestDate)}
          </p>
        </div>

        {/* Upload / Camera quick-actions (desktop, only when expanded) */}
        {expanded && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onUpload(jobOption)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 transition-colors min-h-[32px]"
            >
              <Upload size={12} /> Upload
            </button>
            <button
              type="button"
              onClick={() => onCamera(jobOption)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs transition-colors min-h-[32px]"
            >
              <Camera size={12} /> Camera
            </button>
          </div>
        )}

        <div className="shrink-0 text-slate-400 ml-1">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* Expanded grid */}
      {expanded && (
        <div className="px-2 pb-2 pt-1 border-t border-slate-100">
          {/* Mobile upload/camera row */}
          <div className="flex gap-2 mb-2 md:hidden">
            <button
              type="button"
              onClick={() => onUpload(jobOption)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 transition-colors min-h-[40px]"
            >
              <Upload size={13} /> Upload
            </button>
            <button
              type="button"
              onClick={() => onCamera(jobOption)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs transition-colors min-h-[40px]"
            >
              <Camera size={13} /> Camera
            </button>
          </div>

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

export interface LensGroupByJobProps {
  photos: LensPhoto[];
  onOpenPhoto: (photo: LensPhoto, contextPhotos: LensPhoto[]) => void;
  onUpload: (job: LensJobOption) => void;
  onCamera: (job: LensJobOption) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

export default function LensGroupByJob({
  photos, onOpenPhoto, onUpload, onCamera,
  selectionMode, selectedIds, onToggleSelect,
}: LensGroupByJobProps) {
  const groups = useMemo(() => buildGroups(photos), [photos]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() =>
    groups.length === 1 ? new Set([groups[0].jobId]) : new Set()
  );

  function toggleGroup(jobId: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <JobSection
          key={group.jobId}
          group={group}
          expanded={expandedIds.has(group.jobId)}
          onToggle={() => toggleGroup(group.jobId)}
          onOpenPhoto={onOpenPhoto}
          onUpload={onUpload}
          onCamera={onCamera}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
