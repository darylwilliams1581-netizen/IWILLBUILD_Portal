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
  LogicRule,
  LogicRuleValidation,
  DocumentKind,
} from './types';
import { DEFAULT_PAGE_LAYOUT, DEFAULT_THEME, DEFAULT_DOC_KIND_SETTINGS } from './types';

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
  logicRules: LogicRule[];
}

const MAX_HISTORY = 50;

// ── Store shape ───────────────────────────────────────────────────────────────

interface DocumentStore {
  // ── Template meta ──────────────────────────────────────────────────────────
  templateId: number | null;
  templateName: string;
  templateType: DocumentTemplate['templateType'];
  /** Job this report was generated from — enables "Pick from job" photo picker */
  sourceJobId: number | null;
  pageLayout: PageLayout;
  theme: DocumentTheme;

  // ── Doc/Form kind settings ─────────────────────────────────────────────────
  docKind: DocumentKind;
  requiresAcknowledgement: boolean;
  acknowledgementLabel: string;
  acknowledgementText: string;
  submitLabel: string;
  requiresSignature: boolean;

  // ── Canvas ─────────────────────────────────────────────────────────────────
  blocks: DocumentBlock[];
  selection: BuilderSelection;
  mode: BuilderMode;
  isDirty: boolean;
  isSaving: boolean;

  // ── Logic rules (flat index — source of truth for engine) ─────────────────
  logicRules: LogicRule[];

  // ── Undo/redo ──────────────────────────────────────────────────────────────
  past: HistoryEntry[];
  future: HistoryEntry[];

  // ── Actions: meta ──────────────────────────────────────────────────────────
  setTemplateName: (name: string) => void;
  setTemplateType: (type: DocumentTemplate['templateType']) => void;
  setPageLayout: (layout: Partial<PageLayout>) => void;
  setTheme: (theme: Partial<DocumentTheme>) => void;
  setDocKind: (kind: DocumentKind) => void;
  setKindSettings: (patch: Partial<Pick<DocumentStore, 'requiresAcknowledgement' | 'acknowledgementLabel' | 'acknowledgementText' | 'submitLabel' | 'requiresSignature'>>) => void;

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
  prependBlocks: (incoming: DocumentBlock[]) => void;
  appendBlocks: (incoming: DocumentBlock[]) => void;

  // ── Actions: logic rules ──────────────────────────────────────────────────
  addLogicRule: (rule: LogicRule) => void;
  updateLogicRule: (ruleId: string, patch: Partial<LogicRule>) => void;
  removeLogicRule: (ruleId: string) => void;
  /** Returns all rules whose ownerBlockId matches the given block id */
  getRulesForBlock: (blockId: string) => LogicRule[];
  /** Validate all rules — returns array of validation results for broken rules */
  validateLogicRules: () => LogicRuleValidation[];

  // ── Actions: undo/redo ────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ── Actions: persistence ──────────────────────────────────────────────────
  loadTemplate: (template: DocumentTemplate) => void;
  resetToBlank: (name?: string, type?: DocumentTemplate['templateType']) => void;
  markSaved: (id: number) => void;
  setIsSaving: (v: boolean) => void;
  getSerialised: () => Omit<DocumentTemplate, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  templateId: null,
  templateName: 'Untitled Document',
  templateType: 'document',
  sourceJobId: null,
  pageLayout: DEFAULT_PAGE_LAYOUT,
  theme: DEFAULT_THEME,
  // Doc/Form kind defaults
  docKind: DEFAULT_DOC_KIND_SETTINGS.docKind,
  requiresAcknowledgement: DEFAULT_DOC_KIND_SETTINGS.requiresAcknowledgement,
  acknowledgementLabel: DEFAULT_DOC_KIND_SETTINGS.acknowledgementLabel,
  acknowledgementText: DEFAULT_DOC_KIND_SETTINGS.acknowledgementText,
  submitLabel: DEFAULT_DOC_KIND_SETTINGS.submitLabel,
  requiresSignature: DEFAULT_DOC_KIND_SETTINGS.requiresSignature,
  blocks: [],
  logicRules: [],
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
  setDocKind: (kind) => set({ docKind: kind, isDirty: true }),
  setKindSettings: (patch) => set({ ...patch, isDirty: true }),

  // ── Mode ──────────────────────────────────────────────────────────────────

  setMode: (mode) => set({ mode, selection: { blockId: null } }),

  // ── Selection ─────────────────────────────────────────────────────────────

  select: (blockId, columnId) => set({ selection: { blockId, columnId } }),
  deselect: () => set({ selection: { blockId: null } }),

  // ── Block helpers (push history before mutation) ──────────────────────────

  _pushHistory() {
    const { blocks, logicRules, past } = get();
    const newPast = [...past, { blocks: cloneBlocks(blocks), logicRules: JSON.parse(JSON.stringify(logicRules)) as LogicRule[] }];
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
      // Remove rules owned by this block AND rules that target this block
      logicRules: s.logicRules.filter(
        (r) => r.ownerBlockId !== id &&
               !r.actions.some((a) => a.targetBlockId === id)
      ),
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

  prependBlocks: (incoming) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({ blocks: [...incoming, ...s.blocks], isDirty: true }));
  },

  appendBlocks: (incoming) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    const last = incoming[incoming.length - 1];
    set((s) => ({ blocks: [...s.blocks, ...incoming], isDirty: true, selection: last ? { blockId: last.id } : s.selection }));
  },

  // ── Logic rules ───────────────────────────────────────────────────────────

  addLogicRule: (rule) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({ logicRules: [...s.logicRules, rule], isDirty: true }));
  },

  updateLogicRule: (ruleId, patch) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({
      logicRules: s.logicRules.map((r) => r.id === ruleId ? { ...r, ...patch } : r),
      isDirty: true,
    }));
  },

  removeLogicRule: (ruleId) => {
    (get() as unknown as { _pushHistory: () => void })._pushHistory();
    set((s) => ({
      logicRules: s.logicRules.filter((r) => r.id !== ruleId),
      isDirty: true,
    }));
  },

  getRulesForBlock: (blockId) => {
    return get().logicRules.filter((r) => r.ownerBlockId === blockId);
  },

  validateLogicRules: () => {
    const { logicRules, blocks } = get();
    const allBlockIds = new Set<string>();
    const collectIds = (bs: DocumentBlock[]) => {
      bs.forEach((b) => {
        allBlockIds.add(b.id);
        if (b.type === 'columns') b.columns.forEach((col) => collectIds(col.blocks));
      });
    };
    collectIds(blocks);

    return logicRules.map((rule): import('./types').LogicRuleValidation => {
      const errors: string[] = [];
      rule.conditions.forEach((cond, i) => {
        if (cond.source === 'field' && cond.fieldId && !allBlockIds.has(cond.fieldId)) {
          errors.push(`Condition ${i + 1}: referenced field "${cond.fieldLabel || cond.fieldId}" no longer exists`);
        }
      });
      rule.actions.forEach((action, i) => {
        const needsTarget = ['show','hide','require','unrequire','enable','disable','set_value','clear_value','require_signature','require_upload','insert_section'];
        if (needsTarget.includes(action.action) && action.targetBlockId && !allBlockIds.has(action.targetBlockId)) {
          errors.push(`Action ${i + 1}: target "${action.targetLabel || action.targetBlockId}" no longer exists`);
        }
      });
      return { ruleId: rule.id, valid: errors.length === 0, errors };
    }).filter((v) => !v.valid);
  },

  // ── Undo/redo ─────────────────────────────────────────────────────────────

  undo: () => {
    const { past, blocks, logicRules, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      blocks: prev.blocks,
      logicRules: prev.logicRules,
      future: [{ blocks: cloneBlocks(blocks), logicRules: JSON.parse(JSON.stringify(logicRules)) as LogicRule[] }, ...future],
      isDirty: true,
    });
  },

  redo: () => {
    const { future, blocks, logicRules, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      future: future.slice(1),
      blocks: next.blocks,
      logicRules: next.logicRules,
      past: [...past, { blocks: cloneBlocks(blocks), logicRules: JSON.parse(JSON.stringify(logicRules)) as LogicRule[] }],
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
      sourceJobId: template.sourceJobId ?? null,
      pageLayout: template.pageLayout ?? DEFAULT_PAGE_LAYOUT,
      theme: template.theme ?? DEFAULT_THEME,
      blocks: template.blocks ?? [],
      logicRules: template.logicRules ?? [],
      // Kind settings — fall back to defaults if not stored yet
      docKind: template.docKind ?? DEFAULT_DOC_KIND_SETTINGS.docKind,
      requiresAcknowledgement: template.requiresAcknowledgement ?? DEFAULT_DOC_KIND_SETTINGS.requiresAcknowledgement,
      acknowledgementLabel: template.acknowledgementLabel ?? DEFAULT_DOC_KIND_SETTINGS.acknowledgementLabel,
      acknowledgementText: template.acknowledgementText ?? DEFAULT_DOC_KIND_SETTINGS.acknowledgementText,
      submitLabel: template.submitLabel ?? DEFAULT_DOC_KIND_SETTINGS.submitLabel,
      requiresSignature: template.requiresSignature ?? DEFAULT_DOC_KIND_SETTINGS.requiresSignature,
      selection: { blockId: null },
      mode: 'edit',
      isDirty: false,
      past: [],
      future: [],
    });
  },

  resetToBlank: (name = 'Untitled Document', type?: DocumentTemplate['templateType']) => {
    set({
      templateId: null,
      templateName: name,
      templateType: type ?? 'document',
      sourceJobId: null,
      pageLayout: DEFAULT_PAGE_LAYOUT,
      theme: DEFAULT_THEME,
      blocks: [],
      logicRules: [],
      docKind: DEFAULT_DOC_KIND_SETTINGS.docKind,
      requiresAcknowledgement: DEFAULT_DOC_KIND_SETTINGS.requiresAcknowledgement,
      acknowledgementLabel: DEFAULT_DOC_KIND_SETTINGS.acknowledgementLabel,
      acknowledgementText: DEFAULT_DOC_KIND_SETTINGS.acknowledgementText,
      submitLabel: DEFAULT_DOC_KIND_SETTINGS.submitLabel,
      requiresSignature: DEFAULT_DOC_KIND_SETTINGS.requiresSignature,
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
      logicRules: s.logicRules,
      systemFields: extractSystemFieldKeys(s.blocks),
      sourceAttachments: [],
      isActive: true,
      // Kind settings
      docKind: s.docKind,
      requiresAcknowledgement: s.requiresAcknowledgement,
      acknowledgementLabel: s.acknowledgementLabel,
      acknowledgementText: s.acknowledgementText,
      submitLabel: s.submitLabel,
      requiresSignature: s.requiresSignature,
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
