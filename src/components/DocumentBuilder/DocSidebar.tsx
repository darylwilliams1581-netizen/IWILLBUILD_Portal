/**
 * DocSidebar — Document-first left sidebar for the page editor
 * ─────────────────────────────────────────────────────────────────────────────
 * Organised around document authoring tasks, not raw block types.
 *
 * Sections:
 *   1. Import (DOCX / PDF)
 *   2. Structure — headings, paragraphs, dividers, page breaks
 *   3. Tables — blank table, detail grid, SWMS risk table
 *   4. Form Fields — text, date, signature, photo, yes/no, choice
 *   5. System Fields — job-bound tokens (job number, client, date, etc.)
 *   6. Advanced — banner, image, rich text, columns (collapsible)
 */

import { useState, useRef } from 'react';
import {
  FileUp, Table2, PenLine, Camera, Minus,
  ChevronDown, ChevronRight, FileText, Type, Hash,
  AlertTriangle, Image, PanelLeftClose, PanelLeftOpen,
  Calendar, CheckSquare, List, LayoutGrid, Briefcase,
  MapPin, User, Building2, ClipboardList, Zap,
  Info, CheckCircle, ShieldAlert, Shield, AlertOctagon,
  AlignLeft, AlignCenter, AlignRight, BarChart2,
} from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import { nanoid } from 'nanoid';
import type { DocumentBlock, BannerVariant } from './types';
import JobPhotoPicker from './JobPhotoPicker';

interface Props {
  onImportDocx: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /**
   * When the active document is an HTML-canvas doc (source_type='html'),
   * the parent passes this callback instead of using the block store.
   * All insert buttons call onInsertHtml(htmlFragment) when it is present.
   */
  onInsertHtml?: (html: string) => void;
}

// ── System field tokens ───────────────────────────────────────────────────────
// These insert an inline token that resolves to live job data on export.
const SYSTEM_FIELD_TOKENS = [
  { key: 'job.number',       label: 'Job Number',      icon: <Briefcase size={11} /> },
  { key: 'job.name',         label: 'Job Name',        icon: <Briefcase size={11} /> },
  { key: 'job.site_address', label: 'Site Address',    icon: <MapPin size={11} /> },
  { key: 'job.client',       label: 'Client',          icon: <Building2 size={11} /> },
  { key: 'job.supervisor',   label: 'Supervisor',      icon: <User size={11} /> },
  { key: 'job.start_date',   label: 'Start Date',      icon: <Calendar size={11} /> },
  { key: 'company.name',     label: 'Company Name',    icon: <Building2 size={11} /> },
  { key: 'company.abn',      label: 'Company ABN',     icon: <Building2 size={11} /> },
  { key: 'user.name',        label: 'Current User',    icon: <User size={11} /> },
  { key: 'date.today',       label: 'Today\'s Date',   icon: <Calendar size={11} /> },
  { key: 'doc.number',       label: 'Document Number', icon: <ClipboardList size={11} /> },
  { key: 'doc.revision',     label: 'Revision',        icon: <ClipboardList size={11} /> },
];

// ── Banner variant definitions ────────────────────────────────────────────────
const BANNER_VARIANTS: {
  variant: string;
  label: string;
  defaultTitle: string;
  defaultBody: string;
  icon: React.ReactNode;
  accent?: string;
}[] = [
  { variant: 'info',         label: 'Info',         defaultTitle: 'Note',          defaultBody: 'Enter information here.',   icon: <Info size={12} />,          accent: 'blue' },
  { variant: 'warning',      label: 'Warning',       defaultTitle: 'Warning',       defaultBody: 'Enter warning here.',       icon: <AlertTriangle size={12} />, accent: 'amber' },
  { variant: 'danger',       label: 'Danger',        defaultTitle: 'Danger',        defaultBody: 'Enter danger notice here.', icon: <AlertOctagon size={12} />,  accent: 'red' },
  { variant: 'success',      label: 'Success',       defaultTitle: 'Complete',      defaultBody: 'Enter success note here.',  icon: <CheckCircle size={12} />,   accent: 'green' },
  { variant: 'safety',       label: 'Safety',        defaultTitle: 'Safety Notice', defaultBody: 'Enter safety info here.',   icon: <Shield size={12} />,        accent: 'orange' },
  { variant: 'safety_first', label: 'Safety First',  defaultTitle: 'SAFETY FIRST',  defaultBody: 'THINK SAFE. WORK SAFE.',    icon: <ShieldAlert size={12} />,   accent: 'yellow' },
  { variant: 'first_aid',    label: 'First Aid',     defaultTitle: 'FIRST AID',     defaultBody: 'KNOW YOUR NEAREST KIT',     icon: <ShieldAlert size={12} />,   accent: 'red' },
  { variant: 'custom',       label: 'Custom',        defaultTitle: 'Custom Banner',  defaultBody: 'Enter text here.',         icon: <ShieldAlert size={12} /> },
];

// ── Image insert panel ────────────────────────────────────────────────────────
function ImageInsertPanel({ onInsert }: { onInsert: (block: DocumentBlock) => void }) {
  const { sourceJobId } = useDocumentStore();
  const [tab, setTab] = useState<'upload' | 'job'>('upload');
  const [size, setSize]   = useState<'small' | 'medium' | 'large' | 'full'>('medium');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const SIZE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large', full: 'Full width' };

  const handleFileInsert = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', file.name);
      const res = await fetch('/api/files', { method: 'POST', body: fd });
      const data = await res.json() as { file?: { id: number }; error?: string };
      if (!res.ok || !data.file?.id) throw new Error(data.error ?? 'Upload failed');
      const src = ['/api/files', String(data.file.id), 'download'].join('/') + '?inline=1';
      onInsert({ id: nanoid(10), type: 'image', src, alt: file.name.replace(/\.[^.]+$/, ''), size, align, preserveAspectRatio: true });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-2 mb-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex flex-col gap-2">
      {/* Tab bar — only shown for job reports */}
      {sourceJobId && (
        <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-white">
          <button onClick={() => setTab('upload')}
            className={`flex-1 py-1 text-[10px] font-semibold transition-colors ${tab === 'upload' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700'}`}>
            Upload / URL
          </button>
          <button onClick={() => setTab('job')}
            className={`flex-1 py-1 text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 ${tab === 'job' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700'}`}>
            <Camera size={10} /> From job
          </button>
        </div>
      )}

      {tab === 'job' && sourceJobId ? (
        <JobPhotoPicker
          jobId={sourceJobId}
          size={size}
          align={align}
          onInsertPhoto={(src, alt) =>
            onInsert({ id: nanoid(10), type: 'image', src, alt, size, align, preserveAspectRatio: true })
          }
        />
      ) : (
        <>
          <p className="text-[9px] text-slate-400 leading-tight">Pick size &amp; align, then click Insert. Use the right panel to change after inserting.</p>
          {/* Size selector */}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Size</p>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(SIZE_LABELS) as (keyof typeof SIZE_LABELS)[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`py-1 rounded text-[10px] font-semibold transition-colors ${
                    size === s
                      ? 'bg-primary text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary'
                  }`}
                >
                  {SIZE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Align selector */}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Align</p>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAlign(a)}
                  title={a.charAt(0).toUpperCase() + a.slice(1)}
                  className={`flex-1 py-1.5 rounded flex items-center justify-center transition-colors ${
                    align === a
                      ? 'bg-primary text-white'
                      : 'bg-white border border-slate-200 text-slate-500 hover:border-primary/40 hover:text-primary'
                  }`}
                >
                  {a === 'left'   && <AlignLeft size={12} />}
                  {a === 'center' && <AlignCenter size={12} />}
                  {a === 'right'  && <AlignRight size={12} />}
                </button>
              ))}
            </div>
          </div>

          {/* Insert button */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image size={11} />
            {uploading ? 'Uploading…' : 'Insert image'}
          </button>
          {uploadError && <p className="text-[10px] text-red-500">{uploadError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileInsert(f); e.target.value = ''; }}
          />
        </>
      )}
    </div>
  );
}

// ── Block → HTML fragment converter ──────────────────────────────────────────
/**
 * Converts a DocumentBlock descriptor into an HTML fragment string suitable
 * for insertion into the HTML-canvas contentEditable root.
 *
 * Only the block types that DocSidebar can insert are handled here.
 * The output is sanitised by HtmlDocumentCanvas.insertHtml before DOM insertion.
 */
function blockToHtml(block: DocumentBlock): string {
  switch (block.type) {
    case 'heading': {
      const tag = `h${block.level ?? 1}`;
      return `<${tag}>${escHtml(block.content ?? '')}</${tag}>`;
    }
    case 'text':
      return `<p>${escHtml(block.content ?? '')}</p>`;
    case 'rich_text':
      // Already HTML — passed through as-is (sanitised on insert)
      return block.html ?? '<p></p>';
    case 'divider':
      return '<hr/>';
    case 'page_break':
      return '<div class="page-break"></div>';
    case 'table': {
      if (block.mode !== 'static' || !block.columns) return '<p></p>';
      const cols = block.columns;
      const headerRow = `<tr>${cols.map((c) => `<th>${escHtml(c.header ?? '')}</th>`).join('')}</tr>`;
      const bodyRows = (block.rows ?? []).map((row) =>
        `<tr>${cols.map((c) => `<td>${escHtml(row.cells?.[c.id] ?? '')}</td>`).join('')}</tr>`,
      ).join('');
      return `<table><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
    }
    case 'field': {
      // Form fields insert as static printable placeholders — no live form wiring
      const label = escHtml(block.label ?? 'Field');
      switch (block.fieldType) {
        case 'short_text':
        case 'long_text':
          return `<p><strong>${label}:</strong> _______________________________________________</p>`;
        case 'yes_no':
          return `<p><strong>${label}:</strong> ☐ Yes &nbsp;&nbsp; ☐ No</p>`;
        case 'date':
          return `<p><strong>${label}:</strong> ______ / ______ / __________</p>`;
        case 'single_choice':
          return `<p><strong>${label}:</strong> ${(block.options ?? []).map((o) => `☐ ${escHtml(o)}`).join(' &nbsp; ')}</p>`;
        case 'signature':
          return `<p><strong>${label}:</strong> ___________________________ &nbsp; Date: ___________</p>`;
        case 'photo':
          return `<p><strong>${label}:</strong> [Photo / Evidence]</p>`;
        case 'file_upload':
          return `<p><strong>${label}:</strong> [File attachment]</p>`;
        default:
          return `<p><strong>${label}:</strong> _______________</p>`;
      }
    }
    case 'banner': {
      const title = escHtml(block.title ?? '');
      const body  = escHtml(block.body  ?? '');
      return `<div class="banner banner-${block.variant ?? 'info'}"><strong>${title}</strong><p>${body}</p></div>`;
    }
    default:
      return '<p></p>';
  }
}

/** Minimal HTML entity escaper for text content */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function DocSidebar({ onImportDocx, collapsed, onToggleCollapse, onInsertHtml }: Props) {
  const { appendBlocks } = useDocumentStore();
  const [structureOpen, setStructureOpen]   = useState(true);
  const [tablesOpen, setTablesOpen]         = useState(true);
  const [formFieldsOpen, setFormFieldsOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen]     = useState(false);
  const [sysFieldsOpen, setSysFieldsOpen]   = useState(false);

  // ── Insert routing ────────────────────────────────────────────────────────
  // For HTML-canvas documents, onInsertHtml is provided and we route all
  // inserts through it as raw HTML fragments.
  // For block-canvas documents, we fall back to appendBlocks as before.

  function insert(block: DocumentBlock) {
    if (onInsertHtml) {
      onInsertHtml(blockToHtml(block));
    } else {
      appendBlocks([block]);
    }
  }

  /** Insert a system field token as an inline rich_text block */
  function insertSysToken(key: string, label: string) {
    insert({
      id: nanoid(10),
      type: 'rich_text',
      html: `<p><span class="sys-field-token" data-sys-field="${key}" contenteditable="false">⚙ ${label}</span></p>`,
    });
  }

  /** Insert a SWMS-style risk assessment table */
  function insertSwmsTable() {
    const cols = [
      { id: nanoid(8), header: 'Hazard / Risk',       cellType: 'text' as const, width: 2 },
      { id: nanoid(8), header: 'Who is at Risk',      cellType: 'text' as const, width: 1 },
      { id: nanoid(8), header: 'Initial Risk Rating', cellType: 'text' as const, width: 1 },
      { id: nanoid(8), header: 'Control Measures',    cellType: 'text' as const, width: 2 },
      { id: nanoid(8), header: 'Residual Risk',       cellType: 'text' as const, width: 1 },
      { id: nanoid(8), header: 'Responsible',         cellType: 'text' as const, width: 1 },
    ];
    insert({
      id: nanoid(10), type: 'table', mode: 'static',
      columns: cols,
      rows: Array.from({ length: 3 }, () => ({
        id: nanoid(8),
        cells: Object.fromEntries(cols.map((c) => [c.id, ''])),
      })),
      stripedRows: true,
    });
  }

  /** Insert a detail grid (label: value pairs) as a 2-column table */
  function insertDetailGrid() {
    const c1 = nanoid(8); const c2 = nanoid(8);
    insert({
      id: nanoid(10), type: 'table', mode: 'static',
      columns: [
        { id: c1, header: 'Field',  cellType: 'text' as const, width: 1 },
        { id: c2, header: 'Value',  cellType: 'text' as const, width: 2 },
      ],
      rows: [
        { id: nanoid(8), cells: { [c1]: 'Job Number',   [c2]: '' } },
        { id: nanoid(8), cells: { [c1]: 'Client',       [c2]: '' } },
        { id: nanoid(8), cells: { [c1]: 'Site Address', [c2]: '' } },
        { id: nanoid(8), cells: { [c1]: 'Date',         [c2]: '' } },
        { id: nanoid(8), cells: { [c1]: 'Supervisor',   [c2]: '' } },
      ],
      stripedRows: false,
    });
  }

  /** Insert a sign-off table (name, role, signature, date) */
  function insertSignOffTable() {
    const cols = [
      { id: nanoid(8), header: 'Name',      cellType: 'text' as const, width: 2 },
      { id: nanoid(8), header: 'Role',      cellType: 'text' as const, width: 1 },
      { id: nanoid(8), header: 'Signature', cellType: 'text' as const, width: 2 },
      { id: nanoid(8), header: 'Date',      cellType: 'text' as const, width: 1 },
    ];
    insert({
      id: nanoid(10), type: 'table', mode: 'static',
      columns: cols,
      rows: Array.from({ length: 4 }, () => ({
        id: nanoid(8),
        cells: Object.fromEntries(cols.map((c) => [c.id, ''])),
      })),
      stripedRows: false,
    });
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-2 border-r border-slate-200 bg-white w-10 flex-shrink-0">
        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 bg-slate-50">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Document Tools</span>
        <button
          onClick={onToggleCollapse}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">

        {/* ── Import ─────────────────────────────────────────────────────── */}
        <SectionLabel>Import</SectionLabel>
        <ToolBtn icon={<FileUp size={12} />} label="Import DOCX / PDF" onClick={onImportDocx} primary />

        {/* ── Structure ──────────────────────────────────────────────────── */}
        <AccordionHeader open={structureOpen} onToggle={() => setStructureOpen((v) => !v)} className="mt-2">
          Structure
        </AccordionHeader>
        {structureOpen && (
          <div className="flex flex-col gap-0.5">
            <ToolBtn
              icon={<Hash size={12} />}
              label="Document Title (H1)"
              onClick={() => insert({ id: nanoid(10), type: 'heading', content: 'Document Title', level: 1, align: 'left' })}
            />
            <ToolBtn
              icon={<Hash size={12} />}
              label="Section Heading (H2)"
              onClick={() => insert({ id: nanoid(10), type: 'heading', content: 'Section Heading', level: 2, align: 'left' })}
            />
            <ToolBtn
              icon={<Hash size={12} />}
              label="Sub-section (H3)"
              onClick={() => insert({ id: nanoid(10), type: 'heading', content: 'Sub-section', level: 3, align: 'left' })}
            />
            <ToolBtn
              icon={<Type size={12} />}
              label="Paragraph"
              onClick={() => insert({ id: nanoid(10), type: 'text', content: 'Enter text here…', align: 'left' })}
            />
            <ToolBtn
              icon={<List size={12} />}
              label="Bullet List"
              onClick={() => insert({ id: nanoid(10), type: 'rich_text', html: '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>' })}
            />
            <ToolBtn
              icon={<Minus size={12} />}
              label="Section Divider"
              onClick={() => insert({ id: nanoid(10), type: 'divider', style: 'solid', thickness: 1 })}
            />
            <ToolBtn
              icon={<AlignLeft size={12} />}
              label="Page Break"
              onClick={() => insert({ id: nanoid(10), type: 'page_break' })}
            />
          </div>
        )}

        {/* ── Tables ─────────────────────────────────────────────────────── */}
        <AccordionHeader open={tablesOpen} onToggle={() => setTablesOpen((v) => !v)} className="mt-2">
          Tables
        </AccordionHeader>
        {tablesOpen && (
          <div className="flex flex-col gap-0.5">
            <ToolBtn
              icon={<Table2 size={12} />}
              label="Blank Table"
              onClick={() => {
                const c1 = nanoid(8); const c2 = nanoid(8); const c3 = nanoid(8);
                insert({
                  id: nanoid(10), type: 'table', mode: 'static',
                  columns: [
                    { id: c1, header: 'Column 1', cellType: 'text', width: 1 },
                    { id: c2, header: 'Column 2', cellType: 'text', width: 1 },
                    { id: c3, header: 'Column 3', cellType: 'text', width: 1 },
                  ],
                  rows: Array.from({ length: 3 }, () => ({
                    id: nanoid(8), cells: { [c1]: '', [c2]: '', [c3]: '' },
                  })),
                  stripedRows: true,
                });
              }}
            />
            <ToolBtn
              icon={<LayoutGrid size={12} />}
              label="Detail Grid"
              onClick={insertDetailGrid}
            />
            <ToolBtn
              icon={<Zap size={12} />}
              label="SWMS Risk Table"
              onClick={insertSwmsTable}
            />
            <ToolBtn
              icon={<PenLine size={12} />}
              label="Sign-Off Table"
              onClick={insertSignOffTable}
            />
          </div>
        )}

        {/* ── Form Fields ────────────────────────────────────────────────── */}
        <AccordionHeader open={formFieldsOpen} onToggle={() => setFormFieldsOpen((v) => !v)} className="mt-2">
          Form Fields
        </AccordionHeader>
        {formFieldsOpen && (
          <div className="flex flex-col gap-0.5">
            <ToolBtn
              icon={<FileText size={12} />}
              label="Short Text"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'short_text', label: 'Text Field', required: false })}
            />
            <ToolBtn
              icon={<FileText size={12} />}
              label="Long Text"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'long_text', label: 'Long Text', required: false })}
            />
            <ToolBtn
              icon={<CheckSquare size={12} />}
              label="Yes / No"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'yes_no', label: 'Yes / No', required: false })}
            />
            <ToolBtn
              icon={<Calendar size={12} />}
              label="Date"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'date', label: 'Date', required: false })}
            />
            <ToolBtn
              icon={<List size={12} />}
              label="Choice / Dropdown"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'single_choice', label: 'Choice', required: false, options: ['Option A', 'Option B', 'Option C'] })}
            />
            <ToolBtn
              icon={<PenLine size={12} />}
              label="Signature"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'signature', label: 'Signature', required: false })}
            />
            <ToolBtn
              icon={<Camera size={12} />}
              label="Photo / Evidence"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'photo', label: 'Photo / Evidence', required: false })}
            />
            <ToolBtn
              icon={<FileText size={12} />}
              label="File Upload"
              onClick={() => insert({ id: nanoid(10), type: 'field', fieldType: 'file_upload', label: 'File Upload', required: false })}
            />
          </div>
        )}

        {/* ── System Fields ──────────────────────────────────────────────── */}
        <AccordionHeader open={sysFieldsOpen} onToggle={() => setSysFieldsOpen((v) => !v)} className="mt-2">
          System Fields
        </AccordionHeader>
        {sysFieldsOpen && (
          <div className="flex flex-col gap-0.5">
            <p className="px-2 pb-1 text-[9px] text-slate-400 leading-tight">
              Inserts a live data token — resolves to job data on export.
            </p>
            {SYSTEM_FIELD_TOKENS.map((f) => (
              <ToolBtn
                key={f.key}
                icon={f.icon}
                label={f.label}
                onClick={() => insertSysToken(f.key, f.label)}
              />
            ))}
          </div>
        )}

        {/* ── Advanced Blocks ────────────────────────────────────────────── */}
        <AccordionHeader open={advancedOpen} onToggle={() => setAdvancedOpen((v) => !v)} className="mt-2">
          Advanced
        </AccordionHeader>
        {advancedOpen && (
          <div className="flex flex-col gap-0.5">

            {/* ── Banner / Callout picker ─────────────────────────────────── */}
            <p className="px-2 pt-1 pb-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Banners</p>
            {BANNER_VARIANTS.map((bv) => (
              <ToolBtn
                key={bv.variant}
                icon={bv.icon}
                label={bv.label}
                onClick={() => insert({
                  id: nanoid(10), type: 'banner', variant: bv.variant as BannerVariant,
                  title: bv.defaultTitle, body: bv.defaultBody,
                  size: 'standard', align: 'left', showOnExport: true,
                })}
                accent={bv.accent}
              />
            ))}
            <ToolBtn
              icon={<Shield size={12} />}
              label="PPE Banner"
              accent="orange"
              onClick={() => insert({
                id: nanoid(10), type: 'image',
                src: '/airo-assets/images/safety-badges/ppe-banner-strip',
                alt: 'PPE Required — Personal Protective Equipment',
                size: 'full', align: 'center', preserveAspectRatio: true,
              } as DocumentBlock)}
            />
            <ToolBtn
              icon={<BarChart2 size={12} />}
              label="Risk Matrix"
              accent="red"
              onClick={() => insert({
                id: nanoid(10), type: 'image',
                src: '/airo-assets/images/safety-badges/risk-matrix',
                alt: 'Risk Matrix — consequence, likelihood and degree of control',
                size: 'full', align: 'center', preserveAspectRatio: true,
              } as DocumentBlock)}
            />

            {/* ── Image ──────────────────────────────────────────────────── */}
            <p className="px-2 pt-2 pb-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Image</p>
            <ImageInsertPanel onInsert={insert} />

            {/* ── Rich Text / Columns ────────────────────────────────────── */}
            <p className="px-2 pt-2 pb-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Layout</p>
            <ToolBtn
              icon={<FileText size={12} />}
              label="Rich Text Block"
              onClick={() => insert({ id: nanoid(10), type: 'rich_text', html: '<p>Enter rich text…</p>' })}
            />
            <ToolBtn
              icon={<LayoutGrid size={12} />}
              label="Two-Column Grid"
              onClick={() => {
                const c1 = nanoid(8); const c2 = nanoid(8);
                insert({
                  id: nanoid(10), type: 'columns',
                  columns: [
                    { id: c1, width: 1, blocks: [{ id: nanoid(10), type: 'text', content: 'Left column', align: 'left' }] },
                    { id: c2, width: 1, blocks: [{ id: nanoid(10), type: 'text', content: 'Right column', align: 'left' }] },
                  ],
                  gap: 'md',
                });
              }}
            />
          </div>
        )}

        {/* Bottom padding */}
        <div className="h-4" />
      </div>
    </div>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`px-2 pt-1.5 pb-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest ${className}`}>
      {children}
    </p>
  );
}

function AccordionHeader({
  children, open, onToggle, className = '',
}: {
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-700 hover:bg-slate-50 transition-colors ${className}`}
    >
      {open ? <ChevronDown size={10} className="flex-shrink-0" /> : <ChevronRight size={10} className="flex-shrink-0" />}
      <span>{children}</span>
    </button>
  );
}

function ToolBtn({
  icon, label, onClick, primary = false, accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  accent?: string;
}) {
  const accentClasses: Record<string, string> = {
    blue:   'text-blue-600 hover:bg-blue-50',
    amber:  'text-amber-600 hover:bg-amber-50',
    red:    'text-red-600 hover:bg-red-50',
    green:  'text-green-600 hover:bg-green-50',
    orange: 'text-violet-700 hover:bg-violet-50',
    yellow: 'text-yellow-700 hover:bg-yellow-50',
  };
  const accentCls = accent ? accentClasses[accent] ?? '' : '';

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors text-left ${
        primary
          ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
          : accentCls
          ? `text-slate-600 ${accentCls}`
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      <span className={`flex-shrink-0 ${primary ? 'text-primary' : accentCls ? '' : 'text-slate-400'}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
