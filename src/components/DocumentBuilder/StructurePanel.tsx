/**
 * StructurePanel — canvas with integrated DocSidebar insert panel
 *
 * The DocSidebar (Structure / Tables / Form Fields / System Fields / Advanced)
 * now lives here as a collapsible left panel alongside the canvas. This removes
 * the need for the Structure, Tables, and Form Fields top ribbon tabs — all
 * insert actions are accessible from the sidebar regardless of which ribbon tab
 * is active.
 */

import { useState } from 'react';
import BlockCanvas from './BlockCanvas';
import DocSidebar from './DocSidebar';

interface Props {
  zoom?: number;
  onImportDocx?: () => void;
}

export default function StructurePanel({ zoom = 100, onImportDocx }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left insert sidebar — hidden on mobile (ribbon FAB handles mobile inserts) */}
      <div className="hidden sm:flex flex-shrink-0">
        <DocSidebar
          onImportDocx={onImportDocx ?? (() => {})}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
      </div>

      {/* Canvas */}
      <div className="flex flex-1 min-h-0">
        <BlockCanvas zoom={zoom} />
      </div>
    </div>
  );
}
