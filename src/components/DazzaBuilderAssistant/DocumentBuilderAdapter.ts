/**
 * DocumentBuilderAdapter
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts BuilderContext from the DocumentBuilder's Zustand store state.
 * Called by studio-builder.tsx to pass context to DazzaBuilderAssistant.
 *
 * Does NOT mutate the store — mutations go through the apply API.
 */
import type { BuilderContext } from './types';
import type { DocumentTemplate } from '@/components/DocumentBuilder/types';

interface DocumentStoreSnapshot {
  templateId: number | null;
  templateName: string;
  templateType: string;
  blocks: Array<{ id: string; type: string; [key: string]: unknown }>;
  logicRules: unknown[];
  isDirty: boolean;
  mode: string;
  pageLayout: unknown;
  docKind: string;
  requiresAcknowledgement: boolean;
}

/**
 * Build a size-bounded schema summary for the AI context.
 * Includes block types and IDs but not full content (which can be huge).
 */
function buildSchemaSummary(snapshot: DocumentStoreSnapshot): string {
  const { blocks, logicRules, templateType, docKind } = snapshot;

  const blockSummary = blocks.slice(0, 50).map((b, i) => {
    const label = (b.content as string | undefined)?.slice(0, 60)
      ?? (b.html as string | undefined)?.replace(/<[^>]+>/g, '').slice(0, 60)
      ?? (b.label as string | undefined)?.slice(0, 60)
      ?? '';
    return `  ${i + 1}. [${b.type}] id=${b.id}${label ? ` "${label}"` : ''}`;
  }).join('\n');

  const truncated = blocks.length > 50 ? `\n  …and ${blocks.length - 50} more blocks` : '';

  return [
    `Template type: ${templateType}, doc kind: ${docKind}`,
    `Total blocks: ${blocks.length}`,
    `Logic rules: ${logicRules.length}`,
    `Acknowledgement required: ${snapshot.requiresAcknowledgement}`,
    '',
    'Blocks:',
    blockSummary + truncated,
  ].join('\n');
}

export function buildDocumentBuilderContext(
  snapshot: DocumentStoreSnapshot,
  selectedBlockId: string | null,
  validationErrors: string[],
  currentVersion: number,
  canonicalTemplateId: number | null = null,
): BuilderContext {
  return {
    builderType: 'document',
    templateId: snapshot.templateId,
    templateName: snapshot.templateName,
    templateType: snapshot.templateType,
    currentVersion,
    schemaSummary: buildSchemaSummary(snapshot),
    selectedId: selectedBlockId,
    hasUnsavedChanges: snapshot.isDirty,
    validationErrors,
    isPreviewMode: snapshot.mode === 'use',
    // Canonical ID from the URL route — authoritative when store templateId is null
    canonicalTemplateId: canonicalTemplateId ?? snapshot.templateId,
  };
}

/**
 * Build context from a loaded DocumentTemplate (before store is populated).
 * Used when the builder first loads.
 */
export function buildDocumentBuilderContextFromTemplate(
  template: DocumentTemplate | null,
  currentVersion: number,
  canonicalTemplateId: number | null = null,
): BuilderContext {
  if (!template) {
    return {
      builderType: 'document',
      templateId: null,
      templateName: '',
      templateType: '',
      currentVersion: 0,
      schemaSummary: 'No template loaded.',
      selectedId: null,
      hasUnsavedChanges: false,
      validationErrors: [],
      isPreviewMode: false,
      canonicalTemplateId: null,
    };
  }

  const blocks = (template.blocks ?? []) as Array<{ id: string; type: string; [key: string]: unknown }>;
  const blockSummary = blocks.slice(0, 50).map((b, i) => {
    const label = (b.content as string | undefined)?.slice(0, 60) ?? '';
    return `  ${i + 1}. [${b.type}] id=${b.id}${label ? ` "${label}"` : ''}`;
  }).join('\n');

  return {
    builderType: 'document',
    templateId: template.id ?? null,
    templateName: template.name ?? '',
    templateType: template.templateType ?? '',
    currentVersion,
    schemaSummary: [
      `Template type: ${template.templateType}, doc kind: ${template.docKind ?? 'doc'}`,
      `Total blocks: ${blocks.length}`,
      '',
      'Blocks:',
      blockSummary || '  (empty)',
    ].join('\n'),
    selectedId: null,
    hasUnsavedChanges: false,
    validationErrors: [],
    isPreviewMode: false,
    canonicalTemplateId: canonicalTemplateId ?? template.id ?? null,
  };
}
