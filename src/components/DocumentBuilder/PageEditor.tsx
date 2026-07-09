/**
 * PageEditor — Professional Page-First Document Editor
 * ─────────────────────────────────────────────────────────────────────────────
 * A contenteditable A4 canvas that feels like editing a real DOCX.
 *
 * Architecture:
 *   - Single contenteditable div that grows freely (no height cap)
 *   - Discrete A4 page sheets rendered as visual overlays with overflow:hidden
 *   - Page-break ruler lines at each A4 boundary
 *   - Continuation sheets mirror the editor content via translateY
 *   - Floating formatting toolbar on text selection
 *   - Word paste modal (Keep / Studio Style / Plain Text)
 *   - System field token insertion
 *   - Syncs to DocumentBlock[] store on 600ms debounce
 *
 * Visual quality target: MLCH SWMS series / PP-010 Procedure document
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Minus,
  ChevronDown,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { blocksToHtml, htmlToBlocks, sanitisePastedHtml, isWordPaste } from './pageEditorBridge';
import type { PasteMode } from './pageEditorBridge';
import PasteModeModal from './PasteModeModal';
import { useDocumentStore } from './useDocumentStore';
import { buildDocumentCss, DEFAULT_THEME_VARS } from './documentStyles';
import type { DocumentBlock } from './types';

interface Props {
  onChange?: (blocks: DocumentBlock[]) => void;
}

// A4 at 96 dpi
const A4_H = 1122;   // 297mm
const A4_W = 794;    // 210mm
const A4_H_LAND = 794;
const A4_W_LAND = 1122;

const MARGIN_PX: Record<string, number> = {
  none:     0,
  narrow:   48,   // 12.7mm
  standard: 96,   // 25.4mm
  wide:     144,  // 38.1mm
};

const MARGIN_CSS: Record<string, string> = {
  none:     '0',
  narrow:   '12.7mm',
  standard: '25.4mm',
  wide:     '38.1mm',
};

// Heading format options shown in the toolbar dropdown
const HEADING_OPTIONS = [
  { label: 'Paragraph',  cmd: 'formatBlock', val: 'p' },
  { label: 'Heading 1',  cmd: 'formatBlock', val: 'h1' },
  { label: 'Heading 2',  cmd: 'formatBlock', val: 'h2' },
  { label: 'Heading 3',  cmd: 'formatBlock', val: 'h3' },
  { label: 'Heading 4',  cmd: 'formatBlock', val: 'h4' },
];

export default function PageEditor({ onChange }: Props) {
  const { blocks, reorderBlocks, pageLayout, theme } = useDocumentStore();
  const editorRef    = useRef<HTMLDivElement>(null);
  const isInternal   = useRef(false);
  const syncTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pageCount, setPageCount]   = useState(1);
  const [editorHtml, setEditorHtml] = useState('');
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);

  const [toolbar, setToolbar] = useState<{
    top: number; left: number; visible: boolean;
  }>({ top: 0, left: 0, visible: false });

  const [pasteModal, setPasteModal] = useState<{
    visible: boolean; html: string; text: string;
  }>({ visible: false, html: '', text: '' });

  const isLandscape = pageLayout?.orientation === 'landscape';
  const marginKey   = pageLayout?.margins ?? 'standard';
  const marginCss   = MARGIN_CSS[marginKey];
  const marginPx    = MARGIN_PX[marginKey];
  const pageH       = isLandscape ? A4_H_LAND : A4_H;
  const pageW       = isLandscape ? A4_W_LAND : A4_W;

  // Build theme vars from store theme
  const themeVars = {
    ...DEFAULT_THEME_VARS,
    textColor:            theme.textColor            ?? DEFAULT_THEME_VARS.textColor,
    tableHeaderColor:     theme.tableHeaderColor     ?? DEFAULT_THEME_VARS.tableHeaderColor,
    tableHeaderTextColor: theme.tableHeaderTextColor ?? DEFAULT_THEME_VARS.tableHeaderTextColor,
  };

  const docCss = buildDocumentCss(themeVars, marginCss);

  // ── Load blocks → HTML ────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current || isInternal.current) return;
    const html = blocksToHtml(blocks);
    editorRef.current.innerHTML = html;
    applyEditorStyles();
    schedulePageCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // ── Apply runtime styles to special elements ──────────────────────────────
  function applyEditorStyles() {
    const el = editorRef.current;
    if (!el) return;

    // Special block chips
    el.querySelectorAll<HTMLElement>('.special-block-chip').forEach((chip) => {
      chip.setAttribute('contenteditable', 'false');
    });

    // Page break markers
    el.querySelectorAll<HTMLElement>('.page-break-marker').forEach((pb) => {
      pb.setAttribute('contenteditable', 'false');
    });

    // Block external images → placeholder chip
    el.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith('http') || src.startsWith('file://') || src.startsWith('data:image/wmf')) {
        const alt = img.getAttribute('alt') || 'image';
        const chip = document.createElement('span');
        chip.className = 'special-block-chip';
        chip.setAttribute('contenteditable', 'false');
        chip.textContent = `[image: ${alt}]`;
        img.replaceWith(chip);
      }
    });
  }

  // ── Page count ────────────────────────────────────────────────────────────
  const schedulePageCheck = useCallback(() => {
    if (pageTimer.current) clearTimeout(pageTimer.current);
    pageTimer.current = setTimeout(() => {
      if (!editorRef.current) return;
      const contentH = editorRef.current.scrollHeight;
      const needed   = Math.max(1, Math.ceil(contentH / pageH));
      setPageCount(needed);
      setEditorHtml(editorRef.current.innerHTML);
    }, 120);
  }, [pageH]);

  // ── Sync to blocks ────────────────────────────────────────────────────────
  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (!editorRef.current) return;
      isInternal.current = true;
      const newBlocks = htmlToBlocks(editorRef.current.innerHTML);
      reorderBlocks(newBlocks);
      onChange?.(newBlocks);
      setTimeout(() => { isInternal.current = false; }, 100);
    }, 600);
  }, [reorderBlocks, onChange]);

  const handleInput = useCallback(() => {
    scheduleSync();
    applyEditorStyles();
    schedulePageCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSync, schedulePageCheck]);

  // ── Paste ─────────────────────────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html && isWordPaste(html)) {
      setPasteModal({ visible: true, html, text });
      return;
    }
    if (html) {
      document.execCommand('insertHTML', false, sanitisePastedHtml(html, 'keep'));
    } else {
      const p = text.split(/\n\n+/).map((s) => `<p>${s.replace(/\n/g, '<br>')}</p>`).join('');
      document.execCommand('insertHTML', false, p);
    }
    scheduleSync();
    applyEditorStyles();
    schedulePageCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSync, schedulePageCheck]);

  const applyPaste = useCallback((mode: PasteMode) => {
    setPasteModal((m) => ({ ...m, visible: false }));
    editorRef.current?.focus();
    const html = pasteModal.html
      ? sanitisePastedHtml(pasteModal.html, mode)
      : pasteModal.text.split(/\n\n+/).map((s) => `<p>${s.replace(/\n/g, '<br>')}</p>`).join('');
    document.execCommand('insertHTML', false, html);
    scheduleSync();
    applyEditorStyles();
    schedulePageCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteModal, scheduleSync, schedulePageCheck]);

  // ── Selection → toolbar ───────────────────────────────────────────────────
  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorRef.current?.contains(sel.anchorNode)) {
      setToolbar((t) => ({ ...t, visible: false }));
      return;
    }
    const range  = sel.getRangeAt(0);
    const rect   = range.getBoundingClientRect();
    const edRect = editorRef.current.getBoundingClientRect();
    setToolbar({
      visible: true,
      top:  rect.top  - edRect.top  - 46,
      left: Math.max(0, Math.min(
        rect.left - edRect.left + rect.width / 2 - 160,
        edRect.width - 330,
      )),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  // ── Exec ──────────────────────────────────────────────────────────────────
  const exec = useCallback((cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    scheduleSync();
  }, [scheduleSync]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent', false);
    }
    // Close heading menu on Escape
    if (e.key === 'Escape') setShowHeadingMenu(false);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-400 flex flex-col items-center py-10 px-6 gap-6">

      {/* ── Global document CSS ── */}
      <style>{docCss}</style>
      <style>{`
        @page {
          size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
          margin: ${marginCss};
        }
        .page-sheet { box-shadow: 0 2px 20px rgba(0,0,0,0.18); }
        @media print {
          .page-sheet { box-shadow: none !important; }
          .doc-page-ruler { display: none !important; }
        }
      `}</style>

      {Array.from({ length: pageCount }, (_, idx) => {
        const isFirst = idx === 0;
        return (
          <div
            key={idx}
            className="page-sheet relative bg-white flex-shrink-0"
            style={{ width: pageW, height: pageH, maxWidth: '100%', overflow: 'hidden' }}
          >
            {isFirst ? (
              <>
                {/* ── Floating formatting toolbar ── */}
                {toolbar.visible && (
                  <div
                    className="absolute z-30 flex items-center gap-0.5 bg-slate-800 rounded-lg px-1.5 py-1 shadow-2xl pointer-events-auto"
                    style={{ top: toolbar.top, left: toolbar.left }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {/* Heading picker */}
                    <div className="relative">
                      <button
                        title="Paragraph style"
                        onMouseDown={(e) => { e.preventDefault(); setShowHeadingMenu((v) => !v); }}
                        className="flex items-center gap-0.5 h-7 px-2 rounded text-slate-200 hover:bg-slate-600 hover:text-white transition-colors text-xs font-bold"
                      >
                        Style <ChevronDown size={10} />
                      </button>
                      {showHeadingMenu && (
                        <div className="absolute top-8 left-0 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 min-w-[130px]">
                          {HEADING_OPTIONS.map((opt) => (
                            <button
                              key={opt.val}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                exec(opt.cmd, opt.val);
                                setShowHeadingMenu(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="w-px h-4 bg-slate-600 mx-0.5" />
                    <TBtn title="Bold (⌘B)"      onClick={() => exec('bold')}><Bold size={12} /></TBtn>
                    <TBtn title="Italic (⌘I)"    onClick={() => exec('italic')}><Italic size={12} /></TBtn>
                    <TBtn title="Underline (⌘U)" onClick={() => exec('underline')}><Underline size={12} /></TBtn>
                    <div className="w-px h-4 bg-slate-600 mx-0.5" />
                    <TBtn title="Bullet list"    onClick={() => exec('insertUnorderedList')}><List size={12} /></TBtn>
                    <TBtn title="Numbered list"  onClick={() => exec('insertOrderedList')}><ListOrdered size={12} /></TBtn>
                    <div className="w-px h-4 bg-slate-600 mx-0.5" />
                    <TBtn title="Align left"     onClick={() => exec('justifyLeft')}><AlignLeft size={12} /></TBtn>
                    <TBtn title="Align center"   onClick={() => exec('justifyCenter')}><AlignCenter size={12} /></TBtn>
                    <TBtn title="Align right"    onClick={() => exec('justifyRight')}><AlignRight size={12} /></TBtn>
                    <div className="w-px h-4 bg-slate-600 mx-0.5" />
                    <TBtn title="Divider"        onClick={() => exec('insertHorizontalRule')}><Minus size={12} /></TBtn>
                  </div>
                )}

                {/* ── Editable content ── */}
                <div
                  ref={editorRef}
                  data-doc-editor
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck
                  onInput={handleInput}
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  onClick={() => setShowHeadingMenu(false)}
                  className="absolute inset-0 outline-none"
                  style={{
                    padding: marginCss,
                    minHeight: pageH,
                    fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
                    fontSize: '10.5pt',
                    lineHeight: '1.45',
                    color: themeVars.textColor,
                    // Allow content to overflow downward — parent clips it
                    overflow: 'visible',
                    zIndex: 1,
                  }}
                  data-placeholder="Click here to start typing your document…"
                />
              </>
            ) : (
              /* ── Continuation sheet — mirrors editor content offset by N pages ── */
              <div
                className="absolute inset-0 pointer-events-none select-none"
                style={{
                  padding: marginCss,
                  fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
                  fontSize: '10.5pt',
                  lineHeight: '1.45',
                  color: themeVars.textColor,
                  overflow: 'hidden',
                }}
              >
                <div
                  data-doc-editor
                  style={{
                    transform: `translateY(-${idx * pageH - marginPx}px)`,
                    // Extend height so all pages' content is available to clip
                    minHeight: pageCount * pageH,
                  }}
                  dangerouslySetInnerHTML={{ __html: editorHtml }}
                />
              </div>
            )}

            {/* ── Page number ── */}
            <div
              className="absolute bottom-3 right-4 text-[8pt] text-slate-300 font-mono select-none pointer-events-none"
              style={{ zIndex: 5 }}
            >
              {idx + 1} / {pageCount}
            </div>
          </div>
        );
      })}

      {/* ── Paste mode modal ── */}
      <AnimatePresence>
        {pasteModal.visible && (
          <PasteModeModal
            isWord
            onSelect={applyPaste}
            onCancel={() => setPasteModal((m) => ({ ...m, visible: false }))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TBtn({
  onClick, title, children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded text-slate-200 hover:bg-slate-600 hover:text-white transition-colors"
    >
      {children}
    </button>
  );
}
