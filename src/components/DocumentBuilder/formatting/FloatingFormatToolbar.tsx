/**
 * FloatingFormatToolbar
 * ─────────────────────────────────────────────────────────────────────────────
 * A small floating toolbar that appears near the user's text selection inside
 * any Studio contentEditable block (TextBlock, RichTextBlock, table cells).
 *
 * Behaviour:
 * - Appears on mouseup / touchend when text is selected inside a Studio block.
 * - Positioned above the selection, clamped to the viewport.
 * - Disappears on Escape, click-outside, or selection collapse.
 * - Does NOT steal focus — all buttons use onMouseDown + e.preventDefault().
 * - Saves/restores the selection around colour picker interactions.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link, Eraser,
  ChevronDown,
} from 'lucide-react';
import {
  execBold, execItalic, execUnderline, execStrikethrough,
  execFontSize, execTextColor, execHighlight,
  execAlign, execBulletList, execNumberedList,
  execHeading, execLink, execUnlink, execClearFormatting,
  saveSelection, restoreSelection, queryFormatState,
} from './formatCommands';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position { top: number; left: number; }

interface Props {
  /** The root element of the Studio canvas — toolbar only activates inside it */
  canvasRef: React.RefObject<HTMLElement | null>;
  /** Called after any formatting command so the block can flush its innerHTML */
  onFormatApplied?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const HEADING_OPTIONS: { label: string; tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' }[] = [
  { label: 'Paragraph', tag: 'p' },
  { label: 'Heading 1', tag: 'h1' },
  { label: 'Heading 2', tag: 'h2' },
  { label: 'Heading 3', tag: 'h3' },
  { label: 'Heading 4', tag: 'h4' },
];

// Formatting colours — these are document content colours, not UI palette colours.
// They are intentionally literal because they represent the actual text/highlight
// colours a user can apply to document content, not UI chrome.
const TEXT_COLORS = [
  '#000000', '#374151', '#6B7280', '#EF4444', '#F97316',
  '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899',
  '#FFFFFF',
];
const HIGHLIGHT_COLORS = [
  'transparent', '#FEF08A', '#BBF7D0', '#BAE6FD', '#FBCFE8',
  '#FED7AA', '#E9D5FF', '#FECACA', '#D1FAE5', '#DBEAFE',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInsideCanvas(node: Node | null, canvas: HTMLElement): boolean {
  let n: Node | null = node;
  while (n) {
    if (n === canvas) return true;
    n = n.parentNode;
  }
  return false;
}

function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  return sel.getRangeAt(0).getBoundingClientRect();
}

// ── Toolbar button ────────────────────────────────────────────────────────────

interface TBtnProps {
  active?: boolean;
  title: string;
  onMouseDown: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  danger?: boolean;
}

function TBtn({ active, title, onMouseDown, children, danger }: TBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={onMouseDown}
      className={`w-6 h-6 flex items-center justify-center rounded text-[11px] transition-colors flex-shrink-0
        ${active
          ? 'bg-primary text-primary-foreground'
          : danger
            ? 'text-destructive hover:bg-destructive/10'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
    >
      {children}
    </button>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-4 bg-border flex-shrink-0 mx-0.5" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FloatingFormatToolbar({ canvasRef, onFormatApplied }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Position>({ top: 0, left: 0 });
  const [fmt, setFmt] = useState(queryFormatState());
  const [showColorPicker, setShowColorPicker] = useState<'text' | 'highlight' | null>(null);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showHeading, setShowHeading] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // ── Position toolbar above selection ───────────────────────────────────────

  const positionToolbar = useCallback(() => {
    const rect = getSelectionRect();
    if (!rect || rect.width === 0) { setVisible(false); return; }

    const TOOLBAR_H = 36;
    const TOOLBAR_W = 500; // approximate max width
    const MARGIN = 8;

    let top = rect.top + window.scrollY - TOOLBAR_H - MARGIN;
    let left = rect.left + window.scrollX + rect.width / 2 - TOOLBAR_W / 2;

    // Clamp to viewport
    if (top < window.scrollY + MARGIN) top = rect.bottom + window.scrollY + MARGIN;
    if (left < MARGIN) left = MARGIN;
    if (left + TOOLBAR_W > window.innerWidth - MARGIN) left = window.innerWidth - TOOLBAR_W - MARGIN;

    setPos({ top, left });
    setFmt(queryFormatState());
    setVisible(true);
  }, []);

  // ── Listen for selection changes ────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseUp = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setVisible(false); return; }
        if (!isInsideCanvas(sel.anchorNode, canvas)) { setVisible(false); return; }
        positionToolbar();
      }, 10);
    };

    const handleKeyUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { setVisible(false); return; }
      if (!isInsideCanvas(sel.anchorNode, canvas!)) { setVisible(false); return; }
      positionToolbar();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setVisible(false);
      setShowColorPicker(null);
      setShowFontSize(false);
      setShowHeading(false);
      setLinkMode(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(false);
        setShowColorPicker(null);
        setShowFontSize(false);
        setShowHeading(false);
        setLinkMode(false);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [canvasRef, positionToolbar]);

  // ── Touch support ───────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleTouchEnd = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        if (!isInsideCanvas(sel.anchorNode, canvas!)) return;
        positionToolbar();
      }, 200);
    };
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => canvas.removeEventListener('touchend', handleTouchEnd);
  }, [canvasRef, positionToolbar]);

  // ── Focus link input when link mode opens ───────────────────────────────────

  useEffect(() => {
    if (linkMode) {
      setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }, [linkMode]);

  // ── Command helpers ─────────────────────────────────────────────────────────

  const cmd = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    restoreSelection();
    fn();
    setFmt(queryFormatState());
    onFormatApplied?.();
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    restoreSelection();
    execLink(linkUrl.trim());
    setLinkMode(false);
    setLinkUrl('');
    onFormatApplied?.();
  };

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      data-testid="floating-format-toolbar"
      className="fixed z-[9999] flex items-center gap-0.5 px-1.5 py-1 bg-card border border-border rounded-lg shadow-lg select-none"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Heading / paragraph style ── */}
      <div className="relative">
        <button
          type="button"
          title="Paragraph style"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowHeading((v) => !v);
            setShowFontSize(false);
            setShowColorPicker(null);
            setLinkMode(false);
          }}
          className="flex items-center gap-0.5 h-6 px-1.5 rounded text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Style <ChevronDown size={9} />
        </button>
        {showHeading && (
          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
            {HEADING_OPTIONS.map(({ label, tag }) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  restoreSelection();
                  execHeading(tag);
                  setShowHeading(false);
                  onFormatApplied?.();
                }}
                className="w-full text-left px-3 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* ── Font size ── */}
      <div className="relative">
        <button
          type="button"
          title="Font size"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowFontSize((v) => !v);
            setShowHeading(false);
            setShowColorPicker(null);
            setLinkMode(false);
          }}
          className="flex items-center gap-0.5 h-6 px-1.5 rounded text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Size <ChevronDown size={9} />
        </button>
        {showFontSize && (
          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 py-1 max-h-48 overflow-y-auto min-w-[70px]">
            {FONT_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  execFontSize(sz);
                  setShowFontSize(false);
                  onFormatApplied?.();
                }}
                className="w-full text-left px-3 py-0.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {sz}pt
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* ── Bold / Italic / Underline / Strikethrough ── */}
      <TBtn active={fmt.bold}          title="Bold (Ctrl+B)"      onMouseDown={cmd(execBold)}>          <Bold size={12} /></TBtn>
      <TBtn active={fmt.italic}        title="Italic (Ctrl+I)"    onMouseDown={cmd(execItalic)}>        <Italic size={12} /></TBtn>
      <TBtn active={fmt.underline}     title="Underline (Ctrl+U)" onMouseDown={cmd(execUnderline)}>     <Underline size={12} /></TBtn>
      <TBtn active={fmt.strikethrough} title="Strikethrough"      onMouseDown={cmd(execStrikethrough)}> <Strikethrough size={12} /></TBtn>

      <Divider />

      {/* ── Text colour ── */}
      <div className="relative">
        <button
          type="button"
          title="Text colour"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowColorPicker((v) => v === 'text' ? null : 'text');
            setShowFontSize(false);
            setShowHeading(false);
            setLinkMode(false);
          }}
          className="flex items-center gap-0.5 h-6 px-1 rounded text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <span className="font-bold text-[11px] text-foreground">A</span>
          <ChevronDown size={9} />
        </button>
        {showColorPicker === 'text' && (
          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 p-2">
            <p className="text-[9px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">Text colour</p>
            <div className="grid grid-cols-6 gap-1">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    execTextColor(c);
                    setShowColorPicker(null);
                    onFormatApplied?.();
                  }}
                  className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Highlight ── */}
      <div className="relative">
        <button
          type="button"
          title="Highlight colour"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowColorPicker((v) => v === 'highlight' ? null : 'highlight');
            setShowFontSize(false);
            setShowHeading(false);
            setLinkMode(false);
          }}
          className="flex items-center gap-0.5 h-6 px-1 rounded text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <span className="text-[11px] font-bold bg-yellow-200 px-0.5 rounded-sm">H</span>
          <ChevronDown size={9} />
        </button>
        {showColorPicker === 'highlight' && (
          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 p-2">
            <p className="text-[9px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">Highlight</p>
            <div className="grid grid-cols-5 gap-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c === 'transparent' ? 'None' : c}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    execHighlight(c === 'transparent' ? 'transparent' : c);
                    setShowColorPicker(null);
                    onFormatApplied?.();
                  }}
                  className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform flex items-center justify-center"
                  style={{ backgroundColor: c === 'transparent' ? undefined : c }}
                >
                  {c === 'transparent' && <span className="text-[8px] text-muted-foreground">✕</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Divider />

      {/* ── Alignment ── */}
      <TBtn active={fmt.justifyLeft}   title="Align left"    onMouseDown={cmd(() => execAlign('left'))}>    <AlignLeft size={12} /></TBtn>
      <TBtn active={fmt.justifyCenter} title="Align centre"  onMouseDown={cmd(() => execAlign('center'))}>  <AlignCenter size={12} /></TBtn>
      <TBtn active={fmt.justifyRight}  title="Align right"   onMouseDown={cmd(() => execAlign('right'))}>   <AlignRight size={12} /></TBtn>
      <TBtn active={fmt.justifyFull}   title="Justify"       onMouseDown={cmd(() => execAlign('justify'))}> <AlignJustify size={12} /></TBtn>

      <Divider />

      {/* ── Lists ── */}
      <TBtn title="Bullet list"   onMouseDown={cmd(execBulletList)}>   <List size={12} /></TBtn>
      <TBtn title="Numbered list" onMouseDown={cmd(execNumberedList)}> <ListOrdered size={12} /></TBtn>

      <Divider />

      {/* ── Link ── */}
      {linkMode ? (
        <form onSubmit={handleLinkSubmit} className="flex items-center gap-1">
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="h-6 px-2 text-[10px] border border-border rounded outline-none focus:border-primary w-40 bg-background text-foreground"
            onKeyDown={(e) => { if (e.key === 'Escape') { setLinkMode(false); setLinkUrl(''); } }}
          />
          <button type="submit" className="h-6 px-2 bg-primary text-primary-foreground text-[10px] rounded hover:bg-primary/90 transition-colors">Apply</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setLinkMode(false); setLinkUrl(''); }} className="h-6 px-1 text-muted-foreground hover:text-foreground text-[10px]">✕</button>
        </form>
      ) : (
        <>
          <TBtn title="Add link" onMouseDown={(e) => { e.preventDefault(); saveSelection(); setLinkMode(true); setShowColorPicker(null); setShowFontSize(false); setShowHeading(false); }}>
            <Link size={12} />
          </TBtn>
          <TBtn title="Remove link" onMouseDown={cmd(execUnlink)}>
            <Link size={12} className="opacity-40 line-through" />
          </TBtn>
        </>
      )}

      <Divider />

      {/* ── Clear formatting ── */}
      <TBtn title="Clear formatting" onMouseDown={cmd(execClearFormatting)} danger>
        <Eraser size={12} />
      </TBtn>
    </div>
  );
}
