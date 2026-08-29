/**
 * TableCellContextMenu
 * ─────────────────────────────────────────────────────────────────────────────
 * Right-click (or long-press on touch) context menu for Studio table cells.
 *
 * Provides:
 * - Cell fill colour
 * - Text colour
 * - Bold / Italic / Underline
 * - Text alignment (H + V)
 * - Border colour and thickness
 * - Clear cell formatting
 * - Insert row above / below
 * - Insert column left / right
 * - Delete row / column
 * - Merge / split cells (basic colspan support)
 *
 * Usage: render once inside TableBlockView and pass the open/close callbacks.
 */

import { useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  Eraser, Rows3, Columns3, Trash2, TableProperties, SplitSquareHorizontal,
} from 'lucide-react';
import type { CellStyle } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CellAddress {
  rowId: string;
  colId: string;
}

export interface TableCellContextMenuProps {
  x: number;
  y: number;
  cellAddress: CellAddress;
  /** All currently selected cells (for multi-cell operations) */
  selectedCells: CellAddress[];
  currentStyle: CellStyle;
  onStyleChange: (cells: CellAddress[], patch: Partial<CellStyle>) => void;
  onInsertRowAbove: (rowId: string) => void;
  onInsertRowBelow: (rowId: string) => void;
  onInsertColLeft: (colId: string) => void;
  onInsertColRight: (colId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onDeleteCol: (colId: string) => void;
  onMergeCells?: (cells: CellAddress[]) => void;
  onSplitCell?: (cell: CellAddress) => void;
  onClose: () => void;
}

// ── Colour swatches — document content colours, not UI palette ────────────────
const FILL_COLORS = [
  'transparent',
  '#FFFFFF', '#F8FAFC', '#F1F5F9', '#E2E8F0',
  '#FEF9C3', '#FEF08A', '#FDE047',
  '#DCFCE7', '#BBF7D0', '#86EFAC',
  '#DBEAFE', '#BAE6FD', '#7DD3FC',
  '#F3E8FF', '#E9D5FF', '#C4B5FD',
  '#FFE4E6', '#FECACA', '#FCA5A5',
  '#1E293B', '#0F172A',
];
const TEXT_COLORS = [
  '#000000', '#1E293B', '#374151', '#6B7280',
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF',
];
const BORDER_COLORS = [
  'transparent', '#E2E8F0', '#CBD5E1', '#94A3B8',
  '#64748B', '#334155', '#1E293B', '#000000',
  '#EF4444', '#3B82F6', '#22C55E',
];
const BORDER_WIDTHS = [0, 1, 2, 3, 4];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
      {children}
    </div>
  );
}

function MenuDivider() {
  return <div className="h-px bg-border mx-2 my-0.5" />;
}

function MenuItem({
  icon, label, onClick, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left
        ${danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
    >
      <span className="w-3.5 flex-shrink-0">{icon}</span>
      {label}
    </button>
  );
}

function ColorSwatch({
  color, active, onClick, title,
}: {
  color: string;
  active?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`w-4 h-4 rounded border transition-transform hover:scale-110 flex items-center justify-center
        ${active ? 'ring-1 ring-primary ring-offset-1' : 'border-border'}`}
      style={{ backgroundColor: color === 'transparent' ? undefined : color }}
    >
      {color === 'transparent' && <span className="text-[7px] text-muted-foreground">✕</span>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TableCellContextMenu({
  x, y,
  cellAddress,
  selectedCells,
  currentStyle,
  onStyleChange,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColLeft,
  onInsertColRight,
  onDeleteRow,
  onDeleteCol,
  onMergeCells,
  onSplitCell,
  onClose,
}: TableCellContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp to viewport after mount
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw - 8) el.style.left = `${vw - rect.width - 8}px`;
    if (rect.bottom > vh - 8) el.style.top = `${vh - rect.height - 8}px`;
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const targets = selectedCells.length > 0 ? selectedCells : [cellAddress];

  const applyStyle = (patch: Partial<CellStyle>) => {
    onStyleChange(targets, patch);
    onClose();
  };

  const isMerged = (currentStyle.colspan ?? 1) > 1 || (currentStyle.rowspan ?? 1) > 1;

  return (
    <div
      ref={menuRef}
      data-testid="table-cell-context-menu"
      className="fixed z-[9999] bg-card border border-border rounded-lg shadow-xl py-1 w-56 select-none"
      style={{ top: y, left: x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Cell fill ── */}
      <Section title="Cell fill">
        <div className="flex flex-wrap gap-1">
          {FILL_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={currentStyle.backgroundColor === c}
              title={c === 'transparent' ? 'No fill' : c}
              onClick={() => applyStyle({ backgroundColor: c === 'transparent' ? undefined : c })}
            />
          ))}
        </div>
      </Section>

      <MenuDivider />

      {/* ── Text colour ── */}
      <Section title="Text colour">
        <div className="flex flex-wrap gap-1">
          {TEXT_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={currentStyle.color === c}
              title={c}
              onClick={() => applyStyle({ color: c })}
            />
          ))}
        </div>
      </Section>

      <MenuDivider />

      {/* ── Text style ── */}
      <Section title="Text style">
        <div className="flex gap-1">
          {([
            { icon: <Bold size={11} />,      label: 'Bold',      key: 'fontWeight' as const, on: 'bold',   off: undefined },
            { icon: <Italic size={11} />,    label: 'Italic',    key: 'fontStyle'  as const, on: 'italic', off: undefined },
            { icon: <Underline size={11} />, label: 'Underline', key: 'textDecoration' as const, on: 'underline', off: undefined },
          ] as const).map(({ icon, label, key, on, off }) => (
            <button
              key={label}
              type="button"
              title={label}
              onMouseDown={(e) => {
                e.preventDefault();
                const isActive = currentStyle[key] === on;
                applyStyle({ [key]: isActive ? off : on } as Partial<CellStyle>);
              }}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors
                ${currentStyle[key] === on
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </Section>

      <MenuDivider />

      {/* ── Text alignment ── */}
      <Section title="Alignment">
        <div className="flex gap-1 mb-1">
          {([
            { icon: <AlignLeft size={11} />,   label: 'Left',   val: 'left'   },
            { icon: <AlignCenter size={11} />, label: 'Centre', val: 'center' },
            { icon: <AlignRight size={11} />,  label: 'Right',  val: 'right'  },
          ] as const).map(({ icon, label, val }) => (
            <button
              key={val}
              type="button"
              title={`Align ${label}`}
              onMouseDown={(e) => { e.preventDefault(); applyStyle({ textAlign: val }); }}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors
                ${currentStyle.textAlign === val
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
            >
              {icon}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {([
            { icon: <AlignStartVertical size={11} />,  label: 'Top',    val: 'top'    },
            { icon: <AlignCenterVertical size={11} />, label: 'Middle', val: 'middle' },
            { icon: <AlignEndVertical size={11} />,    label: 'Bottom', val: 'bottom' },
          ] as const).map(({ icon, label, val }) => (
            <button
              key={val}
              type="button"
              title={`Vertical ${label}`}
              onMouseDown={(e) => { e.preventDefault(); applyStyle({ verticalAlign: val }); }}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors
                ${currentStyle.verticalAlign === val
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </Section>

      <MenuDivider />

      {/* ── Border ── */}
      <Section title="Border">
        <div className="flex flex-wrap gap-1 mb-1">
          {BORDER_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={currentStyle.borderColor === c}
              title={c === 'transparent' ? 'No border' : c}
              onClick={() => applyStyle({ borderColor: c === 'transparent' ? undefined : c })}
            />
          ))}
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-[9px] text-muted-foreground">Width:</span>
          {BORDER_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              title={`${w}px`}
              onMouseDown={(e) => { e.preventDefault(); applyStyle({ borderWidth: w === 0 ? undefined : w }); }}
              className={`w-6 h-6 flex items-center justify-center rounded text-[9px] transition-colors
                ${currentStyle.borderWidth === w || (w === 0 && !currentStyle.borderWidth)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
            >
              {w === 0 ? '—' : w}
            </button>
          ))}
        </div>
      </Section>

      <MenuDivider />

      {/* ── Clear cell formatting ── */}
      <MenuItem
        icon={<Eraser size={11} />}
        label="Clear cell formatting"
        onClick={() => applyStyle({
          backgroundColor: undefined,
          color: undefined,
          fontWeight: undefined,
          fontStyle: undefined,
          textDecoration: undefined,
          textAlign: undefined,
          verticalAlign: undefined,
          borderColor: undefined,
          borderWidth: undefined,
        })}
      />

      <MenuDivider />

      {/* ── Row / column operations ── */}
      <MenuItem icon={<Rows3 size={11} />}    label="Insert row above"    onClick={() => { onInsertRowAbove(cellAddress.rowId); onClose(); }} />
      <MenuItem icon={<Rows3 size={11} />}    label="Insert row below"    onClick={() => { onInsertRowBelow(cellAddress.rowId); onClose(); }} />
      <MenuItem icon={<Columns3 size={11} />} label="Insert column left"  onClick={() => { onInsertColLeft(cellAddress.colId); onClose(); }} />
      <MenuItem icon={<Columns3 size={11} />} label="Insert column right" onClick={() => { onInsertColRight(cellAddress.colId); onClose(); }} />

      <MenuDivider />

      <MenuItem icon={<Trash2 size={11} />} label="Delete row"    onClick={() => { onDeleteRow(cellAddress.rowId); onClose(); }} danger />
      <MenuItem icon={<Trash2 size={11} />} label="Delete column" onClick={() => { onDeleteCol(cellAddress.colId); onClose(); }} danger />

      {(onMergeCells || onSplitCell) && <MenuDivider />}

      {onMergeCells && targets.length > 1 && (
        <MenuItem icon={<TableProperties size={11} />}       label="Merge selected cells" onClick={() => { onMergeCells(targets); onClose(); }} />
      )}
      {onSplitCell && isMerged && (
        <MenuItem icon={<SplitSquareHorizontal size={11} />} label="Split cell"           onClick={() => { onSplitCell(cellAddress); onClose(); }} />
      )}
    </div>
  );
}
