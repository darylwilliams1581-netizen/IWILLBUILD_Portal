/**
 * Smart Document Builder — Zustand Store
 * ─────────────────────────────────────────────────────────────────────────────
 * Central state for the document canvas. Handles block CRUD, selection,
 * undo/redo, mode switching, and dirty tracking.
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  DocumentBlock,
  DocumentTemplate,
  BuilderSelection,
  BuilderMode,
  PageLayout,
  DocumentTheme,
  BlockId,
  ColumnDef,
} from './types';
import { DEFAULT_PAGE_LAYOUT, DEFAULT_THEME } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function newId(): string {
  return nanoid(10);
}

function cloneBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  return JSON.parse(JSON.stringify(blocks)) as DocumentBlock[];
}

// ── History entry ─────────────────────────────────────────────────────────────

interface HistoryEntry {
  blocks: DocumentBlock[];
}

const MAX_HISTORY = 50;

// ── Store shape ───────────────────────────────────────────────────────────────

interface DocumentStore {
  // ── Template meta ──────────────────────────────────────────────────────────
  templateId: number | null;
  templateName: string;
  templateType: DocumentTemplate['templateType'];
  pageLayout: PageLayout;
  theme: DocumentTheme;

  // ── Canvas ─────────────────────────────────────────────────────────────────
  blocks: DocumentBlock[];
  selection: BuilderSelection;
  mode: BuilderMode;
  isDirty: boolean;
  isSaving: boolean;

  // ── Undo/redo ──────────────────────────────────────────────────────────────
  past: HistoryEntry[];
  future: HistoryEntry[];

  // ── Actions: meta ──────────────────────────────────────────────────────────
  setTemplateName: (name: string) => void;
  setTemplateType: (type: DocumentTemplate['templateType']) => void;
  setPageLayout: (layout: Partial<PageLayout>) => void;
  setTheme: (theme: Partial<DocumentTheme>) => void;

  // ── Actions: mode ─────────────────────────────────────────────────────────
  setMode: (mode: BuilderMode) => void;

  // ── Actions: selection ────────────────────────────────────────────────────
  select: (blockId: BlockId | null, columnId?: string) => void;
  deselect: () => void;

  // ── Actions: blocks ───────────────────────────────────────────────────────
  addBlock: (block: DocumentBlock, afterId?: BlockId) => void;
  addBlockToColumn: (block: DocumentBlock, columnsBlockId: BlockId, columnId: string, afterId?: BlockId) => void;
  updateBlock: (id: BlockId, patch: Partial<DocumentBlock>) => void;
  updateBlockInColumn: (columnsBlockId: BlockId, columnId: string, blockId: BlockId, patch: Partial<DocumentBlock>) => void;
  removeBlock: (id: BlockId) => void;
  removeBlockFromColumn: (columnsBlockId: BlockId, columnId: string, blockId: BlockId) => void;
  moveBlock: (id: BlockId, direction: 'up' | 'down') => void;
  reorderBlocks: (newOrder: DocumentBlock[]) => void;

  // ── Actions: undo/redo ────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ── Actions: persistence ──────────────────────────────────────────────────
  loadTemplate: (template: DocumentTemplate) => void;
  resetToBlank: (name?: string) => void;
  markSaved: (id: number) => void;
  setIsSaving: (v: boolean) => void;
  getSerialised: () => Omit<DocumentTemplate, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  templateId: null,
  templateName: 'Untitled Document',
  templateType: 'document',
  pageLayout: DEFAULT_PAGE_LAYOUT,
  theme: DEFAULT_THEME,
  blocks: [],
  selection: { blockId: null },
  mode: 'edit',
  isDirty: false,
  isSaving: false,
  past: [],
  future: [],

  // ── Meta ──────────────────────────────────────────────────────────────────

  setTemplateName: (name) => set({ templateName: name, isDirty: true }),
  setTemplateType: (type) => set({ templateType: type, isDirty: true }),
  setPageLayout: (layout) =>
    set((s) => ({ pageLayout: { ...s.pageLayout, ...layout }, isDirty: true })),
  setTheme: (theme) =>
    set((s) => ({ theme: { ...s.theme, ...theme }, isDirty: true })),

  // ── Mode ──────────────────────────────────────────────────────────────────

  setMode: (mode) => set({ mode, selection: { blockId: null } }),

  // ── Selection ─────────────────────────────────────────────────────────────

  select: (blockId, columnId) => set({ selection: { blockId, columnId } }),
  deselect: () => set({ selection: { blockId: null } }),

  // ── Block helpers (push history before mutation) ──────────────────────────

  _pushHistory() {
    const { blocks, past } = get();
    const newPast = [...past, { blocks: cloneBlocks(blocks) }];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    set({ past: newPast, future: [] });
  },

  addBlock: (block, afterId) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => {
      const blocks = [...s.blocks];
      if (afterId) {
        const idx = blocks.findIndex((b) => b.id === afterId);
        if (idx >= 0) { blocks.splice(idx + 1, 0, block); }
        else blocks.push(block);
      } else {
        blocks.push(block);
      }
      return { blocks, isDirty: true, selection: { blockId: block.id } };
    });
  },

  addBlockToColumn: (block, columnsBlockId, columnId, afterId) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => {
      const blocks = s.blocks.map((b) => {
        if (b.id !== columnsBlockId || b.type !== 'columns') return b;
        const cols: ColumnDef[] = b.columns.map((col) => {
          if (col.id !== columnId) return col;
          const colBlocks = [...col.blocks];
          if (afterId) {
            const idx = colBlocks.findIndex((cb) => cb.id === afterId);
            if (idx >= 0) colBlocks.splice(idx + 1, 0, block);
            else colBlocks.push(block);
          } else {
            colBlocks.push(block);
          }
          return { ...col, blocks: colBlocks };
        });
        return { ...b, columns: cols };
      });
      return { blocks, isDirty: true, selection: { blockId: block.id, columnId } };
    });
  },

  updateBlock: (id, patch) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as DocumentBlock) : b)),
      isDirty: true,
    }));
  },

  updateBlockInColumn: (columnsBlockId, columnId, blockId, patch) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({
      blocks: s.blocks.map((b) => {
        if (b.id !== columnsBlockId || b.type !== 'columns') return b;
        return {
          ...b,
          columns: b.columns.map((col) => {
            if (col.id !== columnId) return col;
            return {
              ...col,
              blocks: col.blocks.map((cb) =>
                cb.id === blockId ? ({ ...cb, ...patch } as DocumentBlock) : cb
              ),
            };
          }),
        };
      }),
      isDirty: true,
    }));
  },

  removeBlock: (id) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      selection: s.selection.blockId === id ? { blockId: null } : s.selection,
      isDirty: true,
    }));
  },

  removeBlockFromColumn: (columnsBlockId, columnId, blockId) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({
      blocks: s.blocks.map((b) => {
        if (b.id !== columnsBlockId || b.type !== 'columns') return b;
        return {
          ...b,
          columns: b.columns.map((col) => {
            if (col.id !== columnId) return col;
            return { ...col, blocks: col.blocks.filter((cb) => cb.id !== blockId) };
          }),
        };
      }),
      isDirty: true,
    }));
  },

  moveBlock: (id, direction) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => {
      const blocks = [...s.blocks];
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx < 0) return {};
      if (direction === 'up' && idx === 0) return {};
      if (direction === 'down' && idx === blocks.length - 1) return {};
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]];
      return { blocks, isDirty: true };
    });
  },

  reorderBlocks: (newOrder) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set({ blocks: newOrder, isDirty: true });
  },

  // ── Undo/redo ─────────────────────────────────────────────────────────────

  undo: () => {
    const { past, blocks, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      blocks: prev.blocks,
      future: [{ blocks: cloneBlocks(blocks) }, ...future],
      isDirty: true,
    });
  },

  redo: () => {
    const { future, blocks, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      future: future.slice(1),
      blocks: next.blocks,
      past: [...past, { blocks: cloneBlocks(blocks) }],
      isDirty: true,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // ── Persistence ───────────────────────────────────────────────────────────

  loadTemplate: (template) => {
    set({
      templateId: template.id ?? null,
      templateName: template.name,
      templateType: template.templateType,
      pageLayout: template.pageLayout ?? DEFAULT_PAGE_LAYOUT,
      theme: template.theme ?? DEFAULT_THEME,
      blocks: template.blocks ?? [],
      selection: { blockId: null },
      mode: 'edit',
      isDirty: false,
      past: [],
      future: [],
    });
  },

  resetToBlank: (name = 'Untitled Document') => {
    set({
      templateId: null,
      templateName: name,
      templateType: 'document',
      pageLayout: DEFAULT_PAGE_LAYOUT,
      theme: DEFAULT_THEME,
      blocks: [],
      selection: { blockId: null },
      mode: 'edit',
      isDirty: false,
      past: [],
      future: [],
    });
  },

  markSaved: (id) => set({ templateId: id, isDirty: false }),
  setIsSaving: (v) => set({ isSaving: v }),

  getSerialised: () => {
    const s = get();
    return {
      name: s.templateName,
      templateType: s.templateType,
      pageLayout: s.pageLayout,
      theme: s.theme,
      blocks: s.blocks,
      systemFields: extractSystemFieldKeys(s.blocks),
      sourceAttachments: [],
      isActive: true,
    };
  },
}));

// ── Utility: extract all system field keys used in the block tree ─────────────

function extractSystemFieldKeys(blocks: DocumentBlock[]): string[] {
  const keys = new Set<string>();
  const visit = (block: DocumentBlock) => {
    if (block.type === 'system_field') keys.add(block.fieldKey);
    if (block.type === 'text' || block.type === 'heading') {
      const matches = block.content.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g);
      for (const m of matches) keys.add(m[1]);
    }
    if (block.type === 'rich_text') {
      const matches = block.html.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g);
      for (const m of matches) keys.add(m[1]);
    }
    if (block.type === 'columns') {
      block.columns.forEach((col) => col.blocks.forEach(visit));
    }
  };
  blocks.forEach(visit);
  return [...keys];
}
