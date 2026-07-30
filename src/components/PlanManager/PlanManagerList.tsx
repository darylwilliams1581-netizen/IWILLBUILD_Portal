/**
 * PlanManagerList — Job-grouped file manager view.
 * Compact dense rows optimised for 50+ drawings.
 * Inline Share and Email actions open the ShareModal directly.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, FileText, Archive, RotateCcw, Trash2, Loader2, HardHat,
  GitBranch, ChevronDown, FolderOpen,
  Eye, Briefcase, AlertCircle, ChevronRight, Lock,
  Share2, Mail, Download,
} from 'lucide-react';
import type { Drawing } from './types';
import ShareModal from './ShareModal';

interface JobGroup {
  jobId: number;
  jobName: string;
  jobNumber: string;
  jobStatus: string;
  drawings: Drawing[];
}

interface Props {
  jobs: JobGroup[];
  unassigned: Drawing[];
  loading: boolean;
  tab: 'active' | 'archived';
  onOpen: (id: number) => void;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onReorder: (drawingId: number, direction: 'up' | 'down', jobId?: number) => Promise<void>;
  onCreateShareToken: (drawingId: number, revisionId?: number, expiryDays?: number) => Promise<{ token: string; url: string; expiresAt: string } | null>;
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ── Share modal state ─────────────────────────────────────────────────────────
interface ShareTarget {
  drawingId: number;
  drawingTitle: string;
  revisionId?: number;
}

// ── Single compact drawing row ────────────────────────────────────────────────
function DrawingRow({
  drawing, tab, jobId,
  onOpen, onArchive, onRestore, onDelete,
  onShareClick,
}: {
  drawing: Drawing;
  tab: 'active' | 'archived';
  jobId?: number;
  onOpen: (id: number) => void;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onShareClick: (target: ShareTarget) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  const hasPdf = Boolean(drawing.source_file_path);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors group min-h-[36px]">
      {/* PDF icon — tiny */}
      <div className={[
        'w-5 h-5 rounded flex items-center justify-center shrink-0',
        hasPdf ? 'text-violet-600' : 'text-slate-400',
      ].join(' ')}>
        <FileText size={12} />
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-xs font-medium text-slate-800 truncate">{drawing.title}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {drawing.revision_name && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <GitBranch size={8} />{drawing.revision_name}
            </span>
          )}
          {drawing.locked && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <Lock size={8} />
            </span>
          )}
          {!hasPdf && (
            <span className="text-[10px] text-slate-500 italic">no PDF</span>
          )}
          {drawing.updated_at && (
            <span className="text-[10px] text-slate-500 hidden sm:inline">{formatDate(drawing.updated_at)}</span>
          )}
          {(drawing.annotation_count ?? 0) > 0 && (
            <span className="text-[10px] text-slate-500 hidden md:inline">{drawing.annotation_count}✎</span>
          )}
        </div>
      </div>

      {/* Actions — always visible on mobile, hover on desktop */}
      <div className="flex items-center gap-0.5 shrink-0">
        {busy ? (
          <Loader2 size={12} className="animate-spin text-slate-400 mx-1" />
        ) : (
          <>
            {/* Open viewer */}
            {hasPdf && (
              <button
                onClick={() => onOpen(drawing.id)}
                title="Open viewer"
                className="p-1 rounded text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
              >
                <Eye size={12} />
              </button>
            )}

            {/* Share link */}
            <button
              onClick={() => onShareClick({
                drawingId: drawing.id,
                drawingTitle: drawing.title,
                revisionId: drawing.current_revision_id,
              })}
              title="Share / Email"
              className="p-1 rounded text-slate-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
            >
              <Share2 size={12} />
            </button>

            {/* Archive / Restore */}
            {tab === 'active' ? (
              <button
                onClick={() => void act(() => onArchive(drawing.id))}
                title="Archive"
                className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <Archive size={12} />
              </button>
            ) : (
              <button
                onClick={() => void act(() => onRestore(drawing.id))}
                title="Restore"
                className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <RotateCcw size={12} />
              </button>
            )}

            {/* Delete */}
            <button
              onClick={() => void act(() => onDelete(drawing.id))}
              title="Delete permanently"
              className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Job accordion group ───────────────────────────────────────────────────────
function JobGroupSection({
  group, tab, defaultOpen,
  onOpen, onArchive, onRestore, onDelete, onReorder, onShareClick,
}: {
  group: JobGroup;
  tab: 'active' | 'archived';
  defaultOpen: boolean;
  onOpen: (id: number) => void;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onReorder: (drawingId: number, direction: 'up' | 'down', jobId?: number) => Promise<void>;
  onShareClick: (target: ShareTarget) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [downloading, setDownloading] = useState(false);

  const hasPdfs = group.drawings.some(d => d.source_file_path);

  async function handleDownloadZip(e: React.MouseEvent) {
    e.stopPropagation(); // don't toggle accordion
    if (downloading || !hasPdfs) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/plan-manager/jobs/${group.jobId}/drawings-zip`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        alert(err.error ?? 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      // Use filename from Content-Disposition if available
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `drawings-${group.jobId}.zip`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Job header — compact */}
      <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <div className="w-5 h-5 rounded bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
            <Briefcase size={10} className="text-violet-600" />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800 truncate">
              {group.jobNumber ? `${group.jobNumber} — ` : ''}{group.jobName}
            </span>
            <span className="text-[10px] text-slate-500 shrink-0">
              {group.drawings.length} drawing{group.drawings.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ChevronRight size={12} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`} />
        </button>

        {/* Download ZIP button */}
        <button
          onClick={handleDownloadZip}
          disabled={downloading || !hasPdfs}
          title={hasPdfs ? 'Download all PDFs as ZIP' : 'No PDFs uploaded yet'}
          className={[
            'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors shrink-0',
            hasPdfs && !downloading
              ? 'border-violet-300 text-violet-600 hover:bg-violet-50 hover:border-violet-400'
              : 'border-slate-200 text-slate-400 cursor-not-allowed',
          ].join(' ')}
        >
          {downloading
            ? <Loader2 size={11} className="animate-spin" />
            : <Download size={11} />}
          <span className="hidden sm:inline">ZIP</span>
        </button>
      </div>

      {/* Drawings list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-t border-slate-100"
          >
            {group.drawings.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-slate-400 italic">No drawings in this job.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {group.drawings.map((d, idx) => (
                  <DrawingRow
                    key={d.id}
                    drawing={d}
                    tab={tab}
                    jobId={group.jobId}
                    onOpen={onOpen}
                    onArchive={onArchive}
                    onRestore={onRestore}
                    onDelete={onDelete}
                    onShareClick={onShareClick}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlanManagerList({
  jobs, unassigned, loading, tab,
  onOpen, onArchive, onRestore, onDelete, onReorder, onCreateShareToken,
}: Props) {
  const [search, setSearch] = useState('');
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  const filteredJobs = search
    ? jobs.map(j => ({
        ...j,
        drawings: j.drawings.filter(d => d.title.toLowerCase().includes(search.toLowerCase())),
      })).filter(j => j.drawings.length > 0 || j.jobName.toLowerCase().includes(search.toLowerCase()))
    : jobs;

  const filteredUnassigned = search
    ? unassigned.filter(d => d.title.toLowerCase().includes(search.toLowerCase()))
    : unassigned;

  const totalDrawings = jobs.reduce((s, j) => s + j.drawings.length, 0) + unassigned.length;

  // Default: expand if ≤3 jobs and total drawings ≤15; otherwise collapse all
  const defaultOpen = jobs.length <= 3 && totalDrawings <= 15;

  return (
    <div className="flex flex-col h-full bg-[#F4F5F7]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search drawings or jobs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
          />
        </div>
        <div className="text-[11px] text-slate-400 whitespace-nowrap">
          {totalDrawings} drawing{totalDrawings !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Info banner */}
      {tab === 'active' && (
        <div className="mx-4 mt-3 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          <AlertCircle size={12} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600">
            Add drawings via the <span className="font-semibold text-slate-800">Drawings tab</span> inside each job. Hover a row to share, email, or archive.
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 mt-20">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading drawings…</span>
          </div>
        ) : filteredJobs.length === 0 && filteredUnassigned.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 mt-20 text-slate-400">
            <FolderOpen size={36} className="text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">
              {search ? 'No drawings match your search' : tab === 'active' ? 'No drawings yet' : 'No archived drawings'}
            </p>
            {!search && tab === 'active' && (
              <p className="text-xs text-slate-400 text-center max-w-xs">
                Open a job and go to the Drawings tab to add drawings.
              </p>
            )}
            {!search && tab === 'active' && (
              <Link to="/jobs" className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg transition-colors">
                <HardHat size={12} />
                Go to Jobs
              </Link>
            )}
          </div>
        ) : (
          <>
            {filteredJobs.map(group => (
              <JobGroupSection
                key={group.jobId}
                group={group}
                tab={tab}
                defaultOpen={defaultOpen}
                onOpen={onOpen}
                onArchive={onArchive}
                onRestore={onRestore}
                onDelete={onDelete}
                onReorder={onReorder}
                onShareClick={setShareTarget}
              />
            ))}

            {filteredUnassigned.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-100">
                  <div className="w-5 h-5 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <FolderOpen size={10} className="text-slate-500" />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Unassigned</span>
                  <span className="text-[10px] text-slate-500">{filteredUnassigned.length} drawing{filteredUnassigned.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredUnassigned.map(d => (
                    <DrawingRow
                      key={d.id}
                      drawing={d}
                      tab={tab}
                      onOpen={onOpen}
                      onArchive={onArchive}
                      onRestore={onRestore}
                      onDelete={onDelete}
                      onShareClick={setShareTarget}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Share modal — triggered from any row */}
      {shareTarget && (
        <ShareModal
          drawingId={shareTarget.drawingId}
          drawingTitle={shareTarget.drawingTitle}
          revisionId={shareTarget.revisionId}
          onClose={() => setShareTarget(null)}
          onGenerate={onCreateShareToken}
        />
      )}
    </div>
  );
}
