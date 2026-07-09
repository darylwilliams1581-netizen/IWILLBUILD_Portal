/**
 * PageEditor — Page-first document editing surface
 * ─────────────────────────────────────────────────────────────────────────────
 * A contenteditable A4 canvas that lets users click and type directly.
 * Underneath, content is kept in sync with the DocumentBlock[] store.
 *
 * Features:
 *   - Click anywhere to type
 *   - Rich paste (Word, Google Docs, browser copy)
 *   - Inline formatting toolbar (bold, italic, underline, lists, align)
 *   - Special blocks (field, banner, etc.) rendered as non-editable chips
 *   - Tables editable inline
 *   - Syncs to block store on blur / explicit save
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Minus,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { blocksToHtml, htmlToBlocks, sanitisePastedHtml, isWordPaste } from './pageEditorBridge';
import type { PasteMode } from './pageEditorBridge';
import PasteModeModal from './PasteModeModal';
import { useDocumentStore } from './useDocumentStore';
import type { DocumentBlock } from './types';

interface Props {
  /** Called whenever the editor content changes (debounced) */
  onChange?: (blocks: DocumentBlock[]) => void;
}

// Margin map for A4 page
const MARGIN_MAP = {
  none: '0',
  narrow: '12.7mm',
  standard: '25.4mm',
  wide: '38.1mm',
};

export default function PageEditor({ onChange }: Props) {
  const { blocks, reorderBlocks, pageLayout, theme } = useDocumentStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Floating toolbar state
  const [toolbar, setToolbar] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0, left: 0, visible: false,
  });

  // Paste mode modal state
  const [pasteModal, setPasteModal] = useState<{
    visible: boolean;
    isWord: boolean;
    html: string;
    text: string;
  }>({ visible: false, isWord: false, html: '', text: '' });

  // ── Load blocks into editor ───────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current) return;
    // Only re-render from blocks if we're not in the middle of a user edit
    if (isInternalUpdate.current) return;
    const html = blocksToHtml(blocks);
    editorRef.current.innerHTML = html;
    applyEditorStyles();
  }, [blocks]);

  // ── Apply document styles to special elements ─────────────────────────────
  function applyEditorStyles() {
    if (!editorRef.current) return;
    const el = editorRef.current;

    // Style special block chips
    el.querySelectorAll<HTMLElement>('.special-block-chip').forEach((chip) => {
      chip.style.cssText = `
        display: block;
        margin: 8px 0;
        padding: 8px 12px;
        background: #f8fafc;
        border: 1.5px dashed #cbd5e1;
        border-radius: 6px;
        color: #64748b;
        font-size: 12px;
        font-family: ui-monospace, monospace;
        cursor: default;
        user-select: none;
      `;
    });

    // Style page break markers
    el.querySelectorAll<HTMLElement>('.page-break-marker').forEach((pb) => {
      pb.style.cssText = `
        display: block;
        text-align: center;
        color: #94a3b8;
        font-size: 11px;
        letter-spacing: 0.1em;
        border-top: 1px dashed #e2e8f0;
        border-bottom: 1px dashed #e2e8f0;
        padding: 4px 0;
        margin: 12px 0;
        cursor: default;
        user-select: none;
      `;
    });

    // Style tables
    el.querySelectorAll<HTMLElement>('table').forEach((tbl) => {
      tbl.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0;
        font-size: 13px;
      `;
      tbl.querySelectorAll<HTMLElement>('th').forEach((th) => {
        th.style.cssText = `
          background: ${theme.tableHeaderColor};
          color: ${theme.tableHeaderTextColor};
          padding: 6px 10px;
          border: 1px solid #334155;
          font-weight: 600;
          text-align: left;
        `;
      });
      tbl.querySelectorAll<HTMLElement>('td').forEach((td) => {
        td.style.cssText = `
          padding: 5px 10px;
          border: 1px solid #e2e8f0;
          vertical-align: top;
          min-height: 24px;
        `;
      });
    });
  }

  // ── Sync editor HTML → blocks (debounced) ─────────────────────────────────
  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (!editorRef.current) return;
      isInternalUpdate.current = true;
      const newBlocks = htmlToBlocks(editorRef.current.innerHTML);
      reorderBlocks(newBlocks);
      onChange?.(newBlocks);
      // Allow next external update after a short delay
      setTimeout(() => { isInternalUpdate.current = false; }, 100);
    }, 600);
  }, [reorderBlocks, onChange]);

  // ── Handle input ──────────────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    scheduleSync();
    applyEditorStyles();
  }, [scheduleSync]);

  // ── Handle paste ──────────────────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html && isWordPaste(html)) {
      // Show paste mode picker for Word content
      setPasteModal({ visible: true, isWord: true, html, text });
      return;
    }

    if (html) {
      // Non-Word rich paste — default to 'keep' silently
      const insertHtml = sanitisePastedHtml(html, 'keep');
      document.execCommand('insertHTML', false, insertHtml);
    } else {
      // Plain text — convert newlines to paragraphs
      const insertHtml = text
        .split(/\n\n+/)
        .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');
      document.execCommand('insertHTML', false, insertHtml);
    }

    scheduleSync();
    applyEditorStyles();
  }, [scheduleSync]);

  // ── Apply paste after mode selection ─────────────────────────────────────
  const applyPaste = useCallback((mode: PasteMode) => {
    setPasteModal((m) => ({ ...m, visible: false }));
    editorRef.current?.focus();

    let insertHtml: string;
    if (pasteModal.html) {
      insertHtml = sanitisePastedHtml(pasteModal.html, mode);
    } else {
      insertHtml = pasteModal.text
        .split(/\n\n+/)
        .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');
    }

    document.execCommand('insertHTML', false, insertHtml);
    scheduleSync();
    applyEditorStyles();
  }, [pasteModal, scheduleSync]);

  // ── Handle selection change → show/hide toolbar ───────────────────────────
  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorRef.current) {
      setToolbar((t) => ({ ...t, visible: false }));
      return;
    }
    // Check selection is inside our editor
    if (!editorRef.current.contains(sel.anchorNode)) {
      setToolbar((t) => ({ ...t, visible: false }));
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();
    setToolbar({
      visible: true,
      top: rect.top - editorRect.top - 44,
      left: Math.max(0, rect.left - editorRect.left + rect.width / 2 - 140),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  // ── Exec formatting commands ───────────────────────────────────────────────
  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    scheduleSync();
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ctrl/Cmd+B, I, U handled by browser execCommand natively
    // Tab → indent list item
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        document.execCommand('outdent', false);
      } else {
        document.execCommand('indent', false);
      }
    }
  }, []);

  // ── Compute page dimensions ───────────────────────────────────────────────
  const isLandscape = pageLayout?.orientation === 'landscape';
  const margin = MARGIN_MAP[pageLayout?.margins ?? 'standard'];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-200 flex flex-col items-center py-8 px-4">
      {/* A4 page surface */}
      <div
        className="relative bg-white shadow-xl"
        style={{
          width: isLandscape ? '297mm' : '210mm',
          minHeight: isLandscape ? '210mm' : '297mm',
          maxWidth: '100%',
        }}
      >
        {/* Floating formatting toolbar */}
        {toolbar.visible && (
          <div
            className="absolute z-20 flex items-center gap-0.5 bg-slate-800 rounded-lg px-1.5 py-1 shadow-xl pointer-events-auto"
            style={{ top: toolbar.top, left: toolbar.left }}
            onMouseDown={(e) => e.preventDefault()} // prevent blur
          >
            <ToolbarBtn title="Bold (⌘B)" onClick={() => exec('bold')}><Bold size={13} /></ToolbarBtn>
            <ToolbarBtn title="Italic (⌘I)" onClick={() => exec('italic')}><Italic size={13} /></ToolbarBtn>
            <ToolbarBtn title="Underline (⌘U)" onClick={() => exec('underline')}><Underline size={13} /></ToolbarBtn>
            <div className="w-px h-4 bg-slate-600 mx-0.5" />
            <ToolbarBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}><List size={13} /></ToolbarBtn>
            <ToolbarBtn title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered size={13} /></ToolbarBtn>
            <div className="w-px h-4 bg-slate-600 mx-0.5" />
            <ToolbarBtn title="Align left" onClick={() => exec('justifyLeft')}><AlignLeft size={13} /></ToolbarBtn>
            <ToolbarBtn title="Align center" onClick={() => exec('justifyCenter')}><AlignCenter size={13} /></ToolbarBtn>
            <ToolbarBtn title="Align right" onClick={() => exec('justifyRight')}><AlignRight size={13} /></ToolbarBtn>
            <div className="w-px h-4 bg-slate-600 mx-0.5" />
            <ToolbarBtn title="Heading 1" onClick={() => exec('formatBlock', 'h1')} label="H1" />
            <ToolbarBtn title="Heading 2" onClick={() => exec('formatBlock', 'h2')} label="H2" />
            <ToolbarBtn title="Heading 3" onClick={() => exec('formatBlock', 'h3')} label="H3" />
            <ToolbarBtn title="Paragraph" onClick={() => exec('formatBlock', 'p')} label="P" />
            <div className="w-px h-4 bg-slate-600 mx-0.5" />
            <ToolbarBtn title="Horizontal rule" onClick={() => exec('insertHorizontalRule')}><Minus size={13} /></ToolbarBtn>
          </div>
        )}

        {/* Editable content area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className="outline-none w-full"
          style={{
            padding: margin,
            minHeight: isLandscape ? '210mm' : '297mm',
            fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
            fontSize: '13px',
            lineHeight: '1.6',
            color: theme.textColor,
          }}
          data-placeholder="Click here to start typing your document…"
        />
      </div>

      {/* Page editor styles */}
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
        [contenteditable] h1 {
          font-size: 22px;
          font-weight: 700;
          margin: 16px 0 8px;
          color: ${theme.textColor};
          line-height: 1.3;
        }
        [contenteditable] h2 {
          font-size: 18px;
          font-weight: 700;
          margin: 14px 0 6px;
          color: ${theme.textColor};
          line-height: 1.3;
        }
        [contenteditable] h3 {
          font-size: 15px;
          font-weight: 600;
          margin: 12px 0 4px;
          color: ${theme.textColor};
        }
        [contenteditable] h4 {
          font-size: 13px;
          font-weight: 600;
          margin: 10px 0 4px;
          color: ${theme.textColor};
        }
        [contenteditable] p {
          margin: 0 0 6px;
        }
        [contenteditable] ul,
        [contenteditable] ol {
          margin: 4px 0 8px 20px;
          padding: 0;
        }
        [contenteditable] li {
          margin-bottom: 2px;
        }
        [contenteditable] strong { font-weight: 700; }
        [contenteditable] em { font-style: italic; }
        [contenteditable] u { text-decoration: underline; }
        [contenteditable] hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 12px 0;
        }
        [contenteditable] a { color: #2563eb; text-decoration: underline; }
        [contenteditable] blockquote {
          border-left: 3px solid #e2e8f0;
          margin: 8px 0;
          padding: 4px 12px;
          color: #64748b;
        }
        [contenteditable] code {
          background: #f1f5f9;
          border-radius: 3px;
          padding: 1px 4px;
          font-family: ui-monospace, monospace;
          font-size: 12px;
        }
      `}</style>

      {/* Paste mode modal */}
      <AnimatePresence>
        {pasteModal.visible && (
          <PasteModeModal
            isWord={pasteModal.isWord}
            onSelect={applyPaste}
            onCancel={() => setPasteModal((m) => ({ ...m, visible: false }))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolbarBtn({
  onClick,
  title,
  children,
  label,
}: {
  onClick: () => void;
  title: string;
  children?: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded text-slate-200 hover:bg-slate-600 hover:text-white transition-colors text-xs font-bold"
    >
      {children ?? label}
    </button>
  );
}
