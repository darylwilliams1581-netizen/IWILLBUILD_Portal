// ── Plan Manager shared types ─────────────────────────────────────────────────

export type AnnotationType =
  | 'line' | 'arrow' | 'rect' | 'circle' | 'freehand'
  | 'text' | 'highlight' | 'dimension' | 'stamp';

export type StampTemplate =
  | 'AS_CONSTRUCTED' | 'DATE' | 'NAME' | 'SIGN' | 'CHANGES_NOTE';

export interface AnnotationStyle {
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  fontWeight?: string;
  fillColor?: string;
  fillOpacity?: number;
  stampTemplate?: StampTemplate;
  stampFields?: Record<string, string>;
}

export interface Point { x: number; y: number; }

export interface AnnotationGeometry {
  // For line/arrow: start + end
  x1?: number; y1?: number; x2?: number; y2?: number;
  // For rect/highlight: x, y, width, height
  x?: number; y?: number; width?: number; height?: number;
  // For circle: cx, cy, rx, ry
  cx?: number; cy?: number; rx?: number; ry?: number;
  // For freehand: array of points
  points?: Point[];
  // For text/callout/stamp: anchor point
  tx?: number; ty?: number;
  // For dimension: same as line + label offset
  labelOffsetX?: number; labelOffsetY?: number;
}

export interface Annotation {
  id: string;           // client-side UUID (maps to DB id after save)
  dbId?: number;        // DB id after save
  type: AnnotationType;
  pageNo: number;
  geometry: AnnotationGeometry;
  style: AnnotationStyle;
  label?: string;
  authorId?: string;
  createdAt?: string;
  updatedAt?: string;
  isLocked?: boolean;
  isDirty?: boolean;    // unsaved local change
}

export interface Drawing {
  id: number;
  title: string;
  description?: string;
  drawing_number?: string;
  discipline?: string;
  doc_status_label?: string;
  source_file_path?: string;
  source_file_name?: string;
  page_count: number;
  current_revision_id?: number;
  status: 'active' | 'archived' | 'deleted';
  revision_no?: number;
  revision_name?: string;
  locked?: boolean;
  annotation_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DrawingRevision {
  id: number;
  revision_no: number;
  name: string;
  source_type: 'draft' | 'revision' | 'final';
  created_by?: string;
  created_at?: string;
  locked: boolean;
  locked_at?: string;
  is_current: boolean;
}

export type ToolType = AnnotationType | 'select' | 'pan';

export interface ViewerState {
  scale: number;
  rotation: number; // 0 | 90 | 180 | 270
  currentPage: number;
  totalPages: number;
  fitWidth: boolean;
}
