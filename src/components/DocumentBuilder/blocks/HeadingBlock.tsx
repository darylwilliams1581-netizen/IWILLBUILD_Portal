import { useRef } from 'react';
import { useDocumentStore } from '../useDocumentStore';
import type { HeadingBlock } from '../types';
import { sanitiseHtml } from '../sanitiseHtml';

interface Props {
  block: HeadingBlock;
  columnsBlockId?: string;
  columnId?: string;
}

const SIZE_MAP: Record<number, string> = {
  1: 'text-3xl font-bold',
  2: 'text-2xl font-bold',
  3: 'text-xl font-semibold',
  4: 'text-base font-semibold',
};

export default function HeadingBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();
  const ref = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<HeadingBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4';
  const sizeClass = SIZE_MAP[block.level] ?? SIZE_MAP[2];
  const alignClass = block.align === 'center' ? 'text-center' : block.align === 'right' ? 'text-right' : 'text-left';

  if (mode === 'edit') {
    return (
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => update({ content: e.currentTarget.textContent ?? '' })}
        className={`${sizeClass} ${alignClass} outline-none py-1 min-h-[1.5em] cursor-text`}
        style={{ color: block.color ?? 'inherit' }}
        dangerouslySetInnerHTML={{ __html: sanitiseHtml(block.content) }}
      />
    );
  }

  return (
    <Tag className={`${sizeClass} ${alignClass} py-1`} style={{ color: block.color ?? 'inherit' }}>
      {block.content}
    </Tag>
  );
}
