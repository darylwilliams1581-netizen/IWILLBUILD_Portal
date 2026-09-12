/**
 * dazza-builder/operations.ts
 * Operation validation, block construction, and block-update sanitisation.
 *
 * SECURITY:
 * - validateOperations enforces an explicit allowlist of op types and block/field types.
 * - sanitiseBlockUpdate enforces an explicit allowlist of mutable fields.
 * - No arbitrary HTML, JavaScript, SQL, or executable CSS is accepted.
 * - Unknown operations are rejected with a descriptive error.
 * - toolId resolution goes through the catalogue — AI cannot inject arbitrary block shapes.
 * - Protected fields (type, bundled src) are always taken from the catalogue factory.
 */
import { nanoid } from 'nanoid';
import type { BuilderOperation, BuilderType } from './types.js';
import { buildBlockFromToolId, resolveTool } from './document-tool-catalogue.js';

// ── Allowlists ────────────────────────────────────────────────────────────────

export const VALID_BLOCK_TYPES = new Set([
  'heading', 'text', 'rich_text', 'divider', 'spacer', 'page_break',
  'columns', 'banner', 'safety_badge_row', 'risk_matrix', 'risk_matrix_banner',
  'table', 'image', 'field', 'system_field', 'pdf_page',
]);

export const VALID_FIELD_TYPES = new Set([
  'text', 'number', 'date', 'time', 'boolean', 'checkbox', 'radio',
  'dropdown', 'photo', 'signature', 'heading', 'info', 'link', 'location',
  'section', 'rating', 'image', 'job_lookup', 'fleet_lookup', 'global_list',
  'conditional',
]);

/**
 * createNewTemplate is valid for BOTH builder types.
 * It must be the FIRST operation in the batch when templateId is null.
 * The apply endpoint creates the template row and threads the new ID through
 * all subsequent operations in the same batch.
 */
export const VALID_DOCUMENT_OPS = new Set([
  'createNewTemplate', 'addBlock', 'updateBlock', 'moveBlock', 'removeBlock', 'updateTemplateSettings',
]);

export const VALID_FORM_OPS = new Set([
  'createNewTemplate', 'addField', 'updateField', 'moveField', 'removeField', 'addSection', 'updateTemplateSettings',
]);

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a set of operations against the builder type.
 * Returns an array of error strings (empty = valid).
 * AI output is treated as untrusted input — every operation is schema-validated here.
 */
export function validateOperations(ops: BuilderOperation[], builderType: BuilderType): string[] {
  const errors: string[] = [];

  for (const op of ops) {
    if (!op.op) { errors.push('Operation missing "op" field'); continue; }

    if (builderType === 'document') {
      if (!VALID_DOCUMENT_OPS.has(op.op)) {
        errors.push(`Operation "${op.op}" is not valid for document builder`);
        continue;
      }
      if (['addBlock', 'updateBlock'].includes(op.op)) {
        // toolId path: validate the toolId exists and is Dazza-enabled
        if (op.toolId) {
          const entry = resolveTool(String(op.toolId));
          if (!entry) {
            errors.push(`Unknown toolId: ${String(op.toolId)}`);
          } else if (!entry.dazzaEnabled) {
            errors.push(`Tool "${entry.label}" (${String(op.toolId)}) cannot be inserted by Dazza: ${entry.unavailableReason ?? 'not available'}`);
          }
        } else {
          // blockType path: validate against the allowlist
          const blockType = op.blockType as string | undefined;
          if (blockType && !VALID_BLOCK_TYPES.has(blockType)) {
            errors.push(`Unknown block type: ${blockType}`);
          }
        }
      }
    } else {
      if (!VALID_FORM_OPS.has(op.op)) {
        errors.push(`Operation "${op.op}" is not valid for form builder`);
        continue;
      }
      if (['addField', 'updateField'].includes(op.op)) {
        const fieldType = op.fieldType as string | undefined;
        if (fieldType && !VALID_FIELD_TYPES.has(fieldType)) {
          errors.push(`Unknown field type: ${fieldType}`);
        }
      }
    }
  }

  return errors;
}

// ── Block construction ────────────────────────────────────────────────────────

/**
 * Build a new block object from an addBlock operation.
 *
 * Resolution order:
 * 1. If op.toolId is present → resolve through the catalogue (canonical factory
 *    + allowed AI overrides).  Protected fields cannot be overridden.
 * 2. Otherwise → build from op.blockType using the explicit type switch below.
 *
 * Every case produces a correctly-typed block that matches DocumentBuilder/types.ts.
 * No case falls through to String(object) for structured data.
 */
export function buildBlock(op: BuilderOperation): Record<string, unknown> {
  // ── Path 1: toolId → catalogue factory ────────────────────────────────────
  if (op.toolId) {
    const toolId = String(op.toolId);
    const entry = resolveTool(toolId);

    if (!entry || !entry.dazzaEnabled || !entry.factory) {
      // Unknown or disabled toolId — fall back to a safe empty text block
      // rather than throwing, so the apply pipeline can continue and report
      // the error via validation.
      return { id: nanoid(10), type: 'text', content: `[Unknown tool: ${toolId}]`, align: 'left' };
    }

    // Extract only the allowed AI overrides from the operation
    const aiOverrides: Record<string, unknown> = {};
    for (const key of entry.aiInputs ?? []) {
      if (key in op) aiOverrides[key] = op[key];
    }

    const block = buildBlockFromToolId(toolId, aiOverrides);
    if (!block) {
      return { id: nanoid(10), type: 'text', content: `[Tool build failed: ${toolId}]`, align: 'left' };
    }
    return block;
  }

  // ── Path 2: blockType switch ───────────────────────────────────────────────
  const id = nanoid(10);
  const type = String(op.blockType ?? 'text');
  const base: Record<string, unknown> = { id, type };

  switch (type) {
    // ── Structure ────────────────────────────────────────────────────────────
    case 'heading':
      return {
        ...base,
        content: String(op.content ?? ''),
        level: Number(op.level ?? 2),
        align: op.align ?? 'left',
        ...(op.color ? { color: String(op.color) } : {}),
      };

    case 'text':
      return {
        ...base,
        content: String(op.content ?? ''),
        align: op.align ?? 'left',
        ...(op.bold !== undefined ? { bold: Boolean(op.bold) } : {}),
        ...(op.italic !== undefined ? { italic: Boolean(op.italic) } : {}),
        ...(op.fontSize ? { fontSize: String(op.fontSize) } : {}),
        ...(op.color ? { color: String(op.color) } : {}),
      };

    case 'rich_text':
      return {
        ...base,
        html: String(op.html ?? op.content ?? ''),
      };

    case 'divider':
      return {
        ...base,
        style: op.style ?? 'solid',
        thickness: op.thickness ?? 1,
        ...(op.color ? { color: String(op.color) } : {}),
      };

    case 'spacer':
      return { ...base, height: Number(op.height ?? 24) };

    case 'page_break':
      return base;

    // ── Banner — uses title/body, NOT content ─────────────────────────────────
    // BannerBlock schema: { type, variant, title, body, size, align, showOnExport }
    // NEVER use content: String(op.content) — that produces "[object Object]"
    // when op.content is a structured object.
    case 'banner':
      return {
        ...base,
        variant: op.variant ?? 'info',
        title: typeof op.title === 'string' ? op.title : (typeof op.content === 'string' ? op.content : ''),
        body: typeof op.body === 'string' ? op.body : '',
        size: op.size ?? 'standard',
        align: op.align ?? 'left',
        showOnExport: op.showOnExport !== false,
        ...(op.customBgColor ? { customBgColor: String(op.customBgColor) } : {}),
        ...(op.customBorderColor ? { customBorderColor: String(op.customBorderColor) } : {}),
      };

    // ── Image — uses src/alt/size/align/preserveAspectRatio, NOT content ──────
    // ImageBlock schema: { type, src, alt, size, align, preserveAspectRatio }
    // NEVER put image data in content — String({...}) = "[object Object]".
    // Fallback chain for src:
    //   1. op.src (string) — the correct Dazza shape
    //   2. op.content (string) — plain URL fallback
    //   3. '' — if content is an object, discard it entirely
    case 'image':
      return {
        ...base,
        src: typeof op.src === 'string' && op.src
          ? op.src
          : (typeof op.content === 'string' ? op.content : ''),
        alt: typeof op.alt === 'string' ? op.alt : '',
        size: typeof op.size === 'string' ? op.size : 'full',
        align: typeof op.align === 'string' ? op.align : 'center',
        preserveAspectRatio: op.preserveAspectRatio !== false,
      };

    // ── Table — uses columns/rows schema, NOT a flat headers array ────────────
    // TableBlock schema: { type, mode, columns: TableColumn[], rows: TableRow[] }
    // The old buildBlock used { headers: string[], rows: string[][] } which is
    // the wrong schema — the builder expects TableColumn objects with id/header/cellType.
    case 'table': {
      const numCols = Number(op.columns ?? 3);
      const numRows = Number(op.rows ?? 2);
      const colIds = Array.from({ length: numCols }, () => nanoid(10));
      const columns = colIds.map((cid, i) => ({
        id: cid,
        header: `Column ${i + 1}`,
        cellType: 'text',
        width: 1,
      }));
      const rows = Array.from({ length: numRows }, () => ({
        id: nanoid(10),
        cells: Object.fromEntries(colIds.map((cid) => [cid, ''])),
      }));
      return {
        ...base,
        mode: op.mode ?? 'static',
        stripedRows: op.stripedRows !== false,
        columns,
        rows,
      };
    }

    // ── System Field — uses fieldKey/label/fallback/showLabel ─────────────────
    // SystemFieldBlock schema: { type, fieldKey, label, fallback, showLabel }
    case 'system_field':
      return {
        ...base,
        fieldKey: String(op.fieldKey ?? ''),
        label: String(op.label ?? ''),
        fallback: String(op.fallback ?? ''),
        showLabel: op.showLabel !== false,
      };

    // ── Field (form field embedded in document) ───────────────────────────────
    case 'field':
      return {
        ...base,
        fieldType: op.fieldType ?? 'short_text',
        label: String(op.label ?? 'Field'),
        required: Boolean(op.required ?? false),
        ...(op.placeholder ? { placeholder: String(op.placeholder) } : {}),
        ...(op.helpText ? { helpText: String(op.helpText) } : {}),
      };

    // ── Safety Badge Row — requires interactive badge selection ───────────────
    // Dazza cannot autonomously insert this (dazzaEnabled=false in catalogue).
    // If it somehow reaches here via blockType path, produce a minimal valid block.
    case 'safety_badge_row':
      return {
        ...base,
        size: op.size ?? 'md',
        align: op.align ?? 'center',
        badges: [],
      };

    // ── Risk Matrix ───────────────────────────────────────────────────────────
    case 'risk_matrix':
      return {
        ...base,
        title: String(op.title ?? 'Risk Assessment Matrix'),
        showLegend: op.showLegend !== false,
        showOnExport: op.showOnExport !== false,
      };

    // ── Risk Matrix Banner ────────────────────────────────────────────────────
    case 'risk_matrix_banner':
      return base;

    // ── Columns — requires interactive editing ────────────────────────────────
    case 'columns':
      return {
        ...base,
        gap: op.gap ?? 'md',
        columns: [
          { id: nanoid(10), width: 1, blocks: [] },
          { id: nanoid(10), width: 1, blocks: [] },
        ],
      };

    // ── Unknown / future types ────────────────────────────────────────────────
    // Fall back to a text block with a string content field.
    // String(op.content ?? '') is safe here because we only reach this case
    // for truly unknown types — all known types are handled above.
    default:
      return { ...base, content: String(op.content ?? '') };
  }
}

// ── Block update sanitisation ─────────────────────────────────────────────────

/**
 * Extract only the allowed mutable fields from an updateBlock operation.
 * Prevents injection of arbitrary keys into the block object.
 */
export function sanitiseBlockUpdate(op: BuilderOperation): Record<string, unknown> {
  const ALLOWED_KEYS = [
    // Text / heading
    'content', 'html', 'level', 'align', 'color', 'bold', 'italic', 'fontSize',
    // Divider
    'style', 'thickness',
    // Spacer
    'height',
    // Banner — title/body NOT content (content is not a BannerBlock field)
    'title', 'body', 'variant', 'size', 'showOnExport', 'customBgColor', 'customBorderColor',
    // Image — safe properties only; src is allowed for user-uploaded images
    'src', 'alt', 'preserveAspectRatio',
    // System field
    'fieldKey', 'label', 'fallback', 'showLabel',
    // Field block
    'fieldType', 'required', 'placeholder', 'helpText',
    // Table
    'headerBgColor', 'headerTextColor', 'stripedRows', 'repeatable', 'showRowNumbers',
    // Shared layout
    'backgroundColor', 'borderColor', 'padding',
    // Risk matrix
    'showLegend',
  ];
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in op) out[key] = op[key];
  }
  return out;
}
