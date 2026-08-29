/**
 * TableBlock — Studio table block with contextual cell formatting.
 *
 * New in this version:
 * - Right-click (or long-press on touch) opens TableCellContextMenu.
 * - Cell styles are stored in block.cellStyles (optional, backward-compatible).
 * - Multi-cell selection via Shift+click or touch drag.
 * - Row/column insert and delete via context menu.
 * - Cell fill, text colour, bold/italic/underline, alignment, border controls.
 * - Merge/split cells (basic colspan support).
 *
 * Existing documents without cellStyles continue to work unchanged.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDocumentStore, newId } from '../useDocumentStore';
import type { TableBlock, TableColumn, TableRow, CellStyle } from '../types';
import { sanitiseHtml } from '../sanitiseHtml';
import TableCellContextMenu from '../formatting/TableCellContextMenu';
import type { CellAddress } from '../formatting/TableCellContextMenu';

interface Props {
  block: TableBlock;
  columnsBlockId?: string;
  columnId?: string;
}

// ── Cell style → inline CSS ───────────────────────────────────────────────────

function cellStyleToCSS(cs: CellStyle | undefined): React.CSSProperties {
  if (!cs) return {};
  const style: React.CSSProperties = {};
  if (cs.backgroundColor) style.backgroundColor = cs.backgroundColor;
  if (cs.color)            style.color = cs.color;
  if (cs.fontWeight)       style.fontWeight = cs.fontWeight;
  if (cs.fontStyle)        style.fontStyle = cs.fontStyle;
  if (cs.textDecoration)   style.textDecoration = cs.textDecoration;
  if (cs.textAlign)        style.textAlign = cs.textAlign;
  if (cs.verticalAlign)    style.verticalAlign = cs.verticalAlign;
  if (cs.borderColor && cs.borderWidth) {
    style.border = `${cs.borderWidth}px solid ${cs.borderColor}`;
  } else if (cs.borderColor) {
    style.borderColor = cs.borderColor;
  }
  return style;
}

// ── Uncontrolled contentEditable cell ─────────────────────────────────────────

interface EditableCellFullProps {
  initialValue: string;
  value: string;
  onCommit: (html: string) => void;
  className?: string;
  style?: React.CSSProperties;
  'data-cell-id'?: string;
}

function EditableCellFull({ initialValue, value, onCommit, className, style, 'data-cell-id': dataCellId }: EditableCellFullProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const lastSyncedValue = useRef<string>(initialValue);
  const initialised = useRef(false);

  const refCallback = useCallback((el: HTMLDivElement | null) => {
    (elRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && !initialised.current) {
      // eslint-disable-next-line no-unsanitized/property -- sanitised
      el.innerHTML = sanitiseHtml(initialValue);
      initialised.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — run once

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (value !== lastSyncedValue.current && document.activeElement !== el) {
      // eslint-disable-next-line no-unsanitized/property -- sanitised
      el.innerHTML = sanitiseHtml(value);
      lastSyncedValue.current = value;
    }
  }, [value]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const sanitised = sanitiseHtml(e.currentTarget.innerHTML);
    lastSyncedValue.current = sanitised;
    onCommit(sanitised);
  }, [onCommit]);

  return (
    <div
      ref={refCallback}
      contentEditable
      suppressContentEditableWarning
      data-studio-editable="true"
      onBlur={handleBlur}
      className={className}
      style={style}
      data-cell-id={dataCellId}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TableBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();

  // ── Context menu state ─────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    cell: CellAddress;
  } | null>(null);
  const [selectedCells, setSelectedCells] = useState<CellAddress[]>([]);
  const lastTouchRef = useRef<{ rowId: string; colId: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((patch: Partial<TableBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  }, [columnsBlockId, columnId, block.id, updateBlock, updateBlockInColumn]);

  const headerBg   = block.headerBgColor   ?? '#1e293b';
  const headerText = block.headerTextColor ?? '#ffffff';

  // ── Cell style helpers ─────────────────────────────────────────────────────

  const getCellStyle = useCallback((rowId: string, colId: string): CellStyle => {
    return block.cellStyles?.[`${rowId}:${colId}`] ?? {};
  }, [block.cellStyles]);

  const applyCellStyles = useCallback((cells: CellAddress[], patch: Partial<CellStyle>) => {
    const existing = { ...(block.cellStyles ?? {}) };
    for (const { rowId, colId } of cells) {
      const key = `${rowId}:${colId}`;
      existing[key] = { ...(existing[key] ?? {}), ...patch };
      // Remove undefined keys to keep storage clean
      for (const k of Object.keys(existing[key]) as (keyof CellStyle)[]) {
        if (existing[key][k] === undefined) delete existing[key][k];
      }
      if (Object.keys(existing[key]).length === 0) delete existing[key];
    }
    update({ cellStyles: Object.keys(existing).length > 0 ? existing : undefined });
  }, [block.cellStyles, update]);

  // ── Column operations ──────────────────────────────────────────────────────

  const addColumn = () => {
    const newColId = newId();
    const newCol: TableColumn = { id: newColId, header: 'Column', cellType: 'text', width: 1 };
    const newCols = [...block.columns, newCol];
    const newRows = block.rows.map((r) => ({ ...r, cells: { ...r.cells, [newColId]: '' } }));
    update({ columns: newCols, rows: newRows });
  };

  const removeColumn = (colId: string) => {
    if (block.columns.length <= 1) return;
    const newCols = block.columns.filter((c) => c.id !== colId);
    const newRows = block.rows.map((r) => {
      const cells = { ...r.cells };
      delete cells[colId];
      return { ...r, cells };
    });
    update({ columns: newCols, rows: newRows });
  };

  const moveColumn = (colId: string, dir: -1 | 1) => {
    const idx = block.columns.findIndex((c) => c.id === colId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= block.columns.length) return;
    const cols = [...block.columns];
    [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
    update({ columns: cols });
  };

  const insertColLeft = (colId: string) => {
    const idx = block.columns.findIndex((c) => c.id === colId);
    if (idx < 0) return;
    const newColId = newId();
    const newCol: TableColumn = { id: newColId, header: 'Column', cellType: 'text', width: 1 };
    const cols = [...block.columns];
    cols.splice(idx, 0, newCol);
    const rows = block.rows.map((r) => ({ ...r, cells: { ...r.cells, [newColId]: '' } }));
    update({ columns: cols, rows });
  };

  const insertColRight = (colId: string) => {
    const idx = block.columns.findIndex((c) => c.id === colId);
    if (idx < 0) return;
    const newColId = newId();
    const newCol: TableColumn = { id: newColId, header: 'Column', cellType: 'text', width: 1 };
    const cols = [...block.columns];
    cols.splice(idx + 1, 0, newCol);
    const rows = block.rows.map((r) => ({ ...r, cells: { ...r.cells, [newColId]: '' } }));
    update({ columns: cols, rows });
  };

  // ── Row operations ─────────────────────────────────────────────────────────

  const addRow = () => {
    const cells: Record<string, string> = {};
    block.columns.forEach((c) => { cells[c.id] = ''; });
    update({ rows: [...block.rows, { id: newId(), cells }] });
  };

  const insertRowAbove = (rowId: string) => {
    const idx = block.rows.findIndex((r) => r.id === rowId);
    if (idx < 0) return;
    const cells: Record<string, string> = {};
    block.columns.forEach((c) => { cells[c.id] = ''; });
    const rows = [...block.rows];
    rows.splice(idx, 0, { id: newId(), cells });
    update({ rows });
  };

  const insertRowBelow = (rowId: string) => {
    const idx = block.rows.findIndex((r) => r.id === rowId);
    if (idx < 0) return;
    const cells: Record<string, string> = {};
    block.columns.forEach((c) => { cells[c.id] = ''; });
    const rows = [...block.rows];
    rows.splice(idx + 1, 0, { id: newId(), cells });
    update({ rows });
  };

  // ── Context menu handlers ──────────────────────────────────────────────────

  const openContextMenu = (e: React.MouseEvent, rowId: string, colId: string) => {
    if (mode !== 'edit') return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, cell: { rowId, colId } });
    // If the right-clicked cell isn't in the selection, reset selection to just this cell
    const alreadySelected = selectedCells.some((c) => c.rowId === rowId && c.colId === colId);
    if (!alreadySelected) setSelectedCells([{ rowId, colId }]);
  };

  const handleCellClick = (e: React.MouseEvent, rowId: string, colId: string) => {
    if (mode !== 'edit') return;
    if (e.shiftKey) {
      // Toggle cell in/out of multi-selection
      setSelectedCells((prev) => {
        const exists = prev.some((c) => c.rowId === rowId && c.colId === colId);
        return exists
          ? prev.filter((c) => !(c.rowId === rowId && c.colId === colId))
          : [...prev, { rowId, colId }];
      });
    } else {
      setSelectedCells([{ rowId, colId }]);
    }
  };

  // ── Touch long-press ───────────────────────────────────────────────────────

  const handleTouchStart = (rowId: string, colId: string) => {
    lastTouchRef.current = { rowId, colId };
    longPressTimer.current = setTimeout(() => {
      const el = document.querySelector(`[data-cell-id="cell-${rowId}-${colId}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setCtxMenu({ x: rect.left, y: rect.bottom + 4, cell: { rowId, colId } });
        setSelectedCells([{ rowId, colId }]);
      }
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ── Merge / split ──────────────────────────────────────────────────────────

  const handleMergeCells = (cells: CellAddress[]) => {
    if (cells.length < 2) return;
    // Simple colspan: merge cells in the same row
    const rowIds = [...new Set(cells.map((c) => c.rowId))];
    if (rowIds.length === 1) {
      const colCount = cells.length;
      const firstColId = cells[0].colId;
      applyCellStyles([{ rowId: rowIds[0], colId: firstColId }], { colspan: colCount });
    }
  };

  const handleSplitCell = (cell: CellAddress) => {
    applyCellStyles([cell], { colspan: 1, rowspan: 1 });
  };

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (mode === 'edit') {
    return (
      <div className="my-2 group/table">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.columns.map((col, colIdx) => {
                  const cs = getCellStyle('header', col.id);
                  return (
                    <th
                      key={col.id}
                      className="px-3 py-2 text-left text-xs font-bold border border-slate-300 relative"
                      style={{ backgroundColor: headerBg, color: headerText, ...cellStyleToCSS(cs) }}
                      onContextMenu={(e) => openContextMenu(e, 'header', col.id)}
                    >
                      <EditableCellFull
                        initialValue={col.header}
                        value={col.header}
                        onCommit={(text) => {
                          const newCols = block.columns.map((c) =>
                            c.id === col.id ? { ...c, header: text } : c
                          );
                          update({ columns: newCols });
                        }}
                        className="outline-none cursor-text min-w-[40px] pr-10"
                        data-cell-id={`header-${col.id}`}
                      />

                      {/* Per-column controls */}
                      <div className="absolute top-0.5 right-0.5 hidden group-hover/table:flex items-center gap-0.5">
                        {colIdx > 0 && (
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); moveColumn(col.id, -1); }}
                            className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/20 transition-colors" title="Move column left">
                            <ChevronLeft size={9} />
                          </button>
                        )}
                        {colIdx < block.columns.length - 1 && (
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); moveColumn(col.id, 1); }}
                            className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/20 transition-colors" title="Move column right">
                            <ChevronRight size={9} />
                          </button>
                        )}
                        {block.columns.length > 1 && (
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); removeColumn(col.id); }}
                            className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-red-300 hover:bg-white/20 transition-colors" title="Delete column">
                            <Trash2 size={9} />
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* "Add column" header cell */}
                <th className="w-8 border border-slate-300 text-center" style={{ backgroundColor: headerBg }}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); addColumn(); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/20 transition-colors mx-auto" title="Add column">
                    <Plus size={11} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={row.id} className={block.stripedRows && rowIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                  {block.columns.map((col) => {
                    const cs = getCellStyle(row.id, col.id);
                    const isSelected = selectedCells.some((c) => c.rowId === row.id && c.colId === col.id);
                    const colSpan = cs.colspan ?? 1;
                    const rowSpan = cs.rowspan ?? 1;
                    return (
                      <td
                        key={col.id}
                        colSpan={colSpan > 1 ? colSpan : undefined}
                        rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        className={`px-3 py-1.5 border border-slate-200 text-xs transition-colors ${isSelected ? 'ring-1 ring-inset ring-primary/40 bg-primary/5' : ''}`}
                        style={cellStyleToCSS(cs)}
                        onContextMenu={(e) => openContextMenu(e, row.id, col.id)}
                        onClick={(e) => handleCellClick(e, row.id, col.id)}
                        onTouchStart={() => handleTouchStart(row.id, col.id)}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchEnd}
                      >
                        <EditableCellFull
                          initialValue={row.cells[col.id] ?? ''}
                          value={row.cells[col.id] ?? ''}
                          onCommit={(html) => {
                            const newRows = block.rows.map((r) =>
                              r.id === row.id
                                ? { ...r, cells: { ...r.cells, [col.id]: html } }
                                : r
                            );
                            update({ rows: newRows });
                          }}
                          className="outline-none cursor-text min-h-[1em] min-w-[40px]"
                          data-cell-id={`cell-${row.id}-${col.id}`}
                        />
                      </td>
                    );
                  })}
                  {/* Row delete */}
                  <td className="w-8 border border-slate-200 text-center">
                    <button type="button" onClick={() => update({ rows: block.rows.filter((r) => r.id !== row.id) })}
                      className="text-slate-300 hover:text-red-400 transition-colors p-1" title="Delete row">
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add row */}
        <button type="button" onClick={addRow}
          className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors px-1">
          <Plus size={11} /> Add row
        </button>

        {/* Context menu */}
        {ctxMenu && (
          <TableCellContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            cellAddress={ctxMenu.cell}
            selectedCells={selectedCells}
            currentStyle={getCellStyle(ctxMenu.cell.rowId, ctxMenu.cell.colId)}
            onStyleChange={applyCellStyles}
            onInsertRowAbove={insertRowAbove}
            onInsertRowBelow={insertRowBelow}
            onInsertColLeft={insertColLeft}
            onInsertColRight={insertColRight}
            onDeleteRow={(rowId) => update({ rows: block.rows.filter((r) => r.id !== rowId) })}
            onDeleteCol={removeColumn}
            onMergeCells={handleMergeCells}
            onSplitCell={handleSplitCell}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  // ── Preview / fill mode ────────────────────────────────────────────────────
  return (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {block.columns.map((col) => {
              const cs = getCellStyle('header', col.id);
              return (
                <th
                  key={col.id}
                  className="px-3 py-2 text-left text-xs font-bold border border-slate-300"
                  style={{ backgroundColor: headerBg, color: headerText, ...cellStyleToCSS(cs) }}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIdx) => (
            <tr key={row.id} className={block.stripedRows && rowIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
              {block.columns.map((col) => {
                const cs = getCellStyle(row.id, col.id);
                const colSpan = cs.colspan ?? 1;
                const rowSpan = cs.rowspan ?? 1;
                return (
                  <td
                    key={col.id}
                    colSpan={colSpan > 1 ? colSpan : undefined}
                    rowSpan={rowSpan > 1 ? rowSpan : undefined}
                    className="px-3 py-2 border border-slate-200 text-xs"
                    style={cellStyleToCSS(cs)}
                  >
                    {mode === 'fill' ? (
                      <input
                        type="text"
                        defaultValue={row.cells[col.id] ?? ''}
                        className="w-full outline-none bg-transparent"
                        placeholder="—"
                      />
                    ) : (
                      <span dangerouslySetInnerHTML={{ __html: sanitiseHtml(row.cells[col.id] || '<span style="color:#cbd5e1">—</span>') }} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
