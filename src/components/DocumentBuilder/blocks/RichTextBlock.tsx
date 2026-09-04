import { useRef, useEffect, useCallback } from 'react';
import { useDocumentStore } from '../useDocumentStore';
import type { RichTextBlock } from '../types';
import { sanitiseHtml } from '../sanitiseHtml';

interface Props {
  block: RichTextBlock;
  columnsBlockId?: string;
  columnId?: string;
}

export default function RichTextBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();
  const ref = useRef<HTMLDivElement>(null);
  const lastSyncedHtml = useRef<string>(block.html);
  const initialised = useRef(false);

  const update = (patch: Partial<RichTextBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  // Ref callback: set innerHTML once at mount imperatively so React's reconciler
  // never owns the innerHTML of this contentEditable.
  const refCallback = useCallback((el: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && !initialised.current && mode === 'edit') {
      // eslint-disable-next-line no-unsanitized/property -- value is passed through sanitiseHtml
      el.innerHTML = sanitiseHtml(block.html);
      lastSyncedHtml.current = block.html;
      initialised.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — run once at mount

  // Sync external html changes (undo/redo, structural updates) only when not focused
  useEffect(() => {
    const el = ref.current;
    if (!el || mode !== 'edit') return;
    if (block.html !== lastSyncedHtml.current && document.activeElement !== el) {
      // eslint-disable-next-line no-unsanitized/property -- value is passed through sanitiseHtml
      el.innerHTML = sanitiseHtml(block.html);
      lastSyncedHtml.current = block.html;
    }
  }, [block.html, mode]);

  const safeHtml = sanitiseHtml(block.html);

  if (mode === 'edit') {
    return (
      <div
        ref={refCallback}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const sanitised = sanitiseHtml(e.currentTarget.innerHTML);
          lastSyncedHtml.current = sanitised;
          update({ html: sanitised });
        }}
        className="outline-none py-2 cursor-text leading-relaxed prose prose-sm max-w-none [&_table]:w-full [&_table]:table-fixed rounded transition-colors focus:bg-slate-50/60 hover:bg-slate-50/40"
        style={{ minHeight: block.minHeight ?? '4em' }}
        data-placeholder="Click to type…"
        // ⚠️  NO dangerouslySetInnerHTML — initial content set imperatively via refCallback
      />
    );
  }

  return (
    <div
      className="py-2 leading-relaxed prose prose-sm max-w-none [&_table]:w-full [&_table]:table-fixed"
      style={{ minHeight: block.minHeight ?? undefined }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
