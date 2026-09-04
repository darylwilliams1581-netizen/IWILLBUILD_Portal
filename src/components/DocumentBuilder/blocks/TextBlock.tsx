/**
 * TextBlock — Studio plain/rich text block.
 *
 * In edit mode the block is a contentEditable div. The FloatingFormatToolbar
 * (rendered by BlockCanvas) activates automatically when the user selects text
 * inside any Studio contentEditable. No extra wiring is needed here beyond
 * ensuring the block flushes its innerHTML on blur.
 *
 * Storage: TextBlock.content stores sanitised HTML (not plain text) so that
 * inline formatting applied via the toolbar is persisted. The view mode renders
 * it via dangerouslySetInnerHTML after passing through sanitiseHtml.
 */

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

  // Ref callback: set innerHTML once at mount imperatively.
  // We now store HTML (not plain text) so we use innerHTML via sanitiseHtml.
  const refCallback = useCallback((el: HTMLDivElement | null) => {
    (elRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && !initialised.current && mode === 'edit') {
      // eslint-disable-next-line no-unsanitized/property -- value is passed through sanitiseHtml
      el.innerHTML = sanitiseHtml(block.content);
      lastSyncedContent.current = block.content;
      initialised.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — run once at mount

  // Sync external content changes (undo/redo, inspector) only when not focused
  useEffect(() => {
    const el = elRef.current;
    if (!el || mode !== 'edit') return;
    if (block.content !== lastSyncedContent.current && document.activeElement !== el) {
      // eslint-disable-next-line no-unsanitized/property -- value is passed through sanitiseHtml
      el.innerHTML = sanitiseHtml(block.content);
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
        data-studio-editable="true"
        onBlur={(e) => {
          const sanitised = sanitiseHtml(e.currentTarget.innerHTML);
          lastSyncedContent.current = sanitised;
          update({ content: sanitised });
        }}
        className={`${sizeClass} ${alignClass} outline-none py-1 min-h-[1.5em] cursor-text leading-relaxed`}
        style={style}
        // ⚠️  NO dangerouslySetInnerHTML — initial content set imperatively via refCallback
      />
    );
  }

  const safeHtml = sanitiseHtml(block.content);
  return (
    <p
      className={`${sizeClass} ${alignClass} py-1 leading-relaxed`}
      style={style}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
