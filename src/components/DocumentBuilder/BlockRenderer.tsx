/**
 * Studio Builder — Block Renderer
 * ─────────────────────────────────────────────────────────────────────────────
 * Dispatches to the correct block component based on block.type.
 * Accepts optional logicState, fillValues, and onFillChange for fill mode.
 */

import type { DocumentBlock, BlockLogicState, PdfPageBlock } from './types';
import { useDocumentStore } from './useDocumentStore';
import { DEFAULT_BLOCK_STATE } from './useLogicEngine';
import HeadingBlockView from './blocks/HeadingBlock';
import TextBlockView from './blocks/TextBlock';
import RichTextBlockView from './blocks/RichTextBlock';
import DividerBlockView from './blocks/DividerBlock';
import SpacerBlockView from './blocks/SpacerBlock';
import PageBreakBlockView from './blocks/PageBreakBlock';
import ColumnsBlockView from './blocks/ColumnsBlock';
import BannerBlockView from './blocks/BannerBlock';
import SafetyBadgeRowView from './blocks/SafetyBadgeRow';
import RiskMatrixBlockView from './blocks/RiskMatrixBlock';
import RiskMatrixBannerView from './blocks/RiskMatrixBanner';
import TableBlockView from './blocks/TableBlock';
import ImageBlockView from './blocks/ImageBlock';
import FieldBlockView from './blocks/FieldBlock';
import SystemFieldBlockView from './blocks/SystemFieldBlock';
import { FileText } from 'lucide-react';

// ── PDF Page Block view ───────────────────────────────────────────────────────
// Renders a placeholder representing one imported PDF page.
// No OCR / editable text — shows page metadata and a download link.

function PdfPageBlockView({ block }: { block: PdfPageBlock }) {
  return (
    <div
      className="studio-no-print-bg border border-slate-200 rounded-sm bg-slate-50 flex flex-col items-center justify-center gap-2 py-6 px-4 text-center"
      style={{ minHeight: 120 }}
      data-testid="pdf-page-block"
    >
      <FileText size={28} className="text-slate-300" />
      <div>
        <p className="text-xs font-semibold text-slate-600">
          {block.sourceFileName} — Page {block.pageNumber} of {block.totalPages}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          PDF page · move, duplicate or delete with the block controls
        </p>
      </div>
      {block.downloadUrl && (
        <a
          href={block.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary underline hover:text-violet-700 transition-colors"
        >
          Download original PDF
        </a>
      )}
    </div>
  );
}

export type FillValues = Record<string, string | string[] | boolean | undefined>;

interface Props {
  block: DocumentBlock;
  /** When rendering inside a ColumnsBlock, pass the parent IDs for nested updates */
  columnsBlockId?: string;
  columnId?: string;
  /** Logic engine state for this block (fill/preview mode) */
  logicState?: BlockLogicState;
  /** Current fill-mode field values (passed down for context) */
  fillValues?: FillValues;
  /** Callback when a field value changes in fill mode */
  onFillChange?: (blockId: string, value: string | string[] | boolean | undefined) => void;
}

export function BlockRenderer({
  block,
  columnsBlockId,
  columnId,
  logicState = DEFAULT_BLOCK_STATE,
  fillValues = {},
  onFillChange,
}: Props) {
  const { mode } = useDocumentStore();

  const blockStyle: React.CSSProperties = {
    backgroundColor: block.backgroundColor ?? undefined,
    borderColor: block.borderColor ?? undefined,
    borderWidth: block.borderColor ? 1 : undefined,
    borderStyle: block.borderColor ? 'solid' : undefined,
    padding: block.padding === 'none' ? 0
      : block.padding === 'sm' ? '8px'
      : block.padding === 'lg' ? '24px'
      : block.padding === 'md' ? '16px'
      : undefined,
    // Disabled overlay in fill mode
    opacity: logicState.disabled ? 0.45 : undefined,
    pointerEvents: logicState.disabled ? 'none' : undefined,
  };

  // In fill mode, merge forced value into field block
  const effectiveBlock = (mode === 'fill' && block.type === 'field' && logicState.forcedValue !== undefined)
    ? { ...block, defaultValue: logicState.forcedValue }
    : block;

  // In fill mode, merge required override
  const effectiveRequired = (mode === 'fill' && block.type === 'field' && logicState.required !== undefined)
    ? logicState.required
    : (block.type === 'field' ? block.required : undefined);

  const content = (() => {
    switch (effectiveBlock.type) {
      case 'heading':        return <HeadingBlockView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'text':           return <TextBlockView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'rich_text':      return <RichTextBlockView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'divider':        return <DividerBlockView block={effectiveBlock} />;
      case 'spacer':         return <SpacerBlockView block={effectiveBlock} />;
      case 'page_break':     return <PageBreakBlockView />;
      case 'columns':        return <ColumnsBlockView block={effectiveBlock} />;
      case 'banner':         return <BannerBlockView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'safety_badge_row': return <SafetyBadgeRowView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'risk_matrix':        return <RiskMatrixBlockView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'risk_matrix_banner': return <RiskMatrixBannerView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'table':          return <TableBlockView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'image':          return <ImageBlockView block={effectiveBlock} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'field':          return (
        <FieldBlockView
          block={effectiveBlock}
          requiredOverride={effectiveRequired}
          value={fillValues[effectiveBlock.id]}
          onChange={onFillChange ? (v) => onFillChange(effectiveBlock.id, v) : undefined}
        />
      );
      case 'system_field':   return <SystemFieldBlockView block={effectiveBlock} />;
      case 'pdf_page':       return <PdfPageBlockView block={effectiveBlock} />;
      default:               return <div className="text-xs text-slate-400 p-2">Unknown block type</div>;
    }
  })();

  if (!block.backgroundColor && !block.borderColor && !block.padding && !logicState.disabled) {
    return <>{content}</>;
  }

  return (
    <div style={blockStyle} className="rounded-sm">
      {content}
    </div>
  );
}
