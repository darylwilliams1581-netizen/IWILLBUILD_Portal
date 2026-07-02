/**
 * Smart Document Builder — Block Canvas
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the A4 page shell with all blocks. Supports click-to-select,
 * drag-to-reorder (via mouse events), and empty-state prompt.
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus } from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import { BlockRenderer } from './BlockRenderer';
import type { DocumentBlock } from './types';

// A4 dimensions at 96dpi: 794 × 1123px
const PAGE_WIDTHS: Record<string, number> = {
  A4: 794,
  Letter: 816,
  Legal: 816,
};

const MARGIN_PX: Record<string, { x: number; y: number }> = {
  none:     { x: 0,  y: 0 },
  narrow:   { x: 24, y: 24 },
  standard: { x: 48, y: 48 },
  wide:     { x: 72, y: 64 },
};

export default function BlockCanvas() {
  const { blocks, selection, mode, pageLayout, theme, select, deselect, moveBlock, removeBlock } =
    useDocumentStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  const pageWidth = PAGE_WIDTHS[pageLayout.paperSize] ?? 794;
  const margin = MARGIN_PX[pageLayout.margins] ?? MARGIN_PX.standard;
  const isLandscape = pageLayout.orientation === 'landscape';

  const canvasWidth = isLandscape ? Math.round(pageWidth * 1.414) : pageWidth;
  const canvasStyle: React.CSSProperties = {
    width: canvasWidth,
    minHeight: isLandscape ? pageWidth : Math.round(pageWidth * 1.414),
    backgroundColor: theme.backgroundColor,
    paddingLeft: margin.x,
    paddingRight: margin.x,
    paddingTop: margin.y,
    paddingBottom: margin.y,
    color: theme.textColor,
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(id: string) {
    setDragId(id);
    dragRef.current = id;
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragRef.current !== id) setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = dragRef.current;
    if (!sourceId || sourceId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    // Reorder: move source to just before target
    const newBlocks = [...blocks];
    const srcIdx = newBlocks.findIndex((b) => b.id === sourceId);
    const tgtIdx = newBlocks.findIndex((b) => b.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const [moved] = newBlocks.splice(srcIdx, 1);
    const insertAt = srcIdx < tgtIdx ? tgtIdx : tgtIdx;
    newBlocks.splice(insertAt, 0, moved);
    useDocumentStore.getState().reorderBlocks(newBlocks);
    setDragId(null);
    setDragOverId(null);
    dragRef.current = null;
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
    dragRef.current = null;
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (blocks.length === 0 && mode === 'edit') {
    return (
      <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center py-10 px-4">
        <div
          className="shadow-xl rounded-sm relative"
          style={canvasStyle}
          onClick={deselect}
        >
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 border-2 border-dashed border-orange-200 flex items-center justify-center">
              <Plus size={28} className="text-primary" />
            </div>
            <div>
              <p className="text-slate-700 font-semibold text-base">Start building your document</p>
              <p className="text-slate-400 text-sm mt-1">
                Click a block in the left panel to add it here,<br />or import a DOCX to get started.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center py-10 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) deselect();
      }}
    >
      <div
        className="shadow-xl rounded-sm relative"
        style={canvasStyle}
        onClick={(e) => {
          if (e.target === e.currentTarget) deselect();
        }}
      >
        <AnimatePresence>
          {blocks.map((block) => (
            <motion.div
              key={block.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              draggable={mode === 'edit'}
              onDragStart={() => handleDragStart(block.id)}
              onDragOver={(e) => handleDragOver(e, block.id)}
              onDrop={(e) => handleDrop(e, block.id)}
              onDragEnd={handleDragEnd}
              className={`relative group transition-all ${
                dragId === block.id ? 'opacity-40' : ''
              } ${dragOverId === block.id ? 'border-t-2 border-primary' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (mode === 'edit') select(block.id);
              }}
            >
              {/* Selection ring */}
              {mode === 'edit' && selection.blockId === block.id && (
                <div className="absolute inset-0 ring-2 ring-primary ring-offset-1 rounded-sm pointer-events-none z-10" />
              )}

              {/* Hover controls (edit mode only) */}
              {mode === 'edit' && (
                <div className="absolute -left-8 top-1/2 -translate-y-1/2 hidden group-hover:flex flex-col gap-0.5 z-20">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                    className="w-6 h-6 rounded bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-colors text-xs"
                    title="Move up"
                  >↑</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                    className="w-6 h-6 rounded bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-colors text-xs"
                    title="Move down"
                  >↓</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                    className="w-6 h-6 rounded bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-300 transition-colors text-xs"
                    title="Delete block"
                  >×</button>
                </div>
              )}

              {/* Drag handle */}
              {mode === 'edit' && (
                <div className="absolute -right-7 top-1/2 -translate-y-1/2 hidden group-hover:flex z-20 cursor-grab active:cursor-grabbing">
                  <div className="w-5 h-8 flex flex-col items-center justify-center gap-0.5">
                    {[0,1,2].map((i) => (
                      <div key={i} className="w-3 h-0.5 bg-slate-300 rounded-full" />
                    ))}
                  </div>
                </div>
              )}

              <BlockRenderer block={block} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
