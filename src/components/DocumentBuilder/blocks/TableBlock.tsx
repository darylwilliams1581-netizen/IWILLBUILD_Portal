import { useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDocumentStore, newId } from '../useDocumentStore';
import type { TableBlock, TableColumn, TableRow } from '../types';

interface Props {
  block: TableBlock;
  columnsBlockId?: string;
  columnId?: string;
}

export default function TableBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();
  const [fillRows, setFillRows] = useState<TableRow[]>(block.rows);

  const update = (patch: Partial<TableBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

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
    if (block.columns.length <= 1) return; // keep at least 1
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
                    {/* Column header — editable */}
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newCols = block.columns.map((c) =>
                          c.id === col.id ? { ...c, header: e.currentTarget.textContent ?? '' } : c
                        );
                        update({ columns: newCols });
                      }}
                      className="outline-none cursor-text min-w-[40px] pr-10"
                      dangerouslySetInnerHTML={{ __html: col.header }}
                    />

                    {/* Per-column controls — shown on hover */}
                    <div className="absolute top-0.5 right-0.5 hidden group-hover/table:flex items-center gap-0.5">
                      {colIdx > 0 && (
                        <button
                          onMouseDown={(e) => { e.preventDefault(); moveColumn(col.id, -1); }}
                          className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                          title="Move column left"
                        >
                          <ChevronLeft size={9} />
                        </button>
                      )}
                      {colIdx < block.columns.length - 1 && (
                        <button
                          onMouseDown={(e) => { e.preventDefault(); moveColumn(col.id, 1); }}
                          className="w-4 h-4 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                          title="Move column right"
                        >
                          <ChevronRight size={9} />
                        </button>
                      )}
                      {block.columns.length > 1 && (
                        <button
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
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const newRows = block.rows.map((r) =>
                            r.id === row.id
                              ? { ...r, cells: { ...r.cells, [col.id]: e.currentTarget.innerHTML ?? '' } }
                              : r
                          );
                          update({ rows: newRows });
                        }}
                        className="outline-none cursor-text min-h-[1em] min-w-[40px]"
                        dangerouslySetInnerHTML={{ __html: row.cells[col.id] ?? '' }}
                      />
                    </td>
                  ))}
                  {/* Row delete */}
                  <td className="w-8 border border-slate-200 text-center">
                    <button
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
          onClick={addRow}
          className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors px-1"
        >
          <Plus size={11} /> Add row
        </button>
      </div>
    );
  }

  // ── Preview / fill mode ────────────────────────────────────────────────────
  const displayRows = mode === 'fill' && block.repeatable ? fillRows : block.rows;

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
          {displayRows.map((row, rowIdx) => (
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
                    <span dangerouslySetInnerHTML={{ __html: row.cells[col.id] || '<span style="color:#cbd5e1">—</span>' }} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {mode === 'fill' && block.repeatable && (
        <button
          onClick={() => {
            const cells: Record<string, string> = {};
            block.columns.forEach((c) => { cells[c.id] = ''; });
            setFillRows((prev) => [...prev, { id: newId(), cells }]);
          }}
          className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors px-1"
        >
          <Plus size={11} /> Add row
        </button>
      )}
    </div>
  );
}
