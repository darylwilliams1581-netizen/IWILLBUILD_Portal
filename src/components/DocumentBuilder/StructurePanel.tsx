/**
 * StructurePanel — canvas only (no inspector)
 * The BlockInspector is rendered by the parent (index.tsx) only when the
 * Structure tab is active, so other tabs never show the right panel.
 */

import BlockCanvas from './BlockCanvas';

export default function StructurePanel() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BlockCanvas />
      </div>
    </div>
  );
}
