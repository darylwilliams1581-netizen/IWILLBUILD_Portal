/**
 * StructurePanel — canvas only (no inspector)
 * The BlockInspector is rendered by the parent (index.tsx) only when the
 * Structure tab is active, so other tabs never show the right panel.
 */

import BlockCanvas from './BlockCanvas';

interface Props { zoom?: number; }

export default function StructurePanel({ zoom = 100 }: Props) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <BlockCanvas zoom={zoom} />
      </div>
    </div>
  );
}
