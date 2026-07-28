/**
 * Studio Builder — Block Inspector (Right Panel)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows settings for the currently selected block. When nothing is selected,
 * shows document-level settings (page layout, theme).
 * Each block has two tabs: Settings and Logic.
 */

import { useState, useRef } from 'react';
import{useAuthImage,isInternalSrc}from'./useAuthImage';
import { Settings, Zap, X, Plus, Trash2, Upload, Loader2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDocumentStore, newId } from './useDocumentStore';
import { SYSTEM_FIELDS, SYSTEM_FIELD_GROUPS } from './systemFields';
import LogicPanel from './LogicPanel';
import type {
  DocumentBlock, HeadingBlock, TextBlock, RichTextBlock, DividerBlock,
  SpacerBlock, BannerBlock, SafetyBadgeRowBlock, RiskMatrixBlock, TableBlock, ImageBlock,
  FieldBlock, SystemFieldBlock, SafetyBadgeType, BannerVariant,
  InspectorTab,
} from './types';

const inp = 'w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors';
const sel = `${inp} appearance-none`;
const lbl = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1';

interface InspectorProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function AuthImg({src,alt,cls}:{src:string;alt:string;cls:string}){
  const na=isInternalSrc(src);
  const{blobUrl,loading}=useAuthImage(na?src:undefined);
  const ds=na?blobUrl:src;
  if(na&&loading)return<div className={cls+' flex items-center justify-center bg-slate-50'}><div className='w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin'/></div>;
  if(!ds)return null;
  return<img src={ds} alt={alt} className={cls}/>;
}

export default function BlockInspector({ collapsed = false, onToggleCollapse }: InspectorProps) {
  const {
    blocks, selection, deselect, getRulesForBlock,
  } = useDocumentStore();

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('settings');

  const selectedBlock = selection.blockId
    ? findBlock(blocks, selection.blockId)
    : null;

  const innerContent = selectedBlock
    ? <SelectedBlockPanel block={selectedBlock} inspectorTab={inspectorTab} setInspectorTab={setInspectorTab} deselect={deselect} getRulesForBlock={getRulesForBlock} />
    : <DocumentInspectorPanel />;

  return (
    <div className="relative flex-shrink-0 flex">
      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.aside
            key="right-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden"
            style={{ width: 256 }}
          >
            {/* Collapse toggle in header area */}
            <div className="absolute top-2 left-2 z-10">
              <button
                onClick={onToggleCollapse}
                title="Collapse inspector"
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <PanelRightClose size={13} />
              </button>
            </div>
            {innerContent}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Collapsed strip */}
      {collapsed && (
        <div className="w-8 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col items-center pt-3 gap-2">
          <button
            onClick={onToggleCollapse}
            title="Expand inspector"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-primary hover:bg-violet-50 transition-colors"
          >
            <PanelRightOpen size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Selected block panel (inner content) ─────────────────────────────────────

interface SelectedBlockPanelProps {
  block: DocumentBlock;
  inspectorTab: InspectorTab;
  setInspectorTab: (t: InspectorTab) => void;
  deselect: () => void;
  getRulesForBlock: (id: string) => unknown[];
}

function SelectedBlockPanel({ block, inspectorTab, setInspectorTab, deselect, getRulesForBlock }: SelectedBlockPanelProps) {
  const ruleCount = getRulesForBlock(block.id).length;
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 pl-9">
        <span className="text-xs font-bold text-slate-600 capitalize">
          {block.type.replace(/_/g, ' ')}
        </span>
        <button onClick={deselect} className="text-slate-300 hover:text-slate-500 transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Tab bar: Settings | Logic */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        <button
          onClick={() => setInspectorTab('settings')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-colors border-b-2 ${
            inspectorTab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          <Settings size={11} /> Settings
        </button>
        <button
          onClick={() => setInspectorTab('logic')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-colors border-b-2 ${
            inspectorTab === 'logic'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          <Zap size={11} /> Logic
          {ruleCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold leading-none">
              {ruleCount}
            </span>
          )}
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto p-3">
        {inspectorTab === 'settings' ? (
          <div className="flex flex-col gap-4">
            <BlockSpecificSettings block={block} />
            <CommonBlockSettings block={block} />
          </div>
        ) : (
          <LogicPanel blockId={block.id} />
        )}
      </div>
    </>
  );
}

// ── Document-level inspector (no selection) ───────────────────────────────────

function DocumentInspectorPanel() {
  const { pageLayout, theme, setPageLayout, setTheme, templateName, setTemplateName, templateType, setTemplateType } = useDocumentStore();
  const [tab, setTab] = useState<'layout' | 'theme'>('layout');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex border-b border-slate-100 pl-8">
        {(['layout', 'theme'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-slate-600 hover:text-slate-800'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {tab === 'layout' ? (
          <>
            <Section title="Document">
              <label className={lbl}>Name</label>
              <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={inp} />
              <label className={`${lbl} mt-2`}>Type</label>
              <select value={templateType} onChange={(e) => setTemplateType(e.target.value as never)} className={sel}>
                {['document','swms','policy','toolbox_talk','pre_start','inspection','register','completion_report'].map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </Section>
            <Section title="Page">
              <label className={lbl}>Paper Size</label>
              <select value={pageLayout.paperSize} onChange={(e) => setPageLayout({ paperSize: e.target.value as never })} className={sel}>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
              <label className={`${lbl} mt-2`}>Orientation</label>
              <select value={pageLayout.orientation} onChange={(e) => setPageLayout({ orientation: e.target.value as never })} className={sel}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
              <label className={`${lbl} mt-2`}>Margins</label>
              <select value={pageLayout.margins} onChange={(e) => setPageLayout({ margins: e.target.value as never })} className={sel}>
                <option value="none">None</option>
                <option value="narrow">Narrow</option>
                <option value="standard">Standard</option>
                <option value="wide">Wide</option>
              </select>
            </Section>
          </>
        ) : (
          <Section title="Colours">
            {[
              { key: 'backgroundColor', label: 'Page Background' },
              { key: 'accentColor', label: 'Accent Colour' },
              { key: 'textColor', label: 'Text Colour' },
              { key: 'tableHeaderColor', label: 'Table Header BG' },
              { key: 'tableHeaderTextColor', label: 'Table Header Text' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-600">{label}</label>
                <input
                  type="color"
                  value={(theme as Record<string, string>)[key] ?? '#000000'}
                  onChange={(e) => setTheme({ [key]: e.target.value })}
                  className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5"
                />
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Block-specific settings ───────────────────────────────────────────────────

function BlockSpecificSettings({ block }: { block: DocumentBlock }) {
  const { updateBlock } = useDocumentStore();
  const upd = (patch: Partial<DocumentBlock>) => updateBlock(block.id, patch);

  switch (block.type) {
    case 'heading':
      return (
        <Section title="Heading">
          <label className={lbl}>Level</label>
          <select value={block.level} onChange={(e) => upd({ level: Number(e.target.value) as HeadingBlock['level'] })} className={sel}>
            {[1,2,3,4].map((l) => <option key={l} value={l}>H{l}</option>)}
          </select>
          <label className={`${lbl} mt-2`}>Align</label>
          <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
          <label className={`${lbl} mt-2`}>Colour</label>
          <input type="color" value={block.color ?? '#1e293b'} onChange={(e) => upd({ color: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5" />
        </Section>
      );

    case 'text':
      return (
        <Section title="Text">
          <label className={lbl}>Align</label>
          <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
          <label className={`${lbl} mt-2`}>Font Size</label>
          <select value={block.fontSize ?? 'base'} onChange={(e) => upd({ fontSize: e.target.value as TextBlock['fontSize'] })} className={sel}>
            <option value="xs">Extra Small</option>
            <option value="sm">Small</option>
            <option value="base">Normal</option>
            <option value="lg">Large</option>
          </select>
          <div className="flex gap-2 mt-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={!!block.bold} onChange={(e) => upd({ bold: e.target.checked })} className="accent-primary" />
              Bold
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={!!block.italic} onChange={(e) => upd({ italic: e.target.checked })} className="accent-primary" />
              Italic
            </label>
          </div>
          <label className={`${lbl} mt-2`}>Colour</label>
          <input type="color" value={block.color ?? '#1e293b'} onChange={(e) => upd({ color: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5" />
        </Section>
      );

    case 'divider':
      return (
        <Section title="Divider">
          <label className={lbl}>Style</label>
          <select value={block.style} onChange={(e) => upd({ style: e.target.value as DividerBlock['style'] })} className={sel}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
          <label className={`${lbl} mt-2`}>Thickness</label>
          <select value={block.thickness ?? 1} onChange={(e) => upd({ thickness: Number(e.target.value) as DividerBlock['thickness'] })} className={sel}>
            <option value={1}>1px</option>
            <option value={2}>2px</option>
            <option value={4}>4px</option>
          </select>
          <label className={`${lbl} mt-2`}>Colour</label>
          <input type="color" value={block.color ?? '#e2e8f0'} onChange={(e) => upd({ color: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5" />
        </Section>
      );

    case 'spacer':
      return (
        <Section title="Spacer">
          <label className={lbl}>Height (px)</label>
          <input type="number" min={4} max={200} value={block.height} onChange={(e) => upd({ height: Number(e.target.value) })} className={inp} />
        </Section>
      );

    case 'banner':
      return <BannerInspector block={block} upd={upd} />;

    case 'image':
      return <ImageInspector block={block} upd={upd} />;

    case 'field':
      return (
        <Section title="Field">
          <label className={lbl}>Label</label>
          <input type="text" value={block.label} onChange={(e) => upd({ label: e.target.value })} className={inp} />
          <label className={`${lbl} mt-2`}>Placeholder</label>
          <input type="text" value={block.placeholder ?? ''} onChange={(e) => upd({ placeholder: e.target.value })} className={inp} />
          <label className={`${lbl} mt-2`}>Help Text</label>
          <input type="text" value={block.helpText ?? ''} onChange={(e) => upd({ helpText: e.target.value })} className={inp} />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mt-2">
            <input type="checkbox" checked={block.required} onChange={(e) => upd({ required: e.target.checked })} className="accent-primary" />
            Required
          </label>
          {(block.fieldType === 'single_choice' || block.fieldType === 'multi_select') && (
            <OptionsEditor options={block.options ?? []} onChange={(opts) => upd({ options: opts })} />
          )}
        </Section>
      );

    case 'system_field':
      return (
        <Section title="System Field">
          <label className={lbl}>Field Key</label>
          <select value={block.fieldKey} onChange={(e) => {
            const sf = SYSTEM_FIELDS.find((f) => f.key === e.target.value);
            upd({ fieldKey: e.target.value, label: sf?.label ?? e.target.value, fallback: sf?.fallback ?? '' });
          }} className={sel}>
            {SYSTEM_FIELD_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {SYSTEM_FIELDS.filter((f) => f.group === group).map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <label className={`${lbl} mt-2`}>Label</label>
          <input type="text" value={block.label} onChange={(e) => upd({ label: e.target.value })} className={inp} />
          <label className={`${lbl} mt-2`}>Fallback</label>
          <input type="text" value={block.fallback} onChange={(e) => upd({ fallback: e.target.value })} className={inp} />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mt-2">
            <input type="checkbox" checked={block.showLabel} onChange={(e) => upd({ showLabel: e.target.checked })} className="accent-primary" />
            Show label
          </label>
        </Section>
      );

    case 'table':
      return (
        <Section title="Table">
          <label className={lbl}>Mode</label>
          <select value={block.mode} onChange={(e) => upd({ mode: e.target.value as TableBlock['mode'] })} className={sel}>
            <option value="static">Static (reference)</option>
            <option value="fillable">Fillable</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mt-2">
            <input type="checkbox" checked={!!block.stripedRows} onChange={(e) => upd({ stripedRows: e.target.checked })} className="accent-primary" />
            Striped rows
          </label>
          {block.mode === 'fillable' && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mt-1">
              <input type="checkbox" checked={!!block.repeatable} onChange={(e) => upd({ repeatable: e.target.checked })} className="accent-primary" />
              Repeatable rows
            </label>
          )}
          <label className={`${lbl} mt-2`}>Header BG</label>
          <input type="color" value={block.headerBgColor ?? '#1e293b'} onChange={(e) => upd({ headerBgColor: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5" />
          <label className={`${lbl} mt-2`}>Header Text</label>
          <input type="color" value={block.headerTextColor ?? '#ffffff'} onChange={(e) => upd({ headerTextColor: e.target.value })} className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5" />
        </Section>
      );

    case 'safety_badge_row':
      return <SafetyBadgeInspector block={block} upd={upd} />;
    case 'risk_matrix':
      return <RiskMatrixInspector block={block} upd={upd} />;

    default:
      return null;
  }
}

// ── Common block settings (background, border, padding) ───────────────────────

function CommonBlockSettings({ block }: { block: DocumentBlock }) {
  const { updateBlock } = useDocumentStore();
  const upd = (patch: Partial<DocumentBlock>) => updateBlock(block.id, patch);

  return (
    <Section title="Block Style">
      <label className={lbl}>Background</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={block.backgroundColor ?? '#ffffff'}
          onChange={(e) => upd({ backgroundColor: e.target.value })}
          className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5"
        />
        <button
          onClick={() => upd({ backgroundColor: undefined })}
          className="text-[10px] text-slate-600 hover:text-slate-800 transition-colors"
        >
          Clear
        </button>
      </div>
      <label className={`${lbl} mt-2`}>Border Colour</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={block.borderColor ?? '#e2e8f0'}
          onChange={(e) => upd({ borderColor: e.target.value })}
          className="w-8 h-7 rounded border border-slate-200 cursor-pointer p-0.5"
        />
        <button
          onClick={() => upd({ borderColor: undefined })}
          className="text-[10px] text-slate-600 hover:text-slate-800 transition-colors"
        >
          Clear
        </button>
      </div>
      <label className={`${lbl} mt-2`}>Padding</label>
      <select value={block.padding ?? ''} onChange={(e) => upd({ padding: (e.target.value || undefined) as never })} className={sel}>
        <option value="">Default</option>
        <option value="none">None</option>
        <option value="sm">Small</option>
        <option value="md">Medium</option>
        <option value="lg">Large</option>
      </select>
    </Section>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function AlignPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {['left','center','right'].map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={`flex-1 py-1 text-[10px] rounded border transition-colors ${value === a ? 'bg-primary text-white border-primary' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
        >
          {a.charAt(0).toUpperCase() + a.slice(1)}
        </button>
      ))}
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  return (
    <div className="mt-2">
      <label className={lbl}>Options</label>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1 mb-1">
          <input
            type="text"
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              onChange(next);
            }}
            className={inp}
          />
          <button onClick={() => onChange(options.filter((_, oi) => oi !== i))} className="text-slate-300 hover:text-red-400 transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
        className="flex items-center gap-1 text-xs text-primary hover:text-violet-700 transition-colors mt-1"
      >
        <Plus size={11} /> Add option
      </button>
    </div>
  );
}

// ── Safety Badge Inspector (per-badge upload + edit) ──────────────────────────

const BADGE_TYPE_OPTIONS: { value: SafetyBadgeType; label: string; emoji: string }[] = [
  { value: 'helmet',            label: 'Safety Helmet',     emoji: '🪖' },
  { value: 'hi_vis',            label: 'Hi-Vis Clothing',   emoji: '🦺' },
  { value: 'ppe',               label: 'PPE',               emoji: '🛡️' },
  { value: 'footwear',          label: 'Safety Footwear',   emoji: '🥾' },
  { value: 'eye_protection',    label: 'Eye Protection',    emoji: '🥽' },
  { value: 'gloves',            label: 'Gloves',            emoji: '🧤' },
  { value: 'electrical_gloves', label: 'Electrical Gloves', emoji: '⚡' },
  { value: 'hearing',           label: 'Hearing Protection',emoji: '🎧' },
  { value: 'fall_arrest',       label: 'Fall Arrest',       emoji: '🪝' },
  { value: 'custom',            label: 'Custom',            emoji: '🛡️' },
];

function BannerInspector({ block, upd }: { block: BannerBlock; upd: (p: Partial<BannerBlock>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
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
      upd({ customImageUrl: src });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="Banner">
      <label className={lbl}>Variant</label>
      <select value={block.variant} onChange={(e) => upd({ variant: e.target.value as BannerVariant })} className={sel}>
        {[
          { value: 'info',          label: 'Info' },
          { value: 'warning',       label: 'Warning' },
          { value: 'danger',        label: 'Danger' },
          { value: 'success',       label: 'Success' },
          { value: 'safety',        label: 'Safety' },
          { value: 'safety_first',  label: 'Safety First (Hazard Stripe)' },
          { value: 'first_aid',     label: 'First Aid' },
          { value: 'image_banner',  label: 'Image Banner' },
          { value: 'custom',        label: 'Custom' },
        ].map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Image upload — only shown for image_banner variant */}
      {block.variant === 'image_banner' && (
        <div className="mt-3 flex flex-col gap-2">
          <label className={lbl}>Image</label>
          {block.customImageUrl && (
            <div className="relative rounded overflow-hidden border border-slate-200">
              <AuthImg src={block.customImageUrl!} alt="Banner" cls="w-full object-contain max-h-24" />
              <button
                onClick={() => upd({ customImageUrl: undefined })}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-black/80"
                title="Remove image"
              >✕</button>
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-50 border border-violet-200 text-primary text-xs font-semibold hover:bg-violet-100 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Uploading…' : block.customImageUrl ? 'Replace image' : 'Upload image'}
          </button>
          {uploadError && <p className="text-[10px] text-red-500">{uploadError}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
          />
        </div>
      )}

      {/* Size / align / export — hidden for image_banner (not relevant) */}
      {block.variant !== 'image_banner' && (
        <>
          <label className={`${lbl} mt-2`}>Size</label>
          <select value={block.size} onChange={(e) => upd({ size: e.target.value as BannerBlock['size'] })} className={sel}>
            <option value="compact">Compact</option>
            <option value="standard">Standard</option>
            <option value="large">Large</option>
          </select>
          <label className={`${lbl} mt-2`}>Align</label>
          <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
        </>
      )}

      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mt-2">
        <input type="checkbox" checked={block.showOnExport} onChange={(e) => upd({ showOnExport: e.target.checked })} className="accent-primary" />
        Show on export
      </label>
    </Section>
  );
}

function RiskMatrixInspector({ block, upd }: { block: RiskMatrixBlock; upd: (p: Partial<RiskMatrixBlock>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={lbl}>Title</label>
        <input
          className={inp}
          value={block.title}
          onChange={(e) => upd({ title: e.target.value })}
          placeholder="Risk Assessment Matrix"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className={lbl} style={{ marginBottom: 0 }}>Show legend</span>
        <button
          onClick={() => upd({ showLegend: !block.showLegend })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${block.showLegend ? 'bg-primary' : 'bg-slate-200'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${block.showLegend ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className={lbl} style={{ marginBottom: 0 }}>Show on export</span>
        <button
          onClick={() => upd({ showOnExport: !block.showOnExport })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${block.showOnExport ? 'bg-primary' : 'bg-slate-200'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${block.showOnExport ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Standard AS/NZS 5×5 risk matrix — Likelihood (A–E) × Consequence (1–5). Cells are colour-coded: green (Low), yellow (Medium), orange (High), red (Extreme).
      </p>
    </div>
  );
}

function SafetyBadgeInspector({ block, upd }: { block: SafetyBadgeRowBlock; upd: (p: Partial<SafetyBadgeRowBlock>) => void }) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateBadge = (id: string, patch: Partial<SafetyBadgeRowBlock['badges'][number]>) => {
    upd({ badges: block.badges.map((b) => b.id === id ? { ...b, ...patch } : b) });
  };

  const handleUpload = async (badgeId: string, file: File) => {
    setUploadingId(badgeId);
    setUploadErrors((prev) => ({ ...prev, [badgeId]: '' }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', file.name);
      const res = await fetch('/api/files', { method: 'POST', body: fd });
      const data = await res.json() as { file?: { id: number }; error?: string };
      if (!res.ok || !data.file?.id) throw new Error(data.error ?? 'Upload failed');
      const parts = ['/api/files', String(data.file.id), 'download'].join('/');
      updateBadge(badgeId, { customImageUrl: parts + '?inline=1', badgeType: 'custom' });
    } catch (err) {
      setUploadErrors((prev) => ({ ...prev, [badgeId]: err instanceof Error ? err.message : 'Upload failed' }));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <>
      <Section title="Row Settings">
        <label className={lbl}>Size</label>
        <select value={block.size} onChange={(e) => upd({ size: e.target.value as SafetyBadgeRowBlock['size'] })} className={sel}>
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
        <label className={`${lbl} mt-2`}>Align</label>
        <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
      </Section>

      <Section title="Badges">
        <div className="flex flex-col gap-3">
          {block.badges.map((badge) => (
            <div key={badge.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 flex flex-col gap-2">
              {/* Thumbnail + upload */}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {badge.customImageUrl ? (
                    <AuthImg src={badge.customImageUrl!} alt={badge.label} cls="w-full h-full object-contain p-0.5" />
                  ) : (
                    <span className="text-xl">{BADGE_TYPE_OPTIONS.find((o) => o.value === badge.badgeType)?.emoji ?? '🛡️'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => fileRefs.current[badge.id]?.click()}
                    disabled={uploadingId === badge.id}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-primary text-[10px] font-semibold hover:bg-violet-100 disabled:opacity-50 transition-colors"
                  >
                    {uploadingId === badge.id
                      ? <><Loader2 size={10} className="animate-spin" /> Uploading...</>
                      : <><Upload size={10} /> {badge.customImageUrl ? 'Replace image' : 'Upload image'}</>
                    }
                  </button>
                  {badge.customImageUrl && (
                    <button
                      onClick={() => updateBadge(badge.id, { customImageUrl: undefined })}
                      className="w-full text-[9px] text-slate-400 hover:text-red-400 transition-colors mt-0.5 text-center"
                    >
                      Remove image
                    </button>
                  )}
                </div>
                <input
                  ref={(el) => { fileRefs.current[badge.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(badge.id, f); e.target.value = ''; }}
                />
                <button
                  onClick={() => upd({ badges: block.badges.filter((b) => b.id !== badge.id) })}
                  className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {uploadErrors[badge.id] && (
                <p className="text-[9px] text-red-500">{uploadErrors[badge.id]}</p>
              )}

              {/* Label */}
              <input
                type="text"
                value={badge.label}
                onChange={(e) => updateBadge(badge.id, { label: e.target.value })}
                placeholder="Badge label"
                className={inp}
              />

              {/* Type (only shown when no custom image) */}
              {!badge.customImageUrl && (
                <>
                  <label className={lbl}>Icon type</label>
                  <select
                    value={badge.badgeType}
                    onChange={(e) => updateBadge(badge.id, { badgeType: e.target.value as SafetyBadgeType })}
                    className={sel}
                  >
                    {BADGE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>
                    ))}
                  </select>
                </>
              )}

              {/* Required toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={badge.required}
                  onChange={(e) => updateBadge(badge.id, { required: e.target.checked })}
                  className="w-3.5 h-3.5 rounded accent-violet-600"
                />
                <span className="text-[10px] text-slate-600 font-medium">Mark as required</span>
              </label>
            </div>
          ))}

          <button
            onClick={() => upd({
              badges: [...block.badges, { id: newId(), badgeType: 'ppe' as SafetyBadgeType, label: 'New Badge', required: false }]
            })}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 hover:border-primary hover:text-primary hover:bg-violet-50 transition-colors"
          >
            <Plus size={11} /> Add badge
          </button>
        </div>
      </Section>
    </>
  );
}

// ── Image Inspector (with file upload) ────────────────────────────────────────

function ImageInspector({ block, upd }: { block: ImageBlock; upd: (p: Partial<ImageBlock>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', file.name);
      const res = await fetch('/api/files', { method: 'POST', body: fd });
      const data = await res.json() as { file?: { id: number }; error?: string };
      if (!res.ok || !data.file?.id) throw new Error(data.error ?? 'Upload failed');
      // Build the inline-serve path from parts so it resolves at runtime
      const parts = ['/api/files', String(data.file.id), 'download'].join('/');
      upd({ src: parts + '?inline=1', alt: block.alt || file.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="Image">
      {/* Upload button */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-50 border border-violet-200 text-primary text-xs font-semibold hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-2"
      >
        {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading...</> : <><Upload size={12} /> Upload Image</>}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
      />
      {uploadError && (
        <p className="text-[10px] text-red-500 mb-2">{uploadError}</p>
      )}

      {/* Or paste a URL */}
      <label className={lbl}>Or paste image URL</label>
      <input
        type="text"
        value={block.src}
        onChange={(e) => upd({ src: e.target.value })}
        placeholder="https://..."
        className={inp}
      />

      {/* Preview thumbnail */}
      {block.src && (
        <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center h-20">
          <AuthImg src={block.src} alt="" cls="max-h-full max-w-full object-contain" />
        </div>
      )}

      <label className={`${lbl} mt-2`}>Alt Text</label>
      <input type="text" value={block.alt} onChange={(e) => upd({ alt: e.target.value })} className={inp} />
      <label className={`${lbl} mt-2`}>Caption</label>
      <input type="text" value={block.caption ?? ''} onChange={(e) => upd({ caption: e.target.value })} className={inp} />

      {/* Size — button pickers */}
      <label className={`${lbl} mt-2`}>Size</label>
      <div className="grid grid-cols-2 gap-1">
        {([['small','Small (200px)'],['medium','Medium (400px)'],['large','Large (600px)'],['full','Full Width']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => upd({ size: val })}
            className={`py-1.5 rounded text-[10px] font-semibold transition-colors ${
              block.size === val
                ? 'bg-primary text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Align */}
      <label className={`${lbl} mt-2`}>Align</label>
      <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
    </Section>
  );
}

// ── Find block in tree (including inside columns) ─────────────────────────────

function findBlock(blocks: DocumentBlock[], id: string): DocumentBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === 'columns') {
      for (const col of b.columns) {
        const found = findBlock(col.blocks, id);
        if (found) return found;
      }
    }
  }
  return null;
}
