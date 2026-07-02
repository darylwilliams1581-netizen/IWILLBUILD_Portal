/**
 * Smart Document Builder — Block Renderer
 * ─────────────────────────────────────────────────────────────────────────────
 * Dispatches to the correct block component based on block.type.
 * Used by both the canvas (edit mode) and the preview/fill view.
 */

import type { DocumentBlock } from './types';
import { useDocumentStore } from './useDocumentStore';
import HeadingBlockView from './blocks/HeadingBlock';
import TextBlockView from './blocks/TextBlock';
import RichTextBlockView from './blocks/RichTextBlock';
import DividerBlockView from './blocks/DividerBlock';
import SpacerBlockView from './blocks/SpacerBlock';
import PageBreakBlockView from './blocks/PageBreakBlock';
import ColumnsBlockView from './blocks/ColumnsBlock';
import BannerBlockView from './blocks/BannerBlock';
import SafetyBadgeRowView from './blocks/SafetyBadgeRow';
import TableBlockView from './blocks/TableBlock';
import ImageBlockView from './blocks/ImageBlock';
import FieldBlockView from './blocks/FieldBlock';
import SystemFieldBlockView from './blocks/SystemFieldBlock';

interface Props {
  block: DocumentBlock;
  /** When rendering inside a ColumnsBlock, pass the parent IDs for nested updates */
  columnsBlockId?: string;
  columnId?: string;
}

export function BlockRenderer({ block, columnsBlockId, columnId }: Props) {
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
  };

  const content = (() => {
    switch (block.type) {
      case 'heading':        return <HeadingBlockView block={block} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'text':           return <TextBlockView block={block} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'rich_text':      return <RichTextBlockView block={block} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'divider':        return <DividerBlockView block={block} />;
      case 'spacer':         return <SpacerBlockView block={block} />;
      case 'page_break':     return <PageBreakBlockView />;
      case 'columns':        return <ColumnsBlockView block={block} />;
      case 'banner':         return <BannerBlockView block={block} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'safety_badge_row': return <SafetyBadgeRowView block={block} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'table':          return <TableBlockView block={block} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'image':          return <ImageBlockView block={block} columnsBlockId={columnsBlockId} columnId={columnId} />;
      case 'field':          return <FieldBlockView block={block} />;
      case 'system_field':   return <SystemFieldBlockView block={block} />;
      default:               return <div className="text-xs text-slate-400 p-2">Unknown block type</div>;
    }
  })();

  if (!block.backgroundColor && !block.borderColor && !block.padding) {
    return <>{content}</>;
  }

  return (
    <div style={blockStyle} className="rounded-sm">
      {content}
    </div>
  );
}
