/**
 * PlanManagerList — Job-grouped file manager view.
 * Drawings are organised by job (collapsible accordion).
 * No "create" button here — drawings must be added via the job's Drawings tab.
 * Supports move up/down ordering within each job group.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, FileText, Archive, RotateCcw, Trash2, Loader2,
  GitBranch, Clock, ChevronDown, ChevronUp, FolderOpen,
  Eye, Briefcase, AlertCircle, ChevronRight, Lock,
} from 'lucide-react';
import type { Drawing } from './types';

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
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Single drawing row ────────────────────────────────────────────────────────
function DrawingRow({
  drawing, idx, total, tab, jobId,
  onOpen, onArchive, onRestore, onDelete, onReorder,
}: {
  drawing: Drawing;
  idx: number;
  total: number;
  tab: 'active' | 'archived';
  jobId?: number;
  onOpen: (id: number) => void;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onReorder: (drawingId: number, direction: 'up' | 'down', jobId?: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors group">
      {/* Move up/down (active only) */}
      {tab === 'active' && (
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            onClick={() => void act(() => onReorder(drawing.id, 'up', jobId))}
            disabled={idx === 0 || busy}
            className="p-0.5 rounded text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors"
            title="Move up"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => void act(() => onReorder(drawing.id, 'down', jobId))}
            disabled={idx === total - 1 || busy}
            className="p-0.5 rounded text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors"
            title="Move down"
          >
            <ChevronDown size={12} />
          </button>
        </div>
      )}

      {/* PDF icon */}
      <div className="w-8 h-10 rounded-lg bg-slate-700/60 border border-slate-600/40 flex items-center justify-center shrink-0">
        {drawing.source_file_path ? (
          <FileText size={14} className="text-orange-400/80" />
        ) : (
          <FileText size={14} className="text-slate-600" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-100 truncate">{drawing.title}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {drawing.revision_name && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <GitBranch size={9} /> {drawing.revision_name}
            </span>
          )}
          {drawing.locked && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400">
              <Lock size={9} /> Locked
            </span>
          )}
          {(drawing.annotation_count ?? 0) > 0 && (
            <span className="text-[10px] text-slate-500">{drawing.annotation_count} annotation{Number(drawing.annotation_count) !== 1 ? 's' : ''}</span>
          )}
          {!drawing.source_file_path && (
            <span className="text-[10px] text-slate-600 italic">No PDF uploaded</span>
          )}
          {drawing.updated_at && (
            <span className="text-[10px] text-slate-600 flex items-center gap-1">
              <Clock size={9} /> {formatDate(drawing.updated_at)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {busy ? (
          <Loader2 size={14} className="animate-spin text-slate-500" />
        ) : (
          <>
            {drawing.source_file_path && (
              <button onClick={() => onOpen(drawing.id)} title="Open viewer"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-orange-500/10 hover:text-orange-400 transition-colors">
                <Eye size={13} />
              </button>
            )}
            {tab === 'active' ? (
              <button onClick={() => void act(() => onArchive(drawing.id))} title="Archive"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors">
                <Archive size={13} />
              </button>
            ) : (
              <button onClick={() => void act(() => onRestore(drawing.id))} title="Restore"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors">
                <RotateCcw size={13} />
              </button>
            )}
            <button onClick={() => void act(() => onDelete(drawing.id))} title="Delete permanently"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors">
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Job accordion group ───────────────────────────────────────────────────────
function JobGroup({
  group, tab, onOpen, onArchive, onRestore, onDelete, onReorder,
}: {
  group: JobGroup;
  tab: 'active' | 'archived';
  onOpen: (id: number) => void;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onReorder: (drawingId: number, direction: 'up' | 'down', jobId?: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
      {/* Job header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/40 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Briefcase size={13} className="text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">
            {group.jobNumber ? `${group.jobNumber} — ` : ''}{group.jobName}
          </p>
          <p className="text-[10px] text-slate-500">{group.drawings.length} drawing{group.drawings.length !== 1 ? 's' : ''}</p>
        </div>
        <ChevronRight size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {/* Drawings list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-slate-700/40"
          >
            {group.drawings.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-500 italic">No drawings in this job.</p>
            ) : (
              <div className="divide-y divide-slate-700/30">
                {group.drawings.map((d, idx) => (
                  <DrawingRow
                    key={d.id}
                    drawing={d}
                    idx={idx}
                    total={group.drawings.length}
                    tab={tab}
                    jobId={group.jobId}
                    onOpen={onOpen}
                    onArchive={onArchive}
                    onRestore={onRestore}
                    onDelete={onDelete}
                    onReorder={onReorder}
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
  jobs, unassigned, loading, tab, onOpen, onArchive, onRestore, onDelete, onReorder,
}: Props) {
  const [search, setSearch] = useState('');

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

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search drawings or jobs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <div className="text-xs text-slate-500 whitespace-nowrap">
          {totalDrawings} drawing{totalDrawings !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Info banner */}
      {tab === 'active' && (
        <div className="mx-6 mt-4 flex items-start gap-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
          <AlertCircle size={13} className="text-slate-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400">
            Drawings are added via the <span className="font-semibold text-slate-300">Drawings tab</span> inside each job. Use this view to browse, reorder, and manage all drawings across jobs.
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-500 mt-20">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading drawings…</span>
          </div>
        ) : filteredJobs.length === 0 && filteredUnassigned.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 mt-20 text-slate-500">
            <FolderOpen size={40} className="text-slate-700" />
            <p className="text-sm font-semibold text-slate-400">
              {search ? 'No drawings match your search' : tab === 'active' ? 'No drawings yet' : 'No archived drawings'}
            </p>
            {!search && tab === 'active' && (
              <p className="text-xs text-slate-500 text-center max-w-xs">
                Open a job and go to the Drawings tab to add drawings.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Job groups */}
            {filteredJobs.map(group => (
              <JobGroup
                key={group.jobId}
                group={group}
                tab={tab}
                onOpen={onOpen}
                onArchive={onArchive}
                onRestore={onRestore}
                onDelete={onDelete}
                onReorder={onReorder}
              />
            ))}

            {/* Unassigned drawings */}
            {filteredUnassigned.length > 0 && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/40">
                  <div className="w-7 h-7 rounded-lg bg-slate-700 border border-slate-600 flex items-center justify-center shrink-0">
                    <FolderOpen size={13} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-300">Unassigned</p>
                    <p className="text-[10px] text-slate-500">{filteredUnassigned.length} drawing{filteredUnassigned.length !== 1 ? 's' : ''} not linked to a job</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-700/30">
                  {filteredUnassigned.map((d, idx) => (
                    <DrawingRow
                      key={d.id}
                      drawing={d}
                      idx={idx}
                      total={filteredUnassigned.length}
                      tab={tab}
                      onOpen={onOpen}
                      onArchive={onArchive}
                      onRestore={onRestore}
                      onDelete={onDelete}
                      onReorder={onReorder}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
