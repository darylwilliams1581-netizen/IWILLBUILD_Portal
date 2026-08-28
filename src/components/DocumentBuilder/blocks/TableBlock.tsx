import { useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDocumentStore, newId } from '../useDocumentStore';
import type { TableBlock, TableColumn, TableRow } from '../types';
import { sanitiseHtml } from '../sanitiseHtml';

interface Props {
  block: TableBlock;
  columnsBlockId?: string;
  columnId?: string;
}

// ── Uncontrolled contentEditable cell ─────────────────────────────────────────
// Uses a ref to sync external value changes into the DOM only when the element
// is NOT focused. This prevents React from overwriting the user's in-progress
// edits (which would restore deleted characters and reset the caret).
interface EditableCellProps {
  value: string;
  onCommit: (html: string) => void;
  className?: string;
  style?: React.CSSProperties;
  'data-cell-id'?: string;
}

function EditableCell({ value, onCommit, className, style, 'data-cell-id': dataCellId }: EditableCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Track the last value we wrote to the DOM so we only sync when the external
  // value actually changed (e.g. undo/redo, structural change from another user).
  const lastSyncedValue = useRef<string>(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only sync if the external value changed AND the element is not focused.
    // If it IS focused, the user is mid-edit — leave the DOM alone.
    if (value !== lastSyncedValue.current && document.activeElement !== el) {
      // eslint-disable-next-line no-unsanitized/property -- value is already sanitised by the caller
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
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      className={className}
      style={style}
      data-cell-id={dataCellId}
      // ⚠️  NO dangerouslySetInnerHTML here — initial content is set imperatively
      // in the layout effect below so React never touches innerHTML after mount.
    />
  );
}

// Set initial innerHTML imperatively after mount so React's reconciler never
// owns the innerHTML of a contentEditable. We do this via a one-time ref callback.
function useInitialHtml(value: string) {
  return useCallback((el: HTMLDivElement | null) => {
    if (el && el.innerHTML === '') {
      // eslint-disable-next-line no-unsanitized/property -- value is sanitised before passing
      el.innerHTML = sanitiseHtml(value);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once at mount
}

// ── EditableCell with ref-callback initialisation ─────────────────────────────
// Combines the ref-sync pattern with a ref-callback for initial HTML so that
// React never sets innerHTML via a prop on a contentEditable.
interface EditableCellFullProps extends EditableCellProps {
  initialValue: string;
}

function EditableCellFull({ initialValue, value, onCommit, className, style, 'data-cell-id': dataCellId }: EditableCellFullProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const lastSyncedValue = useRef<string>(initialValue);
  const initialised = useRef(false);

  // Ref callback: set innerHTML once at mount, before React paints
  const refCallback = useCallback((el: HTMLDivElement | null) => {
    (elRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && !initialised.current) {
      // eslint-disable-next-line no-unsanitized/property -- sanitised
      el.innerHTML = sanitiseHtml(initialValue);
      initialised.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — run once

  // Sync external changes when not focused
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

  const update = useCallback((patch: Partial<TableBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  }, [columnsBlockId, columnId, block.id, updateBlock, updateBlockInColumn]);

  const headerBg   = block.headerBgColor   ?? '#1e293b';
  const headerText = block.headerTextColor ?? '#ffffff';

  // ── Add a new column ────────────────────────────────────────────────────────
  const addColumn = () => {
    const newColId = newId();
    const newCol: TableColumn = { id: newColId, header: 'Column', cellType: 'text', width: 1 };
    const newCols = [...block.columns, newCol];
    const newRows = block.rows.map((r) => ({ ...r, cells: { ...r.cells, [newColId]: '' } }));
    update({ columns: newCols, rows: newRows });
  };

  // ── Remove a column ─────────────────────────────────────────────────────────
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

  // ── Move a column left / right ───────────────────────────────────────────────
  const moveColumn = (colId: string, dir: -1 | 1) => {
    const idx = block.columns.findIndex((c) => c.id === colId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= block.columns.length) return;
    const cols = [...block.columns];
    [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
    update({ columns: cols });
  };

  // ── Add a new row ────────────────────────────────────────────────────────────
  const addRow = () => {
    const cells: Record<string, string> = {};
    block.columns.forEach((c) => { cells[c.id] = ''; });
    update({ rows: [...block.rows, { id: newId(), cells }] });
  };

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (mode === 'edit') {
    return (
      <div className="my-2 group/table">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.columns.map((col, colIdx) => (
                  <th
                    key={col.id}
                    className="px-3 py-2 text-left text-xs font-bold border border-slate-300 relative"
                    style={{ backgroundColor: headerBg, color: headerText }}
                  >
                    {/* Column header — uncontrolled contentEditable */}
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

                    {/* Per-column controls — shown on hover */}
                    <div className="absolute top-0.5 right-0.5 hidden group-hover/table:flex items-center gap-0.5">
                      {colIdx > 0 && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); moveColumn(col.id, -1); }}
                          className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                          title="Move column left"
                        >
                          <ChevronLeft size={9} />
                        </button>
                      )}
                      {colIdx < block.columns.length - 1 && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); moveColumn(col.id, 1); }}
                          className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                          title="Move column right"
                        >
                          <ChevronRight size={9} />
                        </button>
                      )}
                      {block.columns.length > 1 && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); removeColumn(col.id); }}
                          className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-red-300 hover:bg-white/20 transition-colors"
                          title="Delete column"
                        >
                          <Trash2 size={9} />
                        </button>
                      )}
                    </div>
                  </th>
                ))}

                {/* "Add column" header cell */}
                <th
                  className="w-8 border border-slate-300 text-center"
                  style={{ backgroundColor: headerBg }}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); addColumn(); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/20 transition-colors mx-auto"
                    title="Add column"
                  >
                    <Plus size={11} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr
                  key={row.id}
                  className={block.stripedRows && rowIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}
                >
                  {block.columns.map((col) => (
                    <td key={col.id} className="px-3 py-1.5 border border-slate-200 text-xs">
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
                  ))}
                  {/* Row delete */}
                  <td className="w-8 border border-slate-200 text-center">
                    <button
                      type="button"
                      onClick={() => update({ rows: block.rows.filter((r) => r.id !== row.id) })}
                      className="text-slate-300 hover:text-red-400 transition-colors p-1"
                      title="Delete row"
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add row */}
        <button
          type="button"
          onClick={addRow}
          className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors px-1"
        >
          <Plus size={11} /> Add row
        </button>
      </div>
    );
  }

  // ── Preview / fill mode ────────────────────────────────────────────────────
  return (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {block.columns.map((col) => (
              <th
                key={col.id}
                className="px-3 py-2 text-left text-xs font-bold border border-slate-300"
                style={{ backgroundColor: headerBg, color: headerText }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIdx) => (
            <tr key={row.id} className={block.stripedRows && rowIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
              {block.columns.map((col) => (
                <td key={col.id} className="px-3 py-2 border border-slate-200 text-xs">
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
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
