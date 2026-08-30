/**
 * dazza-builder/types.ts
 * Server-side types for the Dazza Builder Assistant.
 */

export type BuilderType = 'document' | 'form';

export interface BuilderOwnerContext {
  userId: string;
  email: string;
  isPlatformOwner: boolean;
}

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

export interface BuilderApplyRequest {
  /** Null when creating a brand-new template from the list page. */
  templateId: number | null;
  builderType: BuilderType;
  operations: BuilderOperation[];
  instructionSummary: string;
  conversationId: string;
}

export interface BuilderApplyResult {
  ok: boolean;
  versionId: string;
  versionNumber: number;
  operationsApplied: number;
  validationErrors: string[];
  error?: string;
  /** Set when a new template was created during apply. Client should navigate to it. */
  newTemplateId?: number;
  newTemplateName?: string;
}

export interface ProposedChange {
  summary: string;
  affectedSections: string[];
  affectedItems: string[];
  validationImpact: string;
  operations: BuilderOperation[];
  conversationId: string;
  /**
   * The template ID this proposal targets, stamped server-side at proposal
   * time from the authenticated builderContext — never from AI output.
   * null means a new template will be created (createNewTemplate must be
   * the first op).  The client validates this matches builderContext before
   * sending Apply.
   */
  targetTemplateId: number | null;
  /** Builder type stamped server-side — must match builderContext on Apply. */
  targetBuilderType: BuilderType;
}

export interface BuilderStreamOptions {
  ownerContext: BuilderOwnerContext;
  conversationId: string | null;
  userMessage: string;
  builderContext: BuilderContext;
  attachmentIds?: string[];
  onToken: (token: string) => void;
  onToolCall: (name: string, status: 'running' | 'done') => void;
  onStatus: (phase: string, label: string) => void;
  onProposedChange: (change: ProposedChange) => void;
  onDone: (meta: {
    model: string;
    toolsUsed: string[];
    conversationId: string;
    inputTokens?: number;
    outputTokens?: number;
  }) => void;
  onError: (message: string, conversationId?: string) => void;
}
