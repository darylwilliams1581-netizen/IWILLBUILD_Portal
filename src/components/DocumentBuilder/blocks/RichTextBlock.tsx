import { useRef, useEffect } from 'react';
import { useDocumentStore } from '../useDocumentStore';
import type { RichTextBlock } from '../types';

interface Props {
  block: RichTextBlock;
  columnsBlockId?: string;
  columnId?: string;
}

export default function RichTextBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();
  const ref = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<RichTextBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  // Sync external html changes into the contenteditable without losing cursor
  useEffect(() => {
    if (ref.current && mode === 'edit') {
      if (ref.current.innerHTML !== block.html) {
        ref.current.innerHTML = block.html;
      }
    }
  }, [block.html, mode]);

  if (mode === 'edit') {
    return (
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => update({ html: e.currentTarget.innerHTML })}
        className="outline-none py-2 min-h-[3em] cursor-text leading-relaxed prose prose-sm max-w-none"
        style={{ minHeight: block.minHeight ?? undefined }}
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    );
  }

  return (
    <div
      className="py-2 leading-relaxed prose prose-sm max-w-none"
      style={{ minHeight: block.minHeight ?? undefined }}
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
}
