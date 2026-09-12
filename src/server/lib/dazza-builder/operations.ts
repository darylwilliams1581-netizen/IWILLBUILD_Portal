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

// ── Block-type-aware value validation ─────────────────────────────────────────

/**
 * Valid banner variant values.
 */
export const VALID_BANNER_VARIANTS = new Set([
  'info', 'warning', 'danger', 'success', 'safety', 'safety_first',
  'first_aid', 'caution', 'notice', 'custom',
]);

/**
 * Valid banner size values.
 */
export const VALID_BANNER_SIZES = new Set(['compact', 'standard', 'large']);

/**
 * Valid image size values.
 */
export const VALID_IMAGE_SIZES = new Set(['small', 'medium', 'large', 'full']);

/**
 * Valid alignment values.
 */
export const VALID_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

/**
 * Validate that a field value is a plain string (not an array or object).
 * Returns an error string if invalid, null if valid.
 *
 * This is the core guard against [object Object] rendering.
 * Arrays and objects supplied to string fields are REJECTED — never coerced
 * with String(value), because String([1,2,3]) = "1,2,3" and
 * String({a:1}) = "[object Object]".
 */
export function validateStringField(
  value: unknown,
  fieldName: string,
  blockType: string,
): string | null {
  if (value === undefined || value === null) return null; // absent is fine
  if (typeof value === 'string') return null; // correct
  if (Array.isArray(value)) {
    return `${blockType}.${fieldName}: expected string, got array — arrays are not valid for this field`;
  }
  if (typeof value === 'object') {
    return `${blockType}.${fieldName}: expected string, got object — objects are not valid for this field (would render as [object Object])`;
  }
  // number/boolean — coercible, not an error but worth noting
  return null;
}

/**
 * Validate block-type-aware field values in an addBlock or updateBlock operation.
 *
 * Rules:
 *   heading/text:  content must be string
 *   rich_text:     html must be string
 *   banner:        title and body must be strings; variant/size/align must be valid enums
 *   image:         src and alt must be strings; size/align must be valid; preserveAspectRatio must be boolean
 *   table:         columns and rows must match canonical TableBlock schema (arrays of objects)
 *   system_field:  fieldKey/label/fallback must be strings
 *
 * Returns an array of error strings (empty = valid).
 * Does NOT reject operations — errors are collected and reported in the proposal.
 */
export function validateBlockFieldTypes(op: BuilderOperation): string[] {
  const errors: string[] = [];
  const blockType = String(op.blockType ?? op.toolId ?? 'unknown');

  // ── Determine the effective type for validation ────────────────────────────
  // For toolId ops, we check the resolved block type from the catalogue.
  // For blockType ops, we use the blockType directly.
  // We validate the fields that the AI supplied — not the factory defaults.

  // String field checks — apply to all ops that supply these fields
  const stringFields: Array<[string, unknown]> = [
    ['content', op.content],
    ['html',    op.html],
    ['title',   op.title],
    ['body',    op.body],
    ['src',     op.src],
    ['alt',     op.alt],
    ['label',   op.label],
    ['fallback', op.fallback],
    ['fieldKey', op.fieldKey],
  ];

  for (const [field, value] of stringFields) {
    if (value !== undefined) {
      const err = validateStringField(value, field, blockType);
      if (err) errors.push(err);
    }
  }

  // ── Banner-specific enum validation ───────────────────────────────────────
  const isExplicitBanner = op.blockType === 'banner' ||
    (typeof op.toolId === 'string' && op.toolId.includes('banner'));

  if (isExplicitBanner) {
    if (op.variant !== undefined && !VALID_BANNER_VARIANTS.has(String(op.variant))) {
      errors.push(`banner.variant: "${op.variant}" is not a valid banner variant. Valid values: ${[...VALID_BANNER_VARIANTS].join(', ')}`);
    }
    if (op.size !== undefined && !VALID_BANNER_SIZES.has(String(op.size))) {
      errors.push(`banner.size: "${op.size}" is not a valid banner size. Valid values: ${[...VALID_BANNER_SIZES].join(', ')}`);
    }
  }

  // ── Image-specific validation ─────────────────────────────────────────────
  const isExplicitImage = op.blockType === 'image' ||
    (typeof op.toolId === 'string' && (op.toolId.includes('image') || op.toolId.includes('ppe') || op.toolId.includes('risk_matrix')));

  if (isExplicitImage) {
    if (op.size !== undefined && !VALID_IMAGE_SIZES.has(String(op.size))) {
      errors.push(`image.size: "${op.size}" is not a valid image size. Valid values: ${[...VALID_IMAGE_SIZES].join(', ')}`);
    }
    if (op.preserveAspectRatio !== undefined && typeof op.preserveAspectRatio !== 'boolean') {
      errors.push(`image.preserveAspectRatio: expected boolean, got ${typeof op.preserveAspectRatio}`);
    }
  }

  // ── Alignment validation (all block types) ────────────────────────────────
  if (op.align !== undefined && !VALID_ALIGNMENTS.has(String(op.align))) {
    errors.push(`${blockType}.align: "${op.align}" is not a valid alignment. Valid values: ${[...VALID_ALIGNMENTS].join(', ')}`);
  }

  // ── Table schema validation ───────────────────────────────────────────────
  const isExplicitTable = op.blockType === 'table' ||
    (typeof op.toolId === 'string' && op.toolId.startsWith('tables.'));

  if (isExplicitTable) {
    // If the AI supplied columns/rows as arrays, validate they are arrays of objects
    if (op.columns !== undefined) {
      if (!Array.isArray(op.columns)) {
        errors.push(`table.columns: expected array of column objects, got ${typeof op.columns}`);
      } else {
        for (let i = 0; i < (op.columns as unknown[]).length; i++) {
          const col = (op.columns as unknown[])[i];
          if (typeof col !== 'object' || col === null || Array.isArray(col)) {
            errors.push(`table.columns[${i}]: expected column object with id/header/cellType, got ${Array.isArray(col) ? 'array' : typeof col}`);
          }
        }
      }
    }
    if (op.rows !== undefined && !Array.isArray(op.rows) && typeof op.rows !== 'number') {
      errors.push(`table.rows: expected array of row objects or a row count number, got ${typeof op.rows}`);
    }
  }

  return errors;
}

/**
 * Validate block field types in a sanitiseBlockUpdate operation.
 * Same rules as validateBlockFieldTypes but applied to the update patch.
 * The existing block's type is passed in as existingBlockType.
 *
 * Returns an array of error strings (empty = valid).
 */
export function validateUpdateFieldTypes(
  op: BuilderOperation,
  existingBlockType: string,
): string[] {
  // Use the existing block type as the context for validation
  const opWithType = { ...op, blockType: existingBlockType };
  return validateBlockFieldTypes(opWithType);
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a set of operations against the builder type.
 * Returns an array of error strings (empty = valid).
 * AI output is treated as untrusted input — every operation is schema-validated here.
 *
 * Includes block-type-aware field value validation:
 *   - String fields (content, html, title, body, src, alt, label, fallback, fieldKey)
 *     must be strings — arrays and objects are rejected.
 *   - Banner variant/size must be valid enum values.
 *   - Image size must be valid; preserveAspectRatio must be boolean.
 *   - Alignment must be a valid value.
 *   - Table columns/rows must be arrays of objects (not flat arrays of strings).
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

        // Block-type-aware field value validation (applies to both paths)
        const fieldErrors = validateBlockFieldTypes(op);
        errors.push(...fieldErrors);
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
 *
 * SECURITY: validates value types before copying.
 *   - String fields: must be strings — arrays and objects are DROPPED (not coerced).
 *     String(array) = "a,b,c" and String(object) = "[object Object]" — both wrong.
 *   - Boolean fields: must be booleans — strings/numbers are coerced.
 *   - Number fields: must be numbers — strings are coerced.
 *
 * The existingBlockType parameter is used to apply type-specific rules.
 * If not provided, all allowed keys are copied with type checking.
 */
export function sanitiseBlockUpdate(
  op: BuilderOperation,
  existingBlockType?: string,
): Record<string, unknown> {
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

  // Fields that must be strings — arrays/objects are DROPPED, not coerced
  const STRING_FIELDS = new Set([
    'content', 'html', 'title', 'body', 'src', 'alt',
    'label', 'fallback', 'fieldKey', 'placeholder', 'helpText',
    'color', 'fontSize', 'style', 'variant', 'size', 'align',
    'customBgColor', 'customBorderColor', 'headerBgColor', 'headerTextColor',
    'backgroundColor', 'borderColor', 'fieldType',
  ]);

  // Fields that must be booleans
  const BOOLEAN_FIELDS = new Set([
    'bold', 'italic', 'showOnExport', 'preserveAspectRatio',
    'showLabel', 'required', 'stripedRows', 'repeatable', 'showRowNumbers', 'showLegend',
  ]);

  // Fields that must be numbers
  const NUMBER_FIELDS = new Set(['level', 'thickness', 'height', 'padding']);

  const out: Record<string, unknown> = {};

  for (const key of ALLOWED_KEYS) {
    if (!(key in op)) continue;
    const value = op[key];

    if (STRING_FIELDS.has(key)) {
      // Must be a string — drop arrays and objects
      if (typeof value === 'string') {
        out[key] = value;
      } else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        // Drop silently — the validation step already reported this error
        // Never coerce: String([]) = "" and String({}) = "[object Object]"
      } else if (value !== undefined && value !== null) {
        // number/boolean — coerce to string
        out[key] = String(value);
      }
    } else if (BOOLEAN_FIELDS.has(key)) {
      if (value !== undefined && value !== null) {
        out[key] = Boolean(value);
      }
    } else if (NUMBER_FIELDS.has(key)) {
      if (value !== undefined && value !== null) {
        const n = Number(value);
        if (!isNaN(n)) out[key] = n;
      }
    } else {
      // Other fields (e.g. padding object, columns/rows for table updates)
      out[key] = value;
    }
  }

  return out;
}
