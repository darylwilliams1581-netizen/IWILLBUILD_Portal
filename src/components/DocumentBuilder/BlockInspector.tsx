/**
 * Studio Builder — Block Inspector (Right Panel)
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows settings for the currently selected block. When nothing is selected,
 * shows document-level settings (page layout, theme).
 * Each block has two tabs: Settings and Logic.
 */

import { useState } from 'react';
import { Settings, Zap, X, Plus, Trash2 } from 'lucide-react';
import { useDocumentStore, newId } from './useDocumentStore';
import { SYSTEM_FIELDS, SYSTEM_FIELD_GROUPS } from './systemFields';
import LogicPanel from './LogicPanel';
import type {
  DocumentBlock, HeadingBlock, TextBlock, RichTextBlock, DividerBlock,
  SpacerBlock, BannerBlock, SafetyBadgeRowBlock, TableBlock, ImageBlock,
  FieldBlock, SystemFieldBlock, SafetyBadgeType, BannerVariant,
  InspectorTab,
} from './types';

const inp = 'w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors';
const sel = `${inp} appearance-none`;
const lbl = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1';

export default function BlockInspector() {
  const {
    blocks, selection, deselect, logicRules,
  } = useDocumentStore();

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('settings');

  const selectedBlock = selection.blockId
    ? findBlock(blocks, selection.blockId)
    : null;

  if (!selectedBlock) {
    return <DocumentInspector />;
  }

  // Count rules on this block for the badge
  const ruleCount = logicRules.filter((r) => r.ownerBlockId === selectedBlock.id).length;

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-600 capitalize">
          {selectedBlock.type.replace(/_/g, ' ')}
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
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Settings size={11} /> Settings
        </button>
        <button
          onClick={() => setInspectorTab('logic')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-colors border-b-2 ${
            inspectorTab === 'logic'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-slate-600'
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
            <BlockSpecificSettings block={selectedBlock} />
            <CommonBlockSettings block={selectedBlock} />
          </div>
        ) : (
          <LogicPanel blockId={selectedBlock.id} />
        )}
      </div>
    </aside>
  );
}

// ── Document-level inspector (no selection) ───────────────────────────────────

function DocumentInspector() {
  const { pageLayout, theme, setPageLayout, setTheme, templateName, setTemplateName, templateType, setTemplateType } = useDocumentStore();
  const [tab, setTab] = useState<'layout' | 'theme'>('layout');

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100">
        {(['layout', 'theme'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600'}`}
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
    </aside>
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
      return (
        <Section title="Banner">
          <label className={lbl}>Variant</label>
          <select value={block.variant} onChange={(e) => upd({ variant: e.target.value as BannerVariant })} className={sel}>
            {['info','warning','danger','success','safety','custom'].map((v) => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
          <label className={`${lbl} mt-2`}>Size</label>
          <select value={block.size} onChange={(e) => upd({ size: e.target.value as BannerBlock['size'] })} className={sel}>
            <option value="compact">Compact</option>
            <option value="standard">Standard</option>
            <option value="large">Large</option>
          </select>
          <label className={`${lbl} mt-2`}>Align</label>
          <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mt-2">
            <input type="checkbox" checked={block.showOnExport} onChange={(e) => upd({ showOnExport: e.target.checked })} className="accent-primary" />
            Show on export
          </label>
        </Section>
      );

    case 'image':
      return (
        <Section title="Image">
          <label className={lbl}>Image URL</label>
          <input type="text" value={block.src} onChange={(e) => upd({ src: e.target.value })} placeholder="https://..." className={inp} />
          <label className={`${lbl} mt-2`}>Alt Text</label>
          <input type="text" value={block.alt} onChange={(e) => upd({ alt: e.target.value })} className={inp} />
          <label className={`${lbl} mt-2`}>Caption</label>
          <input type="text" value={block.caption ?? ''} onChange={(e) => upd({ caption: e.target.value })} className={inp} />
          <label className={`${lbl} mt-2`}>Size</label>
          <select value={block.size} onChange={(e) => upd({ size: e.target.value as ImageBlock['size'] })} className={sel}>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="full">Full Width</option>
          </select>
          <label className={`${lbl} mt-2`}>Align</label>
          <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
        </Section>
      );

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
      return (
        <Section title="Safety Badges">
          <label className={lbl}>Size</label>
          <select value={block.size} onChange={(e) => upd({ size: e.target.value as SafetyBadgeRowBlock['size'] })} className={sel}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
          <label className={`${lbl} mt-2`}>Align</label>
          <AlignPicker value={block.align} onChange={(v) => upd({ align: v })} />
          <div className="mt-3 flex flex-col gap-1.5">
            {block.badges.map((badge, i) => (
              <div key={badge.id} className="flex items-center gap-1.5 text-xs">
                <span className="flex-1 truncate text-slate-600">{badge.label}</span>
                <button
                  onClick={() => upd({ badges: block.badges.filter((_, bi) => bi !== i) })}
                  className="text-slate-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
            <button
              onClick={() => upd({
                badges: [...block.badges, { id: newId(), badgeType: 'ppe' as SafetyBadgeType, label: 'PPE', required: false }]
              })}
              className="flex items-center gap-1 text-xs text-primary hover:text-orange-600 transition-colors mt-1"
            >
              <Plus size={11} /> Add badge
            </button>
          </div>
        </Section>
      );

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
          className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
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
          className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
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
        className="flex items-center gap-1 text-xs text-primary hover:text-orange-600 transition-colors mt-1"
      >
        <Plus size={11} /> Add option
      </button>
    </div>
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
