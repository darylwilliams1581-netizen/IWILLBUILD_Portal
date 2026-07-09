/**
 * DocSidebar — Document-oriented left sidebar for the page editor
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the block-heavy BlockLibrarySidebar with a document-first tool panel.
 *
 * Sections:
 *   1. Import (DOCX / PDF)
 *   2. Insert — document-oriented inserts (section, table, signature, photo, etc.)
 *   3. Advanced Blocks — collapsible, for power users
 */

import { useState } from 'react';
import {
  FileUp, Table2, PenLine, Camera, SplitSquareHorizontal,
  Minus, AlignLeft, ChevronDown, ChevronRight,
  FileText, Type, Hash, AlertTriangle, Image,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import { nanoid } from 'nanoid';
import type { DocumentBlock } from './types';

interface Props {
  onImportDocx: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function DocSidebar({ onImportDocx, collapsed, onToggleCollapse }: Props) {
  const { appendBlocks } = useDocumentStore();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function insert(block: DocumentBlock) {
    appendBlocks([block]);
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-2 border-r border-slate-200 bg-white w-10 flex-shrink-0">
        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-52 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Document Tools</span>
        <button
          onClick={onToggleCollapse}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">

        {/* ── Import ─────────────────────────────────────────────────────── */}
        <SectionLabel>Import</SectionLabel>
        <ToolBtn icon={<FileUp size={13} />} label="Import DOCX / PDF" onClick={onImportDocx} primary />

        {/* ── Insert ─────────────────────────────────────────────────────── */}
        <SectionLabel className="mt-2">Insert</SectionLabel>

        <ToolBtn
          icon={<Hash size={13} />}
          label="Section Heading"
          onClick={() => insert({
            id: nanoid(10), type: 'heading', content: 'Section Heading', level: 2, align: 'left',
          })}
        />
        <ToolBtn
          icon={<Type size={13} />}
          label="Paragraph"
          onClick={() => insert({
            id: nanoid(10), type: 'text', content: 'Enter text here…', align: 'left',
          })}
        />
        <ToolBtn
          icon={<Table2 size={13} />}
          label="Table"
          onClick={() => {
            const c1 = nanoid(8); const c2 = nanoid(8); const c3 = nanoid(8);
            insert({
              id: nanoid(10), type: 'table', mode: 'static',
              columns: [
                { id: c1, header: 'Column 1', cellType: 'text', width: 1 },
                { id: c2, header: 'Column 2', cellType: 'text', width: 1 },
                { id: c3, header: 'Column 3', cellType: 'text', width: 1 },
              ],
              rows: [
                { id: nanoid(8), cells: { [c1]: '', [c2]: '', [c3]: '' } },
                { id: nanoid(8), cells: { [c1]: '', [c2]: '', [c3]: '' } },
              ],
              stripedRows: true,
            });
          }}
        />
        <ToolBtn
          icon={<PenLine size={13} />}
          label="Signature Area"
          onClick={() => insert({
            id: nanoid(10), type: 'field', fieldType: 'signature',
            label: 'Signature', required: false,
          })}
        />
        <ToolBtn
          icon={<Camera size={13} />}
          label="Photo / Evidence"
          onClick={() => insert({
            id: nanoid(10), type: 'field', fieldType: 'photo',
            label: 'Photo / Evidence', required: false,
          })}
        />
        <ToolBtn
          icon={<SplitSquareHorizontal size={13} />}
          label="Two-Column Grid"
          onClick={() => {
            const col1Id = nanoid(8); const col2Id = nanoid(8);
            insert({
              id: nanoid(10), type: 'columns',
              columns: [
                { id: col1Id, width: 1, blocks: [{ id: nanoid(10), type: 'text', content: 'Left column', align: 'left' }] },
                { id: col2Id, width: 1, blocks: [{ id: nanoid(10), type: 'text', content: 'Right column', align: 'left' }] },
              ],
              gap: 'md',
            });
          }}
        />
        <ToolBtn
          icon={<Minus size={13} />}
          label="Divider"
          onClick={() => insert({ id: nanoid(10), type: 'divider', style: 'solid', thickness: 1 })}
        />
        <ToolBtn
          icon={<AlignLeft size={13} />}
          label="Page Break"
          onClick={() => insert({ id: nanoid(10), type: 'page_break' })}
        />

        {/* ── Form Fields ────────────────────────────────────────────────── */}
        <SectionLabel className="mt-2">Form Fields</SectionLabel>
        <ToolBtn
          icon={<FileText size={13} />}
          label="Short Text Field"
          onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'short_text', label: 'Text Field', required: false })}
        />
        <ToolBtn
          icon={<FileText size={13} />}
          label="Long Text Field"
          onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'long_text', label: 'Long Text', required: false })}
        />
        <ToolBtn
          icon={<FileText size={13} />}
          label="Yes / No"
          onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'yes_no', label: 'Yes / No', required: false })}
        />
        <ToolBtn
          icon={<FileText size={13} />}
          label="Date"
          onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'date', label: 'Date', required: false })}
        />
        <ToolBtn
          icon={<FileText size={13} />}
          label="Choice / Dropdown"
          onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'single_choice', label: 'Choice', required: false, options: ['Option A', 'Option B', 'Option C'] })}
        />
        <ToolBtn
          icon={<FileText size={13} />}
          label="File Upload"
          onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'file_upload', label: 'File Upload', required: false })}
        />

        {/* ── Advanced Blocks (collapsible) ──────────────────────────────── */}
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1.5 w-full mt-3 px-2 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          {advancedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Advanced Blocks
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-1">
            <ToolBtn
              icon={<AlertTriangle size={13} />}
              label="Banner / Callout"
              onClick={() => insert({
                id: nanoid(10), type: 'banner', variant: 'info',
                title: 'Notice', body: 'Enter banner text here.', size: 'standard', align: 'left', showOnExport: true,
              })}
            />
            <ToolBtn
              icon={<Image size={13} />}
              label="Image"
              onClick={() => insert({
                id: nanoid(10), type: 'image', src: '', alt: '', size: 'medium', align: 'left', preserveAspectRatio: true,
              })}
            />
            <ToolBtn
              icon={<FileText size={13} />}
              label="Rich Text Block"
              onClick={() => insert({ id: nanoid(10), type: 'rich_text', html: '<p>Enter rich text…</p>' })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`px-2 pt-1 pb-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest ${className}`}>
      {children}
    </p>
  );
}

function ToolBtn({
  icon, label, onClick, primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
        primary
          ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      <span className={primary ? 'text-primary' : 'text-slate-400'}>{icon}</span>
      {label}
    </button>
  );
}
