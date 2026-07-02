import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useDocumentStore, newId } from '../useDocumentStore';
import type { TableBlock, TableRow } from '../types';

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

  const headerBg = block.headerBgColor ?? '#1e293b';
  const headerText = block.headerTextColor ?? '#ffffff';

  // ── Edit mode ──────────────────────────────────────────────────────────────

  if (mode === 'edit') {
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
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const newCols = block.columns.map((c) =>
                        c.id === col.id ? { ...c, header: e.currentTarget.textContent ?? '' } : c
                      );
                      update({ columns: newCols });
                    }}
                    className="outline-none cursor-text min-w-[40px]"
                    dangerouslySetInnerHTML={{ __html: col.header }}
                  />
                </th>
              ))}
              <th className="w-8 border border-slate-300" style={{ backgroundColor: headerBg }} />
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIdx) => (
              <tr key={row.id} className={block.stripedRows && rowIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                {block.columns.map((col) => (
                  <td key={col.id} className="px-3 py-1.5 border border-slate-200 text-xs">
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newRows = block.rows.map((r) =>
                          r.id === row.id
                            ? { ...r, cells: { ...r.cells, [col.id]: e.currentTarget.textContent ?? '' } }
                            : r
                        );
                        update({ rows: newRows });
                      }}
                      className="outline-none cursor-text min-h-[1em] min-w-[40px]"
                      dangerouslySetInnerHTML={{ __html: row.cells[col.id] ?? '' }}
                    />
                  </td>
                ))}
                <td className="w-8 border border-slate-200 text-center">
                  <button
                    onClick={() => update({ rows: block.rows.filter((r) => r.id !== row.id) })}
                    className="text-slate-300 hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            const cells: Record<string, string> = {};
            block.columns.forEach((c) => { cells[c.id] = ''; });
            update({ rows: [...block.rows, { id: newId(), cells }] });
          }}
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
                    row.cells[col.id] || <span className="text-slate-300">—</span>
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
