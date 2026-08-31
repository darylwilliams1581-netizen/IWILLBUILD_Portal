/**
 * DazzaBuilderAssistant — shared types
 */

export type BuilderType = 'document' | 'form';

export interface BuilderContext {
  builderType: BuilderType;
  templateId: number | null;
  templateName: string;
  templateType: string;
  currentVersion: number;
  schemaSummary: string;
  selectedId: string | null;
  hasUnsavedChanges: boolean;
  validationErrors: string[];
  isPreviewMode: boolean;
  /**
   * The canonical template ID from the URL route param (e.g. /studio/builder/71 → 71).
   * Always a number when a real template is open; null on the list page or /new.
   * Used as the authoritative templateId for apply when the Zustand store hasn't
   * populated yet (storeTemplateId is still null on first render).
   */
  canonicalTemplateId: number | null;
}

export interface BuilderOperation {
  op: string;
  [key: string]: unknown;
}

export interface ProposedChange {
  summary: string;
  affectedSections: string[];
  affectedItems: string[];
  validationImpact: string;
  operations: BuilderOperation[];
  conversationId: string;
  /**
   * Stamped server-side from the authenticated builderContext at proposal time.
   * null = new template (createNewTemplate must be first op).
   * The client validates this matches the current builderContext before Apply.
   */
  targetTemplateId: number | null;
  /** Stamped server-side — must match builderContext.builderType on Apply. */
  targetBuilderType: BuilderType;
}

export type AssistantPhase =
  | 'idle'
  | 'reading'
  | 'planning'
  | 'applying'
  | 'validating'
  | 'complete'
  | 'failed';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  proposedChange?: ProposedChange;
  appliedVersionId?: string;
  attachmentIds?: string[];
  attachmentNames?: string[];
}

export interface AssistantVersion {
  id: string;
  versionNumber: number;
  instructionSummary: string;
  operationsCount: number;
  validationResult: string;
  createdAt: string;
}

/** Layout variant driven by viewport */
export type PanelLayout = 'sidebar' | 'slide-over' | 'bottom-sheet';
