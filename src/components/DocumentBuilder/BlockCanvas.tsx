/**
 * Studio Builder — Block Canvas
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the A4 page shell with all blocks. Supports click-to-select,
 * drag-to-reorder (via mouse events), and empty-state prompt.
 * In fill/preview mode, applies the logic engine to show/hide blocks.
 */

import { useRef, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Zap } from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import { BlockRenderer } from './BlockRenderer';
import { useLogicEngine, DEFAULT_BLOCK_STATE } from './useLogicEngine';
import type { DocumentBlock } from './types';

// A4 dimensions at 96dpi: 794 × 1123px — portrait minH = width * 1.414
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

export default function BlockCanvas({ zoom = 100 }: { zoom?: number }) {
  const { blocks, selection, mode, pageLayout, theme, select, deselect, moveBlock, removeBlock, logicRules } =
    useDocumentStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [actualPageH, setActualPageH] = useState(0);

  // Track actual rendered page height so the sizing shell stays accurate
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setActualPageH(el.offsetHeight));
    ro.observe(el);
    setActualPageH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Fill-mode field values — maintained locally in the canvas
  // (In a real submission flow these would come from a form state manager)
  const [fillValues, setFillValues] = useState<Record<string, string | string[] | boolean | undefined>>({});

  // Logic engine — only active in fill/preview mode
  const { blockStates, docFlags } = useLogicEngine(
    (mode === 'fill' || mode === 'preview') ? fillValues : {},
  );

  // Per-block rule count for edit-mode badges
  const ruleCountByBlock = useMemo(() => {
    const map: Record<string, number> = {};
    logicRules.forEach((r) => {
      map[r.ownerBlockId] = (map[r.ownerBlockId] ?? 0) + 1;
    });
    return map;
  }, [logicRules]);

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

  // ── Zoom sizing ────────────────────────────────────────────────────────────
  // transform:scale() doesn't affect layout — the element still occupies its
  // original unscaled space. We wrap the page in an explicit-sized shell so
  // the scroll container gets the correct scrollable area at every zoom level.
  // ResizeObserver tracks actual rendered page height for accurate shell sizing.
  const scale = zoom / 100;
  const pageBaseH = isLandscape ? pageWidth : Math.round(pageWidth * 1.414);
  const truePageH = actualPageH > 0 ? actualPageH : pageBaseH;
  const scaledW = Math.round(canvasWidth * scale);
  const scaledH = Math.round(truePageH * scale);

  if (blocks.length === 0 && mode === 'edit') {
    return (
      <div className="flex-1 min-h-0 overflow-auto bg-slate-100" onClick={deselect}>
        <div className="flex justify-center py-10 px-4">
          {/* Sizing shell — gives scroll container the correct scaled dimensions */}
          <div style={{ width: scaledW, minHeight: scaledH, position: 'relative', flexShrink: 0 }}>
            <div
              ref={pageRef}
              data-doc-page
              className="studio-doc-page shadow-xl rounded-sm absolute top-0 left-0 origin-top-left"
              style={{ ...canvasStyle, transform: `scale(${scale})`, transition: 'transform 0.15s ease' }}
              onClick={deselect}
            >
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-50 border-2 border-dashed border-violet-200 flex items-center justify-center">
                  <Plus size={28} className="text-primary" />
                </div>
                <div>
                  <p className="text-slate-700 font-semibold text-base">Start building your document</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Click a block in the left panel to add it here,<br />or import a DOCX to get started.
                  </p>
                </div>
              </div>
            </div>{/* end page div */}
          </div>{/* end sizing shell */}
        </div>{/* end centering wrapper */}
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 overflow-auto bg-slate-100"
      onClick={(e) => {
        if (e.target === e.currentTarget) deselect();
      }}
    >
      <div className="flex justify-center py-10 px-4">
        {/* Sizing shell — gives scroll container the correct scaled dimensions */}
        <div style={{ width: scaledW, minHeight: scaledH, position: 'relative', flexShrink: 0 }}>
        <div
          ref={pageRef}
          data-doc-page
          className="studio-doc-page shadow-xl rounded-sm absolute top-0 left-0 origin-top-left"
          style={{ ...canvasStyle, transform: `scale(${scale})`, transition: 'transform 0.15s ease' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) deselect();
          }}
        >
        <AnimatePresence>
          {blocks.map((block) => {
            // Logic engine: hide block in fill/preview if engine says so
            const logicState = blockStates[block.id] ?? DEFAULT_BLOCK_STATE;
            if ((mode === 'fill' || mode === 'preview') && !logicState.visible) {
              return null;
            }

            const ruleCount = ruleCountByBlock[block.id] ?? 0;

            return (
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
                  <div className="studio-no-print absolute inset-0 ring-2 ring-primary ring-offset-1 rounded-sm pointer-events-none z-10" />
                )}

                {/* Logic rule badge (edit mode) */}
                {mode === 'edit' && ruleCount > 0 && (
                  <div
                    className="studio-no-print absolute top-1 right-1 z-20 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold shadow-sm pointer-events-none"
                    title={`${ruleCount} logic ${ruleCount === 1 ? 'rule' : 'rules'}`}
                  >
                    <Zap size={8} />
                    {ruleCount}
                  </div>
                )}

                {/* Hidden-in-edit indicator (when a rule hides this block) */}
                {mode === 'edit' && logicRules.some(
                  (r) => r.enabled && r.actions.some((a) => a.action === 'hide' && a.targetBlockId === block.id)
                ) && (
                  <div className="studio-no-print absolute inset-0 bg-slate-900/5 border-2 border-dashed border-slate-300 rounded-sm pointer-events-none z-10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full shadow-sm">
                      Hidden by logic
                    </span>
                  </div>
                )}

                {/* Block controls (edit mode only — always visible) */}
                {mode === 'edit' && (
                  <div className="studio-no-print absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 z-20">
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

                {/* Drag handle — always visible in edit mode */}
                {mode === 'edit' && (
                  <div className="studio-no-print absolute -right-7 top-1/2 -translate-y-1/2 flex z-20 cursor-grab active:cursor-grabbing">
                    <div className="w-5 h-8 flex flex-col items-center justify-center gap-0.5">
                      {[0,1,2].map((i) => (
                        <div key={i} className="w-3 h-0.5 bg-slate-300 rounded-full" />
                      ))}
                    </div>
                  </div>
                )}

                <BlockRenderer
                  block={block}
                  logicState={logicState}
                  fillValues={fillValues}
                  onFillChange={(blockId, value) => setFillValues((prev) => ({ ...prev, [blockId]: value }))}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Fill mode: injected banners from logic engine */}
        {mode === 'fill' && (blockStates['__banners__']?.injectedBanners ?? []).map((banner, i) => (
          <div
            key={i}
            className={`mx-0 my-2 px-4 py-3 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
              banner.variant === 'danger'  ? 'bg-red-50 border-red-300 text-red-700' :
              banner.variant === 'warning' ? 'bg-amber-50 border-amber-300 text-amber-700' :
              banner.variant === 'success' ? 'bg-green-50 border-green-300 text-green-700' :
              banner.variant === 'safety'  ? 'bg-violet-50 border-violet-300 text-violet-800' :
              'bg-blue-50 border-blue-300 text-blue-700'
            }`}
          >
            ⚠ {banner.text}
          </div>
        ))}

        {/* Fill mode: submission blocked notice */}
        {mode === 'fill' && docFlags.submissionBlocked && (
          <div className="mx-0 my-2 px-4 py-3 rounded-lg border bg-red-50 border-red-300 text-red-700 text-sm font-semibold">
            🚫 {docFlags.submissionBlockedMessage || 'Submission is blocked by a logic rule. Please review your answers.'}
          </div>
        )}

        {/* Fill mode: approval required notice */}
        {mode === 'fill' && docFlags.requiresApproval && (
          <div className="mx-0 my-2 px-4 py-3 rounded-lg border bg-amber-50 border-amber-300 text-amber-700 text-sm font-semibold">
            ✅ This document requires supervisor approval before submission.
          </div>
        )}
      </div>{/* end page div */}
        </div>{/* end sizing shell */}
      </div>{/* end centering wrapper */}
    </div>
  );
}
