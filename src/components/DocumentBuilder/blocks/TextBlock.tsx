import { useDocumentStore } from '../useDocumentStore';
import type { TextBlock } from '../types';
import { sanitiseHtml } from '../sanitiseHtml';

interface Props {
  block: TextBlock;
  columnsBlockId?: string;
  columnId?: string;
}

const FONT_SIZE_MAP: Record<string, string> = {
  xs: 'text-xs', sm: 'text-sm', base: 'text-base', lg: 'text-lg',
};

export default function TextBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();

  const update = (patch: Partial<TextBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  const alignClass = block.align === 'center' ? 'text-center'
    : block.align === 'right' ? 'text-right'
    : block.align === 'justify' ? 'text-justify'
    : 'text-left';
  const sizeClass = FONT_SIZE_MAP[block.fontSize ?? 'base'] ?? 'text-base';
  const style: React.CSSProperties = {
    color: block.color ?? 'inherit',
    fontWeight: block.bold ? 'bold' : undefined,
    fontStyle: block.italic ? 'italic' : undefined,
  };

  if (mode === 'edit') {
    return (
      <div
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => update({ content: e.currentTarget.textContent ?? '' })}
        className={`${sizeClass} ${alignClass} outline-none py-1 min-h-[1.5em] cursor-text leading-relaxed`}
        style={style}
        dangerouslySetInnerHTML={{ __html: sanitiseHtml(block.content) }}
      />
    );
  }

  return (
    <p className={`${sizeClass} ${alignClass} py-1 leading-relaxed`} style={style}>
      {block.content}
    </p>
  );
}
