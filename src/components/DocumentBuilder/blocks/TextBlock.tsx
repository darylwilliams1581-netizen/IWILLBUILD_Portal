import { useRef, useEffect, useCallback } from 'react';
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
  const elRef = useRef<HTMLDivElement>(null);
  const lastSyncedContent = useRef<string>(block.content);
  const initialised = useRef(false);

  const update = (patch: Partial<TextBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  // Ref callback: set textContent once at mount imperatively.
  // TextBlock stores plain text (not HTML), so we use textContent, not innerHTML,
  // which also avoids any XSS surface entirely.
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
        ref={refCallback}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const text = e.currentTarget.textContent ?? '';
          lastSyncedContent.current = text;
          update({ content: text });
        }}
        className={`${sizeClass} ${alignClass} outline-none py-1 min-h-[1.5em] cursor-text leading-relaxed`}
        style={style}
        // ⚠️  NO dangerouslySetInnerHTML — initial content set imperatively via refCallback
      />
    );
  }

  return (
    <p className={`${sizeClass} ${alignClass} py-1 leading-relaxed`} style={style}>
      {block.content}
    </p>
  );
}
