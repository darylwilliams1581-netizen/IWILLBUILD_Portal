/**
 * Smart Document Builder — Block Library Sidebar
 * ─────────────────────────────────────────────────────────────────────────────
 * Left panel: categorised list of insertable blocks. Click to append to canvas.
 */

import { useState } from 'react';
import {
  Type, AlignLeft, Heading, Minus, Space, FileText, Columns,
  AlertTriangle, ShieldCheck, Shield, Table, Image, Hash, Calendar,
  ToggleLeft, CheckSquare, Circle, List, Camera, PenLine, MapPin,
  SlidersHorizontal, Star, Upload, Zap, Briefcase, User, Building2,
  Truck, ChevronDown, ChevronRight, FileUp, BarChart2, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDocumentStore, newId } from './useDocumentStore';
import type { DocumentBlock } from './types';

interface BlockDef {
  type: string;
  label: string;
  icon: React.ElementType;
  description: string;
  factory: () => DocumentBlock;
}

interface BlockGroup {
  label: string;
  icon: React.ElementType;
  blocks: BlockDef[];
}

const BLOCK_GROUPS: BlockGroup[] = [
  {
    label: 'Safety',
    icon: Shield,
    blocks: [
      {
        type: 'image', label: 'PPE Banner', icon: ShieldCheck, description: 'Full PPE required — icon strip image, single block',
        factory: () => ({
          id: newId(), type: 'image',
          src: '/airo-assets/images/safety-badges/ppe-banner-strip',
          alt: 'PPE Required — Personal Protective Equipment',
          size: 'full', align: 'center', preserveAspectRatio: true,
        }),
      },
      {
        type: 'risk_matrix_banner', label: 'Risk Matrix Banner', icon: BarChart2, description: 'Compact risk level strip — drop at top of any document',
        factory: () => ({ id: newId(), type: 'risk_matrix_banner' }),
      },
      {
        type: 'risk_matrix', label: 'Risk Assessment', icon: BarChart2, description: 'AS/NZS risk matrix — likelihood, level & degree of risk',
        factory: () => ({
          id: newId(), type: 'risk_matrix',
          title: 'Risk Assessment Matrix',
          showLegend: true,
          showOnExport: true,
        }),
      },
      {
        type: 'banner', label: 'First Aid Banner', icon: ShieldCheck, description: 'Red cross first aid header — single block',
        factory: () => ({
          id: newId(), type: 'banner', variant: 'first_aid',
          title: 'FIRST AID',
          body: 'IN AN EMERGENCY CALL 000',
          size: 'standard', align: 'left', showOnExport: true,
        }),
      },
      {
        type: 'banner', label: 'Safety First Banner', icon: Shield, description: 'Hazard-stripe safety poster',
        factory: () => ({
          id: newId(), type: 'banner', variant: 'safety_first',
          title: 'SAFETY FIRST',
          body: 'ARRIVE SAFE • WORK SAFE • GO HOME SAFE',
          size: 'standard', align: 'center', showOnExport: true,
        }),
      },
      {
        type: 'safety_badge_row', label: 'PPE Required', icon: ShieldCheck, description: 'Full PPE required — all 9 standard badges, single block',
        factory: () => ({
          id: newId(), type: 'safety_badge_row', size: 'md', align: 'center',
          badges: [
            { id: newId(), badgeType: 'helmet',            label: 'Safety Helmet',      required: true },
            { id: newId(), badgeType: 'hi_vis',            label: 'Hi-Vis Clothing',    required: true },
            { id: newId(), badgeType: 'footwear',          label: 'Safety Footwear',    required: true },
            { id: newId(), badgeType: 'eye_protection',    label: 'Eye Protection',     required: true },
            { id: newId(), badgeType: 'gloves',            label: 'Gloves',             required: true },
            { id: newId(), badgeType: 'hearing',           label: 'Hearing Protection', required: true },
            { id: newId(), badgeType: 'fall_arrest',       label: 'Fall Arrest',        required: true },
            { id: newId(), badgeType: 'ppe',               label: 'PPE',                required: true },
            { id: newId(), badgeType: 'electrical_gloves', label: 'Electrical Gloves',  required: true },
          ],
        }),
      },
      {
        type: 'safety_badge_row', label: 'Safety Badges', icon: ShieldCheck, description: 'Custom PPE badge row — pick your own',
        factory: () => ({
          id: newId(), type: 'safety_badge_row', size: 'md', align: 'left',
          badges: [
            { id: newId(), badgeType: 'helmet', label: 'Safety Helmet', required: true },
            { id: newId(), badgeType: 'hi_vis', label: 'Hi-Vis Clothing', required: true },
          ],
        }),
      },
    ],
  },
  {
    label: 'Text & Content',
    icon: Type,
    blocks: [
      {
        type: 'heading', label: 'Heading', icon: Heading, description: 'H1–H4 title',
        factory: () => ({ id: newId(), type: 'heading', content: 'Heading', level: 2, align: 'left' }),
      },
      {
        type: 'text', label: 'Text', icon: Type, description: 'Simple paragraph',
        factory: () => ({ id: newId(), type: 'text', content: 'Enter text here...', align: 'left' }),
      },
      {
        type: 'rich_text', label: 'Rich Text', icon: AlignLeft, description: 'Formatted content area',
        factory: () => ({ id: newId(), type: 'rich_text', html: '<p>Enter rich text here...</p>' }),
      },
      {
        type: 'divider', label: 'Divider', icon: Minus, description: 'Horizontal rule',
        factory: () => ({ id: newId(), type: 'divider', style: 'solid', thickness: 1 }),
      },
      {
        type: 'spacer', label: 'Spacer', icon: Space, description: 'Vertical gap',
        factory: () => ({ id: newId(), type: 'spacer', height: 24 }),
      },
      {
        type: 'page_break', label: 'Page Break', icon: FileText, description: 'Force new page on export',
        factory: () => ({ id: newId(), type: 'page_break' }),
      },
    ],
  },
  {
    label: 'Layout & Media',
    icon: Columns,
    blocks: [
      {
        type: 'columns', label: 'Columns', icon: Columns, description: '2-column layout',
        factory: () => ({
          id: newId(), type: 'columns', gap: 'md',
          columns: [
            { id: newId(), width: 1, blocks: [] },
            { id: newId(), width: 1, blocks: [] },
          ],
        }),
      },
      {
        type: 'banner', label: 'Banner', icon: AlertTriangle, description: 'Callout / alert box',
        factory: () => ({
          id: newId(), type: 'banner', variant: 'info', title: 'Important Notice',
          body: 'Enter banner content here.', size: 'standard', align: 'left', showOnExport: true,
        }),
      },
      {
        type: 'banner', label: 'Image Banner', icon: Image, description: 'Upload any image as a full-width banner',
        factory: () => ({
          id: newId(), type: 'banner', variant: 'image_banner',
          title: '', body: '', size: 'standard', align: 'left', showOnExport: true,
        }),
      },
      {
        type: 'risk_matrix', label: 'Risk Matrix', icon: BarChart2, description: '5×5 AS/NZS risk rating matrix',
        factory: () => ({
          id: newId(), type: 'risk_matrix',
          title: 'Risk Assessment Matrix',
          showLegend: true,
          showOnExport: true,
        }),
      },
      {
        type: 'table', label: 'Table', icon: Table, description: 'Static or fillable table',
        factory: () => {
          const col1 = newId(); const col2 = newId(); const col3 = newId();
          return {
            id: newId(), type: 'table', mode: 'static', stripedRows: true,
            columns: [
              { id: col1, header: 'Column 1', cellType: 'text', width: 1 },
              { id: col2, header: 'Column 2', cellType: 'text', width: 1 },
              { id: col3, header: 'Column 3', cellType: 'text', width: 1 },
            ],
            rows: [
              { id: newId(), cells: { [col1]: '', [col2]: '', [col3]: '' } },
              { id: newId(), cells: { [col1]: '', [col2]: '', [col3]: '' } },
            ],
          };
        },
      },
      {
        type: 'image', label: 'Image', icon: Image, description: 'Upload or embed image',
        factory: () => ({ id: newId(), type: 'image', src: '', alt: '', size: 'medium', align: 'center', preserveAspectRatio: true }),
      },
    ],
  },
  {
    label: 'Form Fields',
    icon: CheckSquare,
    blocks: [
      { type: 'field_short_text',   label: 'Short Text',       icon: Type,             description: 'Single-line text input',   factory: () => ({ id: newId(), type: 'field', fieldType: 'short_text',   label: 'Short Text',   required: false }) },
      { type: 'field_long_text',    label: 'Long Text',        icon: AlignLeft,        description: 'Multi-line text area',     factory: () => ({ id: newId(), type: 'field', fieldType: 'long_text',    label: 'Long Text',    required: false }) },
      { type: 'field_rich_text',    label: 'Rich Text Response', icon: AlignLeft,      description: 'Formatted response field', factory: () => ({ id: newId(), type: 'field', fieldType: 'rich_text_response', label: 'Rich Text Response', required: false }) },
      { type: 'field_number',       label: 'Number',           icon: Hash,             description: 'Numeric input',            factory: () => ({ id: newId(), type: 'field', fieldType: 'number',       label: 'Number',       required: false }) },
      { type: 'field_date',         label: 'Date',             icon: Calendar,         description: 'Date picker',              factory: () => ({ id: newId(), type: 'field', fieldType: 'date',         label: 'Date',         required: false }) },
      { type: 'field_datetime',     label: 'Date & Time',      icon: Calendar,         description: 'Date and time picker',     factory: () => ({ id: newId(), type: 'field', fieldType: 'datetime',     label: 'Date & Time',  required: false }) },
      { type: 'field_yes_no',       label: 'Yes / No',         icon: ToggleLeft,       description: 'Yes/No toggle',            factory: () => ({ id: newId(), type: 'field', fieldType: 'yes_no',       label: 'Yes / No',     required: false }) },
      { type: 'field_checkbox',     label: 'Checkbox',         icon: CheckSquare,      description: 'Single checkbox',          factory: () => ({ id: newId(), type: 'field', fieldType: 'checkbox',     label: 'Checkbox',     required: false }) },
      { type: 'field_single_choice', label: 'Single Choice',  icon: Circle,           description: 'Radio button group',       factory: () => ({ id: newId(), type: 'field', fieldType: 'single_choice', label: 'Single Choice', required: false, options: ['Option 1', 'Option 2', 'Option 3'] }) },
      { type: 'field_multi_select', label: 'Multi Select',     icon: List,             description: 'Multiple checkboxes',      factory: () => ({ id: newId(), type: 'field', fieldType: 'multi_select', label: 'Multi Select', required: false, options: ['Option 1', 'Option 2', 'Option 3'] }) },
      { type: 'field_rating',       label: 'Rating',           icon: Star,             description: 'Star rating',              factory: () => ({ id: newId(), type: 'field', fieldType: 'rating',       label: 'Rating',       required: false }) },
      { type: 'field_linear_scale', label: 'Linear Scale',     icon: SlidersHorizontal, description: 'Numeric scale',           factory: () => ({ id: newId(), type: 'field', fieldType: 'linear_scale', label: 'Linear Scale', required: false }) },
      { type: 'field_signature',    label: 'Signature',        icon: PenLine,          description: 'Signature capture',        factory: () => ({ id: newId(), type: 'field', fieldType: 'signature',    label: 'Signature',    required: false }) },
      { type: 'field_photo',        label: 'Photo / Media',    icon: Camera,           description: 'Photo upload',             factory: () => ({ id: newId(), type: 'field', fieldType: 'photo',        label: 'Photo',        required: false }) },
      { type: 'field_file_upload',  label: 'File Upload',      icon: Upload,           description: 'File attachment',          factory: () => ({ id: newId(), type: 'field', fieldType: 'file_upload',  label: 'File Upload',  required: false }) },
      { type: 'field_location',     label: 'Location / GPS',   icon: MapPin,           description: 'GPS location capture',     factory: () => ({ id: newId(), type: 'field', fieldType: 'location',     label: 'Location',     required: false }) },
    ],
  },
  {
    label: 'Auto-fill Fields',
    icon: Zap,
    blocks: [
      { type: 'system_job',      label: 'Job Field',      icon: Briefcase,  description: 'Auto-filled job data',      factory: () => ({ id: newId(), type: 'system_field', fieldKey: 'job_name',         label: 'Job Name',      fallback: '[Job Name]',      showLabel: true }) },
      { type: 'system_customer', label: 'Customer Field', icon: User,       description: 'Auto-filled customer data', factory: () => ({ id: newId(), type: 'system_field', fieldKey: 'customer_name',    label: 'Customer Name', fallback: '[Customer Name]', showLabel: true }) },
      { type: 'system_company',  label: 'Company Field',  icon: Building2,  description: 'Auto-filled company data',  factory: () => ({ id: newId(), type: 'system_field', fieldKey: 'company_name',     label: 'Company Name',  fallback: '[Company Name]',  showLabel: true }) },
      { type: 'system_worker',   label: 'Worker Field',   icon: User,       description: 'Auto-filled worker data',   factory: () => ({ id: newId(), type: 'system_field', fieldKey: 'current_user_name', label: 'User Name',    fallback: '[User Name]',     showLabel: true }) },
      { type: 'system_asset',    label: 'Asset Field',    icon: Truck,      description: 'Auto-filled asset data',    factory: () => ({ id: newId(), type: 'system_field', fieldKey: 'asset_name',       label: 'Asset Name',    fallback: '[Asset Name]',    showLabel: true }) },
    ],
  },
];

interface Props {
  onImportDocx: () => void;
  onImportBlocksJson?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function BlockLibrarySidebar({ onImportDocx, onImportBlocksJson, collapsed = false, onToggleCollapse }: Props) {
  const { addBlock, mode } = useDocumentStore();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['Text & Content', 'Layout & Media', 'Form Fields']));
  const [search, setSearch] = useState('');

  if (mode !== 'edit') return null;

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const filteredGroups = search.trim()
    ? BLOCK_GROUPS.map((g) => ({
        ...g,
        blocks: g.blocks.filter(
          (b) =>
            b.label.toLowerCase().includes(search.toLowerCase()) ||
            b.description.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((g) => g.blocks.length > 0)
    : BLOCK_GROUPS;

  return (
    <div className="relative flex-shrink-0 flex">
      {/* Collapsed strip — just the toggle button */}
      {collapsed && (
        <div className="w-8 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col items-center pt-3 gap-2">
          <button
            onClick={onToggleCollapse}
            title="Expand block library"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors"
          >
            <PanelLeftOpen size={14} />
          </button>
        </div>
      )}

      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.aside
            key="left-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 224, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden"
            style={{ width: 224 }}
          >
            {/* Header */}
            <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">Blocks</p>
              <button
                onClick={onToggleCollapse}
                title="Collapse block library"
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <PanelLeftClose size={13} />
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-slate-100">
              <input
                type="text"
                placeholder="Search blocks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60"
              />
            </div>

            {/* Import buttons */}
            <div className="px-3 py-2 border-b border-slate-100 flex flex-col gap-1.5">
              <button
                onClick={onImportDocx}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-primary text-xs font-semibold hover:bg-orange-100 transition-colors"
              >
                <FileUp size={13} />
                Import DOCX / PDF
              </button>

            </div>

            {/* Block groups */}
            <div className="flex-1 overflow-y-auto py-1">
              {filteredGroups.map((group) => {
                const isOpen = search.trim() ? true : openGroups.has(group.label);
                const GroupIcon = group.icon;
                return (
                  <div key={group.label}>
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider hover:bg-slate-50 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <GroupIcon size={11} />
                        {group.label}
                      </span>
                      {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>

                    {isOpen && (
                      <div className="pb-1">
                        {group.blocks.map((blockDef) => {
                          const Icon = blockDef.icon;
                          return (
                            <button
                              key={blockDef.type}
                              onClick={() => addBlock(blockDef.factory())}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-orange-50 hover:text-primary transition-colors group"
                            >
                              <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-100 group-hover:border-orange-200 transition-colors">
                                <Icon size={13} className="text-slate-500 group-hover:text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-700 group-hover:text-primary truncate">{blockDef.label}</p>
                                <p className="text-[10px] text-slate-500 truncate">{blockDef.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
