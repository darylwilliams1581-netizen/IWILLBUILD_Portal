/**
 * Smart Document Builder — Core Type Definitions
 * ─────────────────────────────────────────────────────────────────────────────
 * All block types, field types, system field types, page layout, and theme
 * definitions live here. The builder JSON stored in document_templates.builder_json
 * is a serialised DocumentTemplate.
 */

// ── IDs ───────────────────────────────────────────────────────────────────────

export type BlockId = string;

// ─────────────────────────────────────────────────────────────────────────────
// CONDITIONAL LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every operator that can appear in a condition's left-hand comparison.
 *
 * String / text operators:   equals, not_equals, contains, not_contains,
 *                             is_empty, is_not_empty, one_of, not_one_of
 * Numeric operators:         greater_than, less_than, greater_than_or_equal,
 *                             less_than_or_equal
 * Date operators:            before_date, after_date
 * Boolean shorthand:         is_true, is_false  (for yes/no, checkbox)
 */
export type LogicOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'before_date'
  | 'after_date'
  | 'one_of'
  | 'not_one_of'
  | 'is_true'
  | 'is_false';

/**
 * Where the condition value comes from.
 *
 * - field        → a FieldBlock in this document (by block id)
 * - system_field → a system field token key (e.g. "job.risk_rating")
 * - static       → a hard-coded literal value (used for "always" rules)
 */
export type ConditionSource = 'field' | 'system_field' | 'static';

/**
 * A single condition clause.
 * Multiple conditions in a rule are combined with `conditionMode` (AND / OR).
 */
export interface LogicCondition {
  id: string;
  /** Where the left-hand value comes from */
  source: ConditionSource;
  /**
   * For source=field:        the FieldBlock.id
   * For source=system_field: the system field key (e.g. "job.risk_rating")
   * For source=static:       unused / empty
   */
  fieldId: string;
  /** Human-readable label shown in the rule builder (auto-populated) */
  fieldLabel: string;
  operator: LogicOperator;
  /**
   * The right-hand comparison value.
   * - string for text/date comparisons
   * - string[] for one_of / not_one_of
   * - boolean for is_true / is_false (value ignored — operator is self-contained)
   * - undefined for is_empty / is_not_empty
   */
  value?: string | string[] | boolean;
}

/**
 * All possible action types a rule can trigger.
 */
export type LogicActionType =
  | 'show'               // make a block visible
  | 'hide'               // hide a block
  | 'require'            // mark a field required
  | 'unrequire'          // mark a field not required
  | 'enable'             // enable a disabled field
  | 'disable'            // disable / lock a field
  | 'set_value'          // set a field's value to a literal
  | 'clear_value'        // clear a field's value
  | 'show_banner'        // inject a warning/info banner
  | 'require_approval'   // flag the document for approval before submission
  | 'require_signature'  // mark a signature field required
  | 'require_upload'     // mark a file upload field required
  | 'prevent_submission' // block form submission with a message
  | 'insert_section';    // show a hidden section block

/**
 * A single action triggered when a rule's conditions are met.
 */
export interface LogicAction {
  id: string;
  action: LogicActionType;
  /**
   * The block or field this action targets.
   * - For show/hide/insert_section: a BlockId
   * - For require/unrequire/enable/disable/set_value/clear_value/
   *   require_signature/require_upload: a FieldBlock.id
   * - For show_banner/require_approval/prevent_submission: unused
   */
  targetBlockId?: string;
  /** Human-readable label for the target (auto-populated) */
  targetLabel?: string;
  /** For set_value: the literal value to assign */
  setValue?: string;
  /** For show_banner: the banner text */
  bannerText?: string;
  /** For show_banner: the banner variant */
  bannerVariant?: 'info' | 'warning' | 'danger' | 'success' | 'safety';
  /** For prevent_submission: the message shown to the user */
  preventMessage?: string;
}

/**
 * A complete conditional logic rule.
 *
 * Evaluation:
 *   if conditionMode === 'AND': ALL conditions must be true
 *   if conditionMode === 'OR':  ANY condition must be true
 *
 * The rule is attached to a specific block (the "owner") but its actions
 * can target any block in the document.
 */
export interface LogicRule {
  id: string;
  /** The block this rule is authored on (for UI grouping) */
  ownerBlockId: string;
  /** Human-readable description (auto-generated or user-edited) */
  description?: string;
  conditionMode: 'AND' | 'OR';
  conditions: LogicCondition[];
  actions: LogicAction[];
  /** Disabled rules are stored but never evaluated */
  enabled: boolean;
}

/**
 * Validation result for a single rule.
 * Broken rules have references to deleted blocks/fields.
 */
export interface LogicRuleValidation {
  ruleId: string;
  valid: boolean;
  errors: string[];
}

/**
 * Runtime state produced by the logic engine for a single block.
 * Consumed by BlockCanvas and BlockRenderer in fill/preview mode.
 */
export interface BlockLogicState {
  visible: boolean;
  required?: boolean;       // only meaningful for FieldBlocks
  disabled?: boolean;       // only meaningful for FieldBlocks
  forcedValue?: string;     // set_value action result
  injectedBanners: Array<{  // show_banner action results
    text: string;
    variant: 'info' | 'warning' | 'danger' | 'success' | 'safety';
  }>;
}

/**
 * Document-level flags set by logic rules.
 */
export interface DocumentLogicFlags {
  requiresApproval: boolean;
  submissionBlocked: boolean;
  submissionBlockedMessage?: string;
}

// ── Page Layout ───────────────────────────────────────────────────────────────

export type PaperSize = 'A4' | 'Letter' | 'Legal';
export type Orientation = 'portrait' | 'landscape';
export type MarginPreset = 'none' | 'narrow' | 'standard' | 'wide';

export interface PageLayout {
  paperSize: PaperSize;
  orientation: Orientation;
  margins: MarginPreset;
}

export const DEFAULT_PAGE_LAYOUT: PageLayout = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'standard',
};

// ── Theme ─────────────────────────────────────────────────────────────────────

export interface DocumentTheme {
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  tableHeaderColor: string;
  tableHeaderTextColor: string;
}

export const DEFAULT_THEME: DocumentTheme = {
  backgroundColor: '#ffffff',
  accentColor: '#f97316',
  textColor: '#1e293b',
  tableHeaderColor: '#1e293b',
  tableHeaderTextColor: '#ffffff',
};

// ── System Field Token ────────────────────────────────────────────────────────

export interface SystemFieldToken {
  key: string;
  label: string;
  group: string;
  bindingPath: string;
  fallback: string;
  allowOverride: boolean;
  format?: string;
  showOnExport: boolean;
}

// ── Block base ────────────────────────────────────────────────────────────────

export interface BlockBase {
  id: BlockId;
  type: BlockType;
  /** Optional background colour override for this block */
  backgroundColor?: string;
  /** Optional border colour */
  borderColor?: string;
  /** Padding preset */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Column span when inside a ColumnsBlock */
  colSpan?: number;
  /**
   * Conditional logic rules authored on this block.
   * Rules are stored on the owning block for easy lookup but their actions
   * can target any block in the document.
   */
  logic?: LogicRule[];
}

// ── Block Types ───────────────────────────────────────────────────────────────

export type BlockType =
  | 'heading'
  | 'text'
  | 'rich_text'
  | 'divider'
  | 'spacer'
  | 'page_break'
  | 'columns'
  | 'banner'
  | 'safety_badge_row'
  | 'table'
  | 'image'
  | 'field'
  | 'system_field';

// ── Heading Block ─────────────────────────────────────────────────────────────

export type HeadingLevel = 1 | 2 | 3 | 4;

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  content: string;
  level: HeadingLevel;
  align: 'left' | 'center' | 'right';
  color?: string;
}

// ── Text Block ────────────────────────────────────────────────────────────────

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string;
  align: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  fontSize?: 'xs' | 'sm' | 'base' | 'lg';
  bold?: boolean;
  italic?: boolean;
}

// ── Rich Text Block ───────────────────────────────────────────────────────────

export interface RichTextBlock extends BlockBase {
  type: 'rich_text';
  /** HTML content — sanitised on save */
  html: string;
  minHeight?: number;
}

// ── Divider Block ─────────────────────────────────────────────────────────────

export interface DividerBlock extends BlockBase {
  type: 'divider';
  style: 'solid' | 'dashed' | 'dotted';
  color?: string;
  thickness?: 1 | 2 | 4;
}

// ── Spacer Block ──────────────────────────────────────────────────────────────

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  height: number; // px
}

// ── Page Break Block ──────────────────────────────────────────────────────────

export interface PageBreakBlock extends BlockBase {
  type: 'page_break';
}

// ── Columns Block ─────────────────────────────────────────────────────────────

export interface ColumnDef {
  id: string;
  width: number; // flex fraction, e.g. 1 = equal
  blocks: DocumentBlock[];
}

export interface ColumnsBlock extends BlockBase {
  type: 'columns';
  columns: ColumnDef[];
  gap?: 'sm' | 'md' | 'lg';
}

// ── Banner Block ──────────────────────────────────────────────────────────────

export type BannerVariant =
  | 'info'
  | 'warning'
  | 'danger'
  | 'success'
  | 'safety'
  | 'safety_first'
  | 'first_aid'
  | 'image_banner'
  | 'no_entry'
  | 'emergency'
  | 'electrical'
  | 'confined_space'
  | 'environmental'
  | 'toolbox_talk'
  | 'custom';

// ── Risk Matrix Block ─────────────────────────────────────────────────────────

export type RiskRating = 'low' | 'medium' | 'high' | 'extreme';

export interface RiskMatrixBlock extends BlockBase {
  type: 'risk_matrix';
  title: string;
  showLegend: boolean;
  showOnExport: boolean;
}

export interface RiskMatrixBannerBlock extends BlockBase {
  type: 'risk_matrix_banner';
}
export type BannerSize = 'compact' | 'standard' | 'large';

export interface BannerBlock extends BlockBase {
  type: 'banner';
  variant: BannerVariant;
  title: string;
  body: string;
  icon?: string;
  size: BannerSize;
  align: 'left' | 'center';
  showOnExport: boolean;
  customBgColor?: string;
  customBorderColor?: string;
  customImageUrl?: string;
}

// ── Safety Badge Row ──────────────────────────────────────────────────────────

export type SafetyBadgeType =
  | 'ppe'
  | 'helmet'
  | 'footwear'
  | 'eye_protection'
  | 'gloves'
  | 'electrical_gloves'
  | 'hearing'
  | 'hi_vis'
  | 'fall_arrest'
  | 'custom';

export interface SafetyBadge {
  id: string;
  badgeType: SafetyBadgeType;
  label: string;
  required: boolean;
  customImageUrl?: string;
}

export interface SafetyBadgeRowBlock extends BlockBase {
  type: 'safety_badge_row';
  badges: SafetyBadge[];
  size: 'sm' | 'md' | 'lg';
  align: 'left' | 'center' | 'right';
}

// ── Table Block ───────────────────────────────────────────────────────────────

export type TableMode = 'static' | 'fillable';
export type CellType =
  | 'text'
  | 'long_text'
  | 'rich_text'
  | 'number'
  | 'date'
  | 'yes_no'
  | 'checkbox'
  | 'choice'
  | 'signature'
  | 'image'
  | 'system_field';

export interface TableColumn {
  id: string;
  header: string;
  cellType: CellType;
  width?: number; // flex fraction
  options?: string[]; // for choice type
  systemFieldKey?: string; // for system_field type
}

export interface TableRow {
  id: string;
  cells: Record<string, string>; // columnId → default/static value
}

export interface TableBlock extends BlockBase {
  type: 'table';
  mode: TableMode;
  columns: TableColumn[];
  rows: TableRow[];
  headerBgColor?: string;
  headerTextColor?: string;
  stripedRows?: boolean;
  repeatable?: boolean; // fillable mode: user can add rows
  showRowNumbers?: boolean;
}

// ── Image Block ───────────────────────────────────────────────────────────────

export type ImageSize = 'small' | 'medium' | 'large' | 'full';
export type ImageAlign = 'left' | 'center' | 'right';

export interface ImageBlock extends BlockBase {
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
  size: ImageSize;
  align: ImageAlign;
  preserveAspectRatio: boolean;
}

// ── Field Block (form field embedded in document) ─────────────────────────────

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'rich_text_response'
  | 'number'
  | 'date'
  | 'datetime'
  | 'yes_no'
  | 'checkbox'
  | 'single_choice'
  | 'multi_select'
  | 'rating'
  | 'linear_scale'
  | 'signature'
  | 'photo'
  | 'file_upload'
  | 'location';

export interface FieldBlock extends BlockBase {
  type: 'field';
  fieldType: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: string[]; // for choice/multi_select
  helpText?: string;
  /** Settings blob (same shape as existing FormField.settingsJson) */
  settings?: Record<string, unknown>;
}

// ── System Field Block (standalone resolved token) ────────────────────────────

export interface SystemFieldBlock extends BlockBase {
  type: 'system_field';
  fieldKey: string;
  label: string;
  fallback: string;
  showLabel: boolean;
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type DocumentBlock =
  | HeadingBlock
  | TextBlock
  | RichTextBlock
  | DividerBlock
  | SpacerBlock
  | PageBreakBlock
  | ColumnsBlock
  | BannerBlock
  | SafetyBadgeRowBlock
  | RiskMatrixBlock
  | RiskMatrixBannerBlock
  | TableBlock
  | ImageBlock
  | FieldBlock
  | SystemFieldBlock;

// ── Source Attachment ─────────────────────────────────────────────────────────

export interface SourceAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  storagePath: string;
}

// ── Document Kind ─────────────────────────────────────────────────────────────

/**
 * The two top-level kinds of studio documents.
 *
 * doc  — read-only reference document (SWMS, policy, procedure, toolbox talk, etc.)
 *         Can optionally require sign-on / acknowledgement.
 *         In Use Mode: read-only canvas, Print, Download.
 *         No fillable form fields are active.
 *
 * form — fillable user record (inspection, pre-start, induction, custom form, etc.)
 *         In Use Mode: fillable canvas, Submit, Download completed PDF.
 */
export type DocumentKind = 'doc' | 'form';

/**
 * Settings that control Use Mode behaviour.
 * Stored in document_templates alongside the builder JSON.
 */
export interface DocKindSettings {
  /** 'doc' or 'form' — defaults to 'doc' */
  docKind: DocumentKind;

  // ── Doc-specific ────────────────────────────────────────────────────────────
  /** If true, Use Mode shows an Acknowledge / Sign Onto button */
  requiresAcknowledgement: boolean;
  /** Button label shown in Use Mode, e.g. "Sign Onto SWMS" */
  acknowledgementLabel: string;
  /** Confirmation statement shown in the sign-on modal */
  acknowledgementText: string;

  // ── Form-specific ───────────────────────────────────────────────────────────
  /** Submit button label, e.g. "Submit Form" */
  submitLabel: string;
  /** If true, a signature field is required before submission */
  requiresSignature: boolean;
}

export const DEFAULT_DOC_KIND_SETTINGS: DocKindSettings = {
  docKind: 'doc',
  requiresAcknowledgement: false,
  acknowledgementLabel: 'Sign Onto / Acknowledge',
  acknowledgementText: 'By signing, I confirm I have read, understood, and agree to comply with this document.',
  submitLabel: 'Submit Form',
  requiresSignature: false,
};

/**
 * Template types that default to kind=doc with requiresAcknowledgement=true.
 * Used when creating new templates from the TYPE_MAP.
 */
export const DOC_KIND_ACKNOWLEDGEMENT_TYPES: StudioDocumentType[] = [
  'swms', 'safety_plan', 'policy', 'procedure', 'toolbox_talk',
];

/**
 * Template types that default to kind=form.
 */
export const DOC_KIND_FORM_TYPES: StudioDocumentType[] = [
  'user_form', 'pre_start', 'prestart', 'inspection', 'checklist', 'register',
];



export type StudioDocumentType =
  | 'user_form'
  | 'policy'
  | 'procedure'
  | 'swms'
  | 'safety_plan'
  | 'toolbox_talk'
  | 'prestart'
  | 'inspection'
  | 'register'
  | 'checklist'
  | 'completion_report'
  | 'handover'
  | 'quote_scope'
  | 'custom'
  // legacy aliases kept for backward compat
  | 'document'
  | 'pre_start';

export interface DocumentTemplate {
  id?: number;
  companyId?: number;
  name: string;
  templateType: StudioDocumentType;
  pageLayout: PageLayout;
  theme: DocumentTheme;
  blocks: DocumentBlock[];
  systemFields: string[]; // keys of system fields used
  sourceAttachments: SourceAttachment[];
  /**
   * Flat array of ALL logic rules in the document.
   * Rules are also stored on their owning block (block.logic[]) for
   * inspector access, but this top-level array is the authoritative
   * serialised form and is what the logic engine reads.
   */
  logicRules?: LogicRule[];
  pdfSettings?: TemplatePdfSettings;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  sourceDocxName?: string;
  // ── Doc/Form kind model ──────────────────────────────────────────────────────
  docKind?: DocumentKind;
  requiresAcknowledgement?: boolean;
  acknowledgementLabel?: string;
  acknowledgementText?: string;
  submitLabel?: string;
  requiresSignature?: boolean;
}

// ── PDF Output Settings (per-template overlay) ────────────────────────────────

/**
 * Per-template PDF output settings stored in document_templates.pdf_settings_json.
 * Each field is optional — null/undefined means "inherit from company Settings → PDF".
 */
export interface TemplatePdfSettings {
  // ── Cover page ──────────────────────────────────────────────────────────────
  coverPageEnabled: boolean;
  /** Override template name as cover title */
  coverTitle: string;
  coverSubtitle: string;
  /** 'auto' = today's date at render time */
  coverDate: 'auto' | 'none' | string;
  coverLogoPosition: 'top-left' | 'top-center' | 'top-right';
  /** Job fields to show on cover page */
  coverShowJobNumber: boolean;
  coverShowJobName: boolean;
  coverShowClientName: boolean;
  coverShowSiteAddress: boolean;

  // ── Header ──────────────────────────────────────────────────────────────────
  /** null = inherit company default */
  headerTextOverride: string | null;
  /** null = inherit company default */
  showLogoOverride: boolean | null;

  // ── Footer + Disclaimer ─────────────────────────────────────────────────────
  /** null = inherit company default */
  footerTextOverride: string | null;
  /** null = inherit company default */
  disclaimerOverride: string | null;
  /** null = inherit company default */
  showFooterOverride: boolean | null;

  // ── Display ─────────────────────────────────────────────────────────────────
  showPageNumbers: boolean;
}

export const DEFAULT_TEMPLATE_PDF_SETTINGS: TemplatePdfSettings = {
  coverPageEnabled: false,
  coverTitle: '',
  coverSubtitle: '',
  coverDate: 'auto',
  coverLogoPosition: 'top-left',
  coverShowJobNumber: true,
  coverShowJobName: true,
  coverShowClientName: true,
  coverShowSiteAddress: false,
  headerTextOverride: null,
  showLogoOverride: null,
  footerTextOverride: null,
  disclaimerOverride: null,
  showFooterOverride: null,
  showPageNumbers: true,
};

// ── Builder UI State ──────────────────────────────────────────────────────────

export interface BuilderSelection {
  blockId: BlockId | null;
  columnId?: string; // if inside a ColumnsBlock
}

export type BuilderMode = 'edit' | 'preview' | 'fill';

/** Which top-level tab is active in the builder */
export type BuilderTab = 'layout' | 'theme' | 'structure' | 'tables' | 'form_fields' | 'system_fields' | 'advanced' | 'file' | 'view';

/** Which tab is active in the BlockInspector right panel */
export type InspectorTab = 'settings' | 'logic';
