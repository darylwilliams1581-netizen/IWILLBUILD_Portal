import { useRef, useEffect, useCallback } from 'react';
import { useDocumentStore } from '../useDocumentStore';
import type { HeadingBlock } from '../types';

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
  const elRef = useRef<HTMLDivElement>(null);
  const lastSyncedContent = useRef<string>(block.content);
  const initialised = useRef(false);

  const update = (patch: Partial<HeadingBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  // Ref callback: set textContent once at mount imperatively.
  // HeadingBlock stores plain text — use textContent (no HTML, no XSS surface).
  const refCallback = useCallback((el: HTMLDivElement | null) => {
    (elRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && !initialised.current && mode === 'edit') {
      el.textContent = block.content;
      lastSyncedContent.current = block.content;
      initialised.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — run once at mount

  // Sync external content changes (undo/redo, inspector) only when not focused
  useEffect(() => {
    const el = elRef.current;
    if (!el || mode !== 'edit') return;
    if (block.content !== lastSyncedContent.current && document.activeElement !== el) {
      el.textContent = block.content;
      lastSyncedContent.current = block.content;
    }
  }, [block.content, mode]);

  const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4';
  const sizeClass = SIZE_MAP[block.level] ?? SIZE_MAP[2];
  const alignClass = block.align === 'center' ? 'text-center' : block.align === 'right' ? 'text-right' : 'text-left';

  if (mode === 'edit') {
    return (
      <div
        ref={refCallback}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const text = e.currentTarget.textContent ?? '';
          lastSyncedContent.current = text;
          update({ content: text });
        }}
        className={`${sizeClass} ${alignClass} outline-none py-1 min-h-[1.5em] cursor-text`}
        style={{ color: block.color ?? 'inherit' }}
        // ⚠️  NO dangerouslySetInnerHTML — initial content set imperatively via refCallback
      />
    );
  }

  return (
    <Tag className={`${sizeClass} ${alignClass} py-1`} style={{ color: block.color ?? 'inherit' }}>
      {block.content}
    </Tag>
  );
}
