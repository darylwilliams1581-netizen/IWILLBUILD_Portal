import type { DividerBlock } from '../types';

export default function DividerBlockView({ block }: { block: DividerBlock }) {
  return (
    <div className="py-2">
      <hr
        style={{
          borderStyle: block.style,
          borderColor: block.color ?? '#e2e8f0',
          borderTopWidth: block.thickness ?? 1,
          borderBottomWidth: 0,
          borderLeftWidth: 0,
          borderRightWidth: 0,
        }}
      />
    </div>
  );
}
