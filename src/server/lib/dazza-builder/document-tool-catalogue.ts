/**
 * dazza-builder/document-tool-catalogue.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical Document Builder tool catalogue.
 *
 * DESIGN RULES:
 * 1. Pure TypeScript — no React imports, no client-only code.
 *    Safe to import from both server (Dazza) and client (BlockLibrarySidebar).
 * 2. Every Dazza-enabled entry has a `factory()` that returns the exact block
 *    payload the Document Builder stores in builder_json.  The factory is the
 *    single source of truth — the manual button and Dazza both call it.
 * 3. Protected fields (type, src for bundled assets) cannot be overridden by
 *    AI-supplied content.  The factory always wins for those fields.
 * 4. User-only tools (import, image upload) are listed so Dazza can describe
 *    them, but `dazzaEnabled: false` prevents autonomous insertion.
 * 5. Unsupported tools (columns, safety_badge_row, risk_matrix_banner) are
 *    listed with `dazzaEnabled: false` and a note — Dazza will not pretend it
 *    can insert them.
 *
 * BUNDLED ASSET PATHS — canonical, never invent alternatives:
 *   /airo-assets/images/safety-badges/ppe-banner-strip
 *   /airo-assets/images/safety-badges/risk-matrix
 *   /airo-assets/images/safety-badges/risk-assessment-banner
 *   /airo-assets/images/safety-badges/icons-sheet
 */

import { nanoid } from 'nanoid';

// ── Re-export newId so BlockLibrarySidebar can import from one place ──────────
// (BlockLibrarySidebar currently imports newId from useDocumentStore — that
//  import stays unchanged.  This export is for server-side catalogue tests.)
export function newId(): string { return nanoid(10); }

// ── Block payload types (minimal, serialisable — mirrors DocumentBuilder/types.ts) ──

export type CatalogueBlock = Record<string, unknown>;

// ── Catalogue entry ───────────────────────────────────────────────────────────

export type CatalogueCategory =
  | 'structure'
  | 'tables'
  | 'system_fields'
  | 'advanced_banners'
  | 'safety_tools'
  | 'layout'
  | 'document_widgets'
  | 'user_only';

export interface CatalogueEntry {
  /** Stable identifier used in addBlock toolId field */
  toolId: string;
  /** User-facing name shown in proposals and "what tools" answers */
  label: string;
  /** One-line description */
  description: string;
  /** Category for grouping */
  category: CatalogueCategory;
  /**
   * Whether Dazza can autonomously insert this tool.
   * false = Dazza may describe it but must not claim it can insert it.
   */
  dazzaEnabled: boolean;
  /**
   * Reason Dazza cannot insert this tool (only when dazzaEnabled=false).
   * Dazza uses this to give the user a helpful explanation.
   */
  unavailableReason?: string;
  /**
   * Factory that produces the canonical block payload.
   * Present on all dazzaEnabled=true entries and on some dazzaEnabled=false
   * entries (e.g. safety_badge_row) where the factory is used by the manual
   * button but Dazza cannot supply the required interactive inputs.
   *
   * SECURITY: The factory always controls protected fields (type, bundled src).
   * AI-supplied overrides for those fields are silently ignored.
   */
  factory?: () => CatalogueBlock;
  /**
   * Fields the AI may supply to customise the block.
   * Only these fields are merged from the AI operation — all others are
   * taken from the factory output.
   */
  aiInputs?: string[];
  /**
   * Fields that are PROTECTED — the factory value always wins.
   * AI-supplied values for these keys are silently discarded.
   */
  protectedFields?: string[];
}

// ── Catalogue ─────────────────────────────────────────────────────────────────

export const DOCUMENT_TOOL_CATALOGUE: CatalogueEntry[] = [

  // ── STRUCTURE ──────────────────────────────────────────────────────────────

  {
    toolId: 'structure.document_title',
    label: 'Document Title (H1)',
    description: 'Top-level document heading, level 1',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'heading', content: 'Document Title', level: 1, align: 'left' }),
    aiInputs: ['content', 'align'],
    protectedFields: ['type', 'level'],
  },
  {
    toolId: 'structure.section_heading',
    label: 'Section Heading (H2)',
    description: 'Section heading, level 2',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'heading', content: 'Section Heading', level: 2, align: 'left' }),
    aiInputs: ['content', 'align'],
    protectedFields: ['type', 'level'],
  },
  {
    toolId: 'structure.subsection',
    label: 'Sub-section (H3)',
    description: 'Sub-section heading, level 3',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'heading', content: 'Sub-section', level: 3, align: 'left' }),
    aiInputs: ['content', 'align'],
    protectedFields: ['type', 'level'],
  },
  {
    toolId: 'structure.paragraph',
    label: 'Paragraph',
    description: 'Plain text paragraph',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'text', content: '', align: 'left' }),
    aiInputs: ['content', 'align', 'bold', 'italic', 'fontSize'],
    protectedFields: ['type'],
  },
  {
    toolId: 'structure.bullet_list',
    label: 'Bullet List',
    description: 'Rich text block pre-seeded with a bullet list',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'rich_text', html: '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>' }),
    aiInputs: ['html'],
    protectedFields: ['type'],
  },
  {
    toolId: 'structure.divider',
    label: 'Section Divider',
    description: 'Horizontal rule',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'divider', style: 'solid', thickness: 1 }),
    aiInputs: ['style', 'thickness'],
    protectedFields: ['type'],
  },
  {
    toolId: 'structure.spacer',
    label: 'Spacer',
    description: 'Vertical gap (px)',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'spacer', height: 24 }),
    aiInputs: ['height'],
    protectedFields: ['type'],
  },
  {
    toolId: 'structure.page_break',
    label: 'Page Break',
    description: 'Force new page on PDF export',
    category: 'structure',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'page_break' }),
    aiInputs: [],
    protectedFields: ['type'],
  },

  // ── TABLES ─────────────────────────────────────────────────────────────────

  {
    toolId: 'tables.blank',
    label: 'Blank Table',
    description: '3-column, 2-row static table',
    category: 'tables',
    dazzaEnabled: true,
    factory: () => {
      const c1 = newId(); const c2 = newId(); const c3 = newId();
      return {
        id: newId(), type: 'table', mode: 'static', stripedRows: true,
        columns: [
          { id: c1, header: 'Column 1', cellType: 'text', width: 1 },
          { id: c2, header: 'Column 2', cellType: 'text', width: 1 },
          { id: c3, header: 'Column 3', cellType: 'text', width: 1 },
        ],
        rows: [
          { id: newId(), cells: { [c1]: '', [c2]: '', [c3]: '' } },
          { id: newId(), cells: { [c1]: '', [c2]: '', [c3]: '' } },
        ],
      };
    },
    aiInputs: [],
    protectedFields: ['type', 'mode'],
  },
  {
    toolId: 'tables.detail_grid',
    label: 'Detail Grid',
    description: '2-column label/value table for document details',
    category: 'tables',
    dazzaEnabled: true,
    factory: () => {
      const cLabel = newId(); const cValue = newId();
      return {
        id: newId(), type: 'table', mode: 'static', stripedRows: false,
        columns: [
          { id: cLabel, header: 'Field',  cellType: 'text', width: 1 },
          { id: cValue, header: 'Detail', cellType: 'text', width: 2 },
        ],
        rows: [
          { id: newId(), cells: { [cLabel]: 'Project Name',  [cValue]: '' } },
          { id: newId(), cells: { [cLabel]: 'Site Address',  [cValue]: '' } },
          { id: newId(), cells: { [cLabel]: 'Date',          [cValue]: '' } },
          { id: newId(), cells: { [cLabel]: 'Prepared By',   [cValue]: '' } },
        ],
      };
    },
    aiInputs: [],
    protectedFields: ['type', 'mode'],
  },
  {
    toolId: 'tables.swms_risk',
    label: 'SWMS Risk Table',
    description: 'Activity / Hazard / Risk / Control / Residual Risk table',
    category: 'tables',
    dazzaEnabled: true,
    factory: () => {
      const cActivity = newId(); const cHazard = newId(); const cRisk = newId();
      const cControl = newId(); const cResidual = newId();
      return {
        id: newId(), type: 'table', mode: 'static', stripedRows: true,
        columns: [
          { id: cActivity, header: 'Activity',      cellType: 'text', width: 2 },
          { id: cHazard,   header: 'Hazard',         cellType: 'text', width: 2 },
          { id: cRisk,     header: 'Initial Risk',   cellType: 'text', width: 1 },
          { id: cControl,  header: 'Control Measures', cellType: 'text', width: 3 },
          { id: cResidual, header: 'Residual Risk',  cellType: 'text', width: 1 },
        ],
        rows: [
          { id: newId(), cells: { [cActivity]: '', [cHazard]: '', [cRisk]: '', [cControl]: '', [cResidual]: '' } },
          { id: newId(), cells: { [cActivity]: '', [cHazard]: '', [cRisk]: '', [cControl]: '', [cResidual]: '' } },
        ],
      };
    },
    aiInputs: [],
    protectedFields: ['type', 'mode'],
  },
  {
    toolId: 'tables.sign_off',
    label: 'Sign-Off Table',
    description: 'Name / Signature / Date sign-off table',
    category: 'tables',
    dazzaEnabled: true,
    factory: () => {
      const cName = newId(); const cSig = newId(); const cDate = newId();
      return {
        id: newId(), type: 'table', mode: 'static', stripedRows: false,
        columns: [
          { id: cName, header: 'Name',      cellType: 'text',      width: 2 },
          { id: cSig,  header: 'Signature', cellType: 'signature', width: 2 },
          { id: cDate, header: 'Date',       cellType: 'date',      width: 1 },
        ],
        rows: [
          { id: newId(), cells: { [cName]: '', [cSig]: '', [cDate]: '' } },
          { id: newId(), cells: { [cName]: '', [cSig]: '', [cDate]: '' } },
          { id: newId(), cells: { [cName]: '', [cSig]: '', [cDate]: '' } },
        ],
      };
    },
    aiInputs: [],
    protectedFields: ['type', 'mode'],
  },

  // ── ADVANCED BANNERS ───────────────────────────────────────────────────────

  {
    toolId: 'advanced.banner_info',
    label: 'Info Banner',
    description: 'Blue information callout',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'info', title: 'Important Notice', body: '', size: 'standard', align: 'left', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport'],
    protectedFields: ['type', 'variant'],
  },
  {
    toolId: 'advanced.banner_warning',
    label: 'Warning Banner',
    description: 'Amber warning callout',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'warning', title: 'Warning', body: '', size: 'standard', align: 'left', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport'],
    protectedFields: ['type', 'variant'],
  },
  {
    toolId: 'advanced.banner_danger',
    label: 'Danger Banner',
    description: 'Red danger callout',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'danger', title: 'Danger', body: '', size: 'standard', align: 'left', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport'],
    protectedFields: ['type', 'variant'],
  },
  {
    toolId: 'advanced.banner_success',
    label: 'Success Banner',
    description: 'Green success callout',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'success', title: 'Success', body: '', size: 'standard', align: 'left', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport'],
    protectedFields: ['type', 'variant'],
  },
  {
    toolId: 'advanced.banner_safety',
    label: 'Safety Banner',
    description: 'Yellow safety callout',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'safety', title: 'Safety Notice', body: '', size: 'standard', align: 'left', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport'],
    protectedFields: ['type', 'variant'],
  },
  {
    toolId: 'advanced.banner_safety_first',
    label: 'Safety First Banner',
    description: 'Hazard-stripe safety poster',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'safety_first', title: 'SAFETY FIRST', body: 'ARRIVE SAFE • WORK SAFE • GO HOME SAFE', size: 'standard', align: 'center', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport'],
    protectedFields: ['type', 'variant'],
  },
  {
    toolId: 'advanced.banner_first_aid',
    label: 'First Aid Banner',
    description: 'Red cross first aid header',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'first_aid', title: 'FIRST AID', body: 'IN AN EMERGENCY CALL 000', size: 'standard', align: 'left', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport'],
    protectedFields: ['type', 'variant'],
  },
  {
    toolId: 'advanced.banner_custom',
    label: 'Custom Banner',
    description: 'Custom-styled callout with user-defined colours',
    category: 'advanced_banners',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'banner', variant: 'custom', title: 'Custom Banner', body: '', size: 'standard', align: 'left', showOnExport: true }),
    aiInputs: ['title', 'body', 'size', 'align', 'showOnExport', 'customBgColor', 'customBorderColor'],
    protectedFields: ['type', 'variant'],
  },

  // ── SAFETY TOOLS ───────────────────────────────────────────────────────────

  {
    toolId: 'advanced.ppe_banner',
    label: 'PPE Banner',
    description: 'Full-width PPE required icon strip — bundled asset image',
    category: 'safety_tools',
    dazzaEnabled: true,
    // ── CANONICAL PPE BANNER FACTORY ─────────────────────────────────────────
    // This is the single source of truth for the PPE Banner block payload.
    // The manual Advanced → PPE Banner button and Dazza both call this factory.
    // Protected fields (type, src) cannot be overridden by AI-supplied content.
    factory: () => ({
      id: newId(),
      type: 'image',
      src: '/airo-assets/images/safety-badges/ppe-banner-strip',
      alt: 'PPE Required — Personal Protective Equipment',
      size: 'full',
      align: 'center',
      preserveAspectRatio: true,
    }),
    aiInputs: ['alt'],
    protectedFields: ['type', 'src', 'size', 'align', 'preserveAspectRatio'],
  },
  {
    toolId: 'advanced.risk_assessment',
    label: 'Risk Assessment',
    description: 'AS/NZS 5×5 risk matrix — likelihood, level and degree of risk',
    category: 'safety_tools',
    dazzaEnabled: true,
    factory: () => ({
      id: newId(), type: 'risk_matrix',
      title: 'Risk Assessment Matrix',
      showLegend: true,
      showOnExport: true,
    }),
    aiInputs: ['title', 'showLegend', 'showOnExport'],
    protectedFields: ['type'],
  },
  {
    toolId: 'advanced.risk_matrix_image',
    label: 'Risk Matrix (image)',
    description: 'Risk Matrix reference image — consequence, likelihood and degree of control',
    category: 'safety_tools',
    dazzaEnabled: true,
    factory: () => ({
      id: newId(),
      type: 'image',
      src: '/airo-assets/images/safety-badges/risk-matrix',
      alt: 'Risk Matrix — consequence, likelihood and degree of control',
      size: 'full',
      align: 'center',
      preserveAspectRatio: true,
    }),
    aiInputs: ['alt'],
    protectedFields: ['type', 'src', 'size', 'align', 'preserveAspectRatio'],
  },
  {
    toolId: 'advanced.risk_matrix_banner',
    label: 'Risk Matrix Banner',
    description: 'Compact risk level strip — drop at top of any document',
    category: 'safety_tools',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'risk_matrix_banner' }),
    aiInputs: [],
    protectedFields: ['type'],
  },
  {
    toolId: 'advanced.safety_badge_row',
    label: 'Safety Badge Row',
    description: 'PPE badge row — requires interactive badge selection',
    category: 'safety_tools',
    dazzaEnabled: false,
    unavailableReason: 'Safety Badge Row requires the user to select individual PPE badges interactively. Use the Safety → PPE Required button in the block library to insert a pre-configured row.',
    factory: () => ({
      id: newId(), type: 'safety_badge_row', size: 'md', align: 'center',
      badges: [
        { id: newId(), badgeType: 'helmet',         label: 'Safety Helmet',      required: true },
        { id: newId(), badgeType: 'hi_vis',          label: 'Hi-Vis Clothing',    required: true },
        { id: newId(), badgeType: 'footwear',        label: 'Safety Footwear',    required: true },
        { id: newId(), badgeType: 'eye_protection',  label: 'Eye Protection',     required: true },
        { id: newId(), badgeType: 'gloves',          label: 'Gloves',             required: true },
        { id: newId(), badgeType: 'hearing',         label: 'Hearing Protection', required: true },
        { id: newId(), badgeType: 'fall_arrest',     label: 'Fall Arrest',        required: true },
        { id: newId(), badgeType: 'ppe',             label: 'PPE',                required: true },
        { id: newId(), badgeType: 'electrical_gloves', label: 'Electrical Gloves', required: true },
      ],
    }),
  },

  // ── LAYOUT ─────────────────────────────────────────────────────────────────

  {
    toolId: 'layout.rich_text',
    label: 'Rich Text Block',
    description: 'Formatted content area with full editor',
    category: 'layout',
    dazzaEnabled: true,
    factory: () => ({ id: newId(), type: 'rich_text', html: '<p></p>' }),
    aiInputs: ['html'],
    protectedFields: ['type'],
  },
  {
    toolId: 'layout.columns',
    label: 'Two-Column Grid',
    description: 'Two-column layout container — requires interactive column editing',
    category: 'layout',
    dazzaEnabled: false,
    unavailableReason: 'Two-Column Grid requires interactive column editing. Use the Layout & Media → Columns button in the block library to insert it.',
    factory: () => ({
      id: newId(), type: 'columns', gap: 'md',
      columns: [
        { id: newId(), width: 1, blocks: [] },
        { id: newId(), width: 1, blocks: [] },
      ],
    }),
  },

  // ── DOCUMENT WIDGETS ───────────────────────────────────────────────────────

  {
    toolId: 'widget.swms',
    label: 'SWMS Widget',
    description: 'Full Safe Work Method Statement structure — applied via Apply Widget panel',
    category: 'document_widgets',
    dazzaEnabled: false,
    unavailableReason: 'SWMS Widget inserts a full multi-block SWMS structure. Use the Apply Widget panel (top toolbar) to apply it.',
  },
  {
    toolId: 'widget.safety_plan',
    label: 'Safety Plan Widget',
    description: 'Full Safety Plan structure — applied via Apply Widget panel',
    category: 'document_widgets',
    dazzaEnabled: false,
    unavailableReason: 'Safety Plan Widget inserts a full multi-block structure. Use the Apply Widget panel (top toolbar) to apply it.',
  },
  {
    toolId: 'widget.policy',
    label: 'Policy Widget',
    description: 'Full Policy document structure — applied via Apply Widget panel',
    category: 'document_widgets',
    dazzaEnabled: false,
    unavailableReason: 'Policy Widget inserts a full multi-block structure. Use the Apply Widget panel (top toolbar) to apply it.',
  },

  // ── USER-ONLY ──────────────────────────────────────────────────────────────

  {
    toolId: 'user.import_docx',
    label: 'Import DOCX / PDF',
    description: 'Import a Word or PDF file — requires the user to select a file',
    category: 'user_only',
    dazzaEnabled: false,
    unavailableReason: 'Import requires the user to select a local file. Use the Import DOCX / PDF button in the block library.',
  },
  {
    toolId: 'user.upload_image',
    label: 'Upload / Select Image',
    description: 'Upload or select a new image file — requires the user to choose a file',
    category: 'user_only',
    dazzaEnabled: false,
    unavailableReason: 'Image upload requires the user to select a local file. Use the Image block in the block library and upload via the inspector.',
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

/** Map from toolId → CatalogueEntry for O(1) lookup */
export const CATALOGUE_BY_TOOL_ID: Readonly<Record<string, CatalogueEntry>> =
  Object.fromEntries(DOCUMENT_TOOL_CATALOGUE.map((e) => [e.toolId, e]));

/** All Dazza-enabled entries */
export const DAZZA_ENABLED_TOOLS: CatalogueEntry[] =
  DOCUMENT_TOOL_CATALOGUE.filter((e) => e.dazzaEnabled);

/** All user-only entries */
export const USER_ONLY_TOOLS: CatalogueEntry[] =
  DOCUMENT_TOOL_CATALOGUE.filter((e) => e.category === 'user_only');

/** All unsupported (dazzaEnabled=false, not user_only) entries */
export const UNSUPPORTED_TOOLS: CatalogueEntry[] =
  DOCUMENT_TOOL_CATALOGUE.filter((e) => !e.dazzaEnabled && e.category !== 'user_only');

/**
 * Resolve a toolId to its CatalogueEntry.
 * Returns null if the toolId is unknown or not Dazza-enabled.
 */
export function resolveTool(toolId: string): CatalogueEntry | null {
  const entry = CATALOGUE_BY_TOOL_ID[toolId];
  if (!entry) return null;
  return entry;
}

/**
 * Build a block from a toolId, merging only the allowed AI inputs.
 *
 * SECURITY:
 * - Protected fields from the factory output are never overridden.
 * - Only keys listed in entry.aiInputs are merged from aiOverrides.
 * - Returns null if the toolId is unknown or dazzaEnabled=false.
 *
 * @param toolId   Stable tool identifier from the catalogue
 * @param aiOverrides  AI-supplied field overrides (only aiInputs keys are used)
 */
export function buildBlockFromToolId(
  toolId: string,
  aiOverrides: Record<string, unknown> = {},
): CatalogueBlock | null {
  const entry = resolveTool(toolId);
  if (!entry || !entry.dazzaEnabled || !entry.factory) return null;

  const base = entry.factory();
  const allowed = new Set(entry.aiInputs ?? []);
  const protected_ = new Set(entry.protectedFields ?? []);

  const merged: CatalogueBlock = { ...base };
  for (const [key, value] of Object.entries(aiOverrides)) {
    if (allowed.has(key) && !protected_.has(key)) {
      merged[key] = value;
    }
    // Protected fields and non-allowed keys are silently discarded.
  }

  return merged;
}

// ── Grouped catalogue for Dazza "what tools" answer ──────────────────────────

export interface CatalogueGroup {
  category: CatalogueCategory;
  label: string;
  tools: Array<{
    toolId: string;
    label: string;
    description: string;
    dazzaEnabled: boolean;
    unavailableReason?: string;
    aiInputs?: string[];
  }>;
}

const CATEGORY_LABELS: Record<CatalogueCategory, string> = {
  structure:         'Structure',
  tables:            'Tables',
  system_fields:     'System Fields (Auto-fill)',
  advanced_banners:  'Advanced Banners',
  safety_tools:      'Safety Tools',
  layout:            'Layout',
  document_widgets:  'Document Widgets',
  user_only:         'User-Only Tools',
};

export function getGroupedCatalogue(): CatalogueGroup[] {
  const groups = new Map<CatalogueCategory, CatalogueGroup>();

  for (const entry of DOCUMENT_TOOL_CATALOGUE) {
    if (!groups.has(entry.category)) {
      groups.set(entry.category, {
        category: entry.category,
        label: CATEGORY_LABELS[entry.category],
        tools: [],
      });
    }
    groups.get(entry.category)!.tools.push({
      toolId: entry.toolId,
      label: entry.label,
      description: entry.description,
      dazzaEnabled: entry.dazzaEnabled,
      unavailableReason: entry.unavailableReason,
      aiInputs: entry.aiInputs,
    });
  }

  return Array.from(groups.values());
}

/**
 * Build the Document Tools section of the Dazza system prompt.
 * Generated from the catalogue — no hand-written list to maintain.
 */
export function buildDocumentToolsPromptSection(): string {
  const groups = getGroupedCatalogue();
  const lines: string[] = [
    '## Document Tools Catalogue',
    '',
    'Use `builder_list_document_tools` to show the user the full grouped catalogue.',
    'Use `toolId` in addBlock operations to insert a named tool — the server resolves the canonical block.',
    '',
    'ADDBLOCK WITH toolId:',
    '  { "op": "addBlock", "toolId": "<toolId>", "afterBlockId": "..." }',
    '  AI inputs (optional overrides): only the fields listed under each tool.',
    '  Protected fields are always taken from the canonical factory — never override them.',
    '',
  ];

  for (const group of groups) {
    lines.push(`### ${group.label}`);
    for (const tool of group.tools) {
      if (tool.dazzaEnabled) {
        const inputs = tool.aiInputs?.length ? ` — AI inputs: ${tool.aiInputs.join(', ')}` : '';
        lines.push(`- **${tool.toolId}** — ${tool.label}: ${tool.description}${inputs}`);
      } else {
        lines.push(`- ~~${tool.toolId}~~ — ${tool.label} *(user-only or requires interaction: ${tool.unavailableReason ?? 'not available to Dazza'})*`);
      }
    }
    lines.push('');
  }

  lines.push(
    'SYSTEM FIELDS: Use `system_field` blockType with a `fieldKey` from the System Fields registry.',
    'Common keys: company_name, job_number, job_name, customer_name, document_title, document_number, document_revision.',
    'Call `builder_list_document_tools` to see the full system fields list.',
    '',
    'PROPOSAL DISPLAY: When proposing a named tool, say "Insert [label]" e.g. "Insert Advanced → PPE Banner".',
    'Never say "add image block" when you mean "Insert Advanced → PPE Banner".',
  );

  return lines.join('\n');
}
