/**
 * StructurePanel — Advanced structure view of the underlying blocks
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown when the user switches to "Structure" mode.
 * Renders the existing BlockCanvas + BlockInspector side by side,
 * giving full access to block settings, logic, and drag-reorder.
 */

import BlockCanvas from './BlockCanvas';
import BlockInspector from './BlockInspector';
import { useState } from 'react';

export default function StructurePanel() {
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <BlockCanvas />
      </div>
      <BlockInspector
        collapsed={rightCollapsed}
        onToggleCollapse={() => setRightCollapsed((v) => !v)}
      />
    </div>
  );
}
