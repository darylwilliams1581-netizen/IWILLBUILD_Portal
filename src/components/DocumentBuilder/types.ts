/**
 * Smart Document Builder — Core Type Definitions
 * ─────────────────────────────────────────────────────────────────────────────
 * All block types, field types, system field types, page layout, and theme
 * definitions live here. The builder JSON stored in document_templates.builder_json
 * is a serialised DocumentTemplate.
 */

// ── IDs ───────────────────────────────────────────────────────────────────────

export type BlockId = string;

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

export type BannerVariant = 'info' | 'warning' | 'danger' | 'success' | 'safety' | 'custom';
export type BannerSize = 'compact' | 'standard' | 'large';

export interface BannerBlock extends BlockBase {
  type: 'banner';
  variant: BannerVariant;
  title: string;
  body: string;
  icon?: string; // lucide icon name
  size: BannerSize;
  align: 'left' | 'center';
  showOnExport: boolean;
  customBgColor?: string;
  customBorderColor?: string;
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

// ── Document Template (the full saved JSON) ───────────────────────────────────

export interface DocumentTemplate {
  id?: number;
  companyId?: number;
  name: string;
  templateType: 'document' | 'swms' | 'policy' | 'toolbox_talk' | 'pre_start' | 'inspection' | 'register' | 'completion_report';
  pageLayout: PageLayout;
  theme: DocumentTheme;
  blocks: DocumentBlock[];
  systemFields: string[]; // keys of system fields used
  sourceAttachments: SourceAttachment[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── Builder UI State ──────────────────────────────────────────────────────────

export interface BuilderSelection {
  blockId: BlockId | null;
  columnId?: string; // if inside a ColumnsBlock
}

export type BuilderMode = 'edit' | 'preview' | 'fill';
