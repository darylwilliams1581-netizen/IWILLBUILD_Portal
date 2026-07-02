import { Zap } from 'lucide-react';
import { useDocumentStore } from '../useDocumentStore';
import { getSystemField } from '../systemFields';
import type { SystemFieldBlock } from '../types';

interface Props {
  block: SystemFieldBlock;
}

export default function SystemFieldBlockView({ block }: Props) {
  const { mode } = useDocumentStore();
  const fieldDef = getSystemField(block.fieldKey);

  if (mode === 'edit') {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-xs font-medium text-primary">
        <Zap size={10} />
        <span>{block.showLabel ? `${block.label}: ` : ''}</span>
        <span className="font-mono text-[10px] text-orange-600">{'{{ '}{block.fieldKey}{' }}'}</span>
      </div>
    );
  }

  // Preview / fill mode — show fallback
  return (
    <span className="text-sm text-slate-700">
      {block.showLabel && <span className="font-semibold mr-1">{block.label}:</span>}
      <span className="text-slate-400 italic">{block.fallback}</span>
    </span>
  );
}
