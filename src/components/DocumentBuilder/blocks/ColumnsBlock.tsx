import { useDocumentStore } from '../useDocumentStore';
import { BlockRenderer } from '../BlockRenderer';
import type { ColumnsBlock } from '../types';

const GAP_MAP = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };

export default function ColumnsBlockView({ block }: { block: ColumnsBlock }) {
  const { mode, addBlockToColumn } = useDocumentStore();
  const gapClass = GAP_MAP[block.gap ?? 'md'];
  const totalWidth = block.columns.reduce((s, c) => s + c.width, 0);

  return (
    <div className={`flex ${gapClass} py-1`}>
      {block.columns.map((col) => {
        const flexBasis = `${(col.width / totalWidth) * 100}%`;
        return (
          <div
            key={col.id}
            style={{ flex: `0 0 ${flexBasis}`, minWidth: 0 }}
            className={`relative ${mode === 'edit' ? 'min-h-[48px] border border-dashed border-slate-200 rounded p-1' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            {col.blocks.map((childBlock) => (
              <BlockRenderer
                key={childBlock.id}
                block={childBlock}
                columnsBlockId={block.id}
                columnId={col.id}
              />
            ))}
            {mode === 'edit' && col.blocks.length === 0 && (
              <div className="flex items-center justify-center h-10 text-[10px] text-slate-300">
                Empty column
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
