/**
 * PlanManagerList — drawings list with create, upload, archive, and search.
 */
import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Plus, Search, FileText, MoreHorizontal, Archive, RotateCcw,
  Trash2, Lock, Loader2, Upload, GitBranch, Clock,
} from 'lucide-react';
import type { Drawing } from './types';

interface Props {
  drawings: Drawing[];
  loading: boolean;
  tab: 'active' | 'archived';
  onOpen: (id: number) => void;
  onCreate: (title: string) => Promise<number | null>;
  onArchive: (id: number) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlanManagerList({
  drawings, loading, tab, onOpen, onCreate, onArchive, onRestore, onDelete,
}: Props) {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [menuId, setMenuId] = useState<number | null>(null);

  const filtered = drawings.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const id = await onCreate(newTitle.trim());
    setCreating(false);
    if (id) {
      setShowCreate(false);
      setNewTitle('');
      onOpen(id);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search drawings…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        {tab === 'active' && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            <Plus size={15} /> New Drawing
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-500 mt-20">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading drawings…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 mt-20 text-slate-500">
            <FileText size={40} className="text-slate-700" />
            <p className="text-sm font-semibold text-slate-400">
              {search ? 'No drawings match your search' : tab === 'active' ? 'No drawings yet' : 'No archived drawings'}
            </p>
            {!search && tab === 'active' && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
              >
                Create your first drawing
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((drawing, i) => (
              <motion.div
                key={drawing.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="group relative bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 hover:border-orange-500/40 hover:bg-slate-800 transition-all cursor-pointer"
                onClick={() => onOpen(drawing.id)}
              >
                {/* PDF preview placeholder */}
                <div className="w-full aspect-[3/4] rounded-lg bg-slate-700/50 border border-slate-600/40 flex items-center justify-center mb-3 overflow-hidden">
                  {drawing.source_file_path ? (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <FileText size={28} className="text-orange-400/60" />
                      <span className="text-[10px] text-slate-500">{drawing.page_count} page{drawing.page_count !== 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-600">
                      <Upload size={24} />
                      <span className="text-[10px]">No PDF</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{drawing.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                    </div>
                    {drawing.updated_at && (
                      <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">
                        <Clock size={9} /> {formatDate(drawing.updated_at)}
                      </p>
                    )}
                  </div>

                  {/* Context menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); setMenuId(menuId === drawing.id ? null : drawing.id); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {menuId === drawing.id && (
                      <div
                        className="absolute right-0 top-8 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-20 min-w-[160px]"
                        onClick={e => e.stopPropagation()}
                      >
                        {tab === 'active' ? (
                          <button
                            onClick={() => { onArchive(drawing.id); setMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-700 rounded-t-xl transition-colors"
                          >
                            <Archive size={13} /> Archive
                          </button>
                        ) : (
                          <button
                            onClick={() => { onRestore(drawing.id); setMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-700 rounded-t-xl transition-colors"
                          >
                            <RotateCcw size={13} /> Restore
                          </button>
                        )}
                        <button
                          onClick={() => { onDelete(drawing.id); setMenuId(null); }}
                          className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/10 rounded-b-xl transition-colors"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-slate-100 mb-4">New Drawing</h3>
            <input
              autoFocus
              type="text"
              placeholder="Drawing title (e.g. Ground Floor Plan)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCreate(false); setNewTitle(''); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {creating && <Loader2 size={13} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close menu on outside click */}
      {menuId !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
      )}
    </div>
  );
}
