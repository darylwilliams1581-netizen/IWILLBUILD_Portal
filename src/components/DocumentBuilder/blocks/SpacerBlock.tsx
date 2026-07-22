import { useDocumentStore } from '../useDocumentStore';
import type { SpacerBlock } from '../types';

export default function SpacerBlockView({ block }: { block: SpacerBlock }) {
  const { mode } = useDocumentStore();
  return (
    <div
      style={{ height: block.height }}
      className={mode === 'edit' ? 'border border-dashed border-slate-200 rounded flex items-center justify-center' : ''}
    >
      {mode === 'edit' && (
        <span className="text-[10px] text-slate-300">{block.height}px spacer</span>
      )}
    </div>
  );
}
