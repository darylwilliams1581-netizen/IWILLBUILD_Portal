import { Image as ImageIcon, Upload } from 'lucide-react';
import { useDocumentStore } from '../useDocumentStore';
import type { ImageBlock } from '../types';

interface Props {
  block: ImageBlock;
  columnsBlockId?: string;
  columnId?: string;
}

const SIZE_MAP: Record<string, string> = {
  small:  'max-w-[200px]',
  medium: 'max-w-[400px]',
  large:  'max-w-[600px]',
  full:   'w-full',
};

const ALIGN_MAP: Record<string, string> = {
  left:   'mr-auto',
  center: 'mx-auto',
  right:  'ml-auto',
};

export default function ImageBlockView({ block, columnsBlockId, columnId }: Props) {
  const { mode, updateBlock, updateBlockInColumn } = useDocumentStore();

  const update = (patch: Partial<ImageBlock>) => {
    if (columnsBlockId && columnId) {
      updateBlockInColumn(columnsBlockId, columnId, block.id, patch);
    } else {
      updateBlock(block.id, patch);
    }
  };

  const sizeClass = SIZE_MAP[block.size] ?? SIZE_MAP.medium;
  const alignClass = ALIGN_MAP[block.align] ?? ALIGN_MAP.center;

  if (!block.src) {
    if (mode !== 'edit') return null;
    return (
      <div className={`my-2 ${sizeClass} ${alignClass} border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center gap-2 text-slate-400`}>
        <ImageIcon size={28} />
        <p className="text-xs text-center">Image block — set image URL in the inspector panel</p>
      </div>
    );
  }

  return (
    <div className={`my-2 ${sizeClass} ${alignClass}`}>
      <img
        src={block.src}
        alt={block.alt}
        className={`rounded ${block.preserveAspectRatio ? 'object-contain' : 'object-cover'} w-full`}
      />
      {block.caption && (
        <p className="text-xs text-slate-500 text-center mt-1 italic">{block.caption}</p>
      )}
    </div>
  );
}
