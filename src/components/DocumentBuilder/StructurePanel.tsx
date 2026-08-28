/**
 * StructurePanel — canvas only.
 * The DocSidebar insert panel is rendered by index.tsx as a ribbon panel
 * when the "Document Tools" tab is active, keeping a single left panel.
 */

import BlockCanvas from './BlockCanvas';

interface Props { zoom?: number; }

export default function StructurePanel({ zoom = 100 }: Props) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-1 min-h-0">
        <BlockCanvas zoom={zoom} />
      </div>
    </div>
  );
}
