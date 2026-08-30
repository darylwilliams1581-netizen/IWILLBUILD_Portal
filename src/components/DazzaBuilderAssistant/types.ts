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
