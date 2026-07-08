/**
 * AnnotationToolbar — floating tool palette for the Plan Manager viewer.
 * Tools: select, pan, line, arrow, rect, circle, freehand, text, highlight, stamp, dimension.
 * Style controls: color, stroke width, opacity.
 */
import React, { useState } from 'react';
import {
  MousePointer2, Hand, Minus, ArrowRight, Square, Circle,
  PenLine, Type, Highlighter, Stamp, Ruler,
  ChevronDown, Undo2,
} from 'lucide-react';
import type { ToolType, AnnotationStyle, StampTemplate } from './types';

interface Props {
  activeTool: ToolType;
  activeStyle: AnnotationStyle;
  isLocked: boolean;
  canUndo: boolean;
  onToolChange: (tool: ToolType) => void;
  onStyleChange: (style: Partial<AnnotationStyle>) => void;
  onUndo: () => void;
}

const TOOLS: { tool: ToolType; icon: React.ElementType; label: string; group: 'nav' | 'draw' }[] = [
  { tool: 'select',    icon: MousePointer2, label: 'Select',     group: 'nav' },
  { tool: 'pan',       icon: Hand,          label: 'Pan',        group: 'nav' },
  { tool: 'line',      icon: Minus,         label: 'Line',       group: 'draw' },
  { tool: 'arrow',     icon: ArrowRight,    label: 'Arrow',      group: 'draw' },
  { tool: 'rect',      icon: Square,        label: 'Rectangle',  group: 'draw' },
  { tool: 'circle',    icon: Circle,        label: 'Circle',     group: 'draw' },
  { tool: 'freehand',  icon: PenLine,       label: 'Freehand',   group: 'draw' },
  { tool: 'highlight', icon: Highlighter,   label: 'Highlight',  group: 'draw' },
  { tool: 'text',      icon: Type,          label: 'Text',       group: 'draw' },
  { tool: 'dimension', icon: Ruler,         label: 'Dimension',  group: 'draw' },
  { tool: 'stamp',     icon: Stamp,         label: 'Stamp',      group: 'draw' },
];

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#000000', '#ffffff'];

const STAMP_TEMPLATES: { value: StampTemplate; label: string }[] = [
  { value: 'AS_CONSTRUCTED', label: 'As Constructed' },
  { value: 'DATE',           label: 'Date' },
  { value: 'NAME',           label: 'Name' },
  { value: 'SIGN',           label: 'Sign Here' },
  { value: 'CHANGES_NOTE',   label: 'Changes Note' },
];

export default function AnnotationToolbar({ activeTool, activeStyle, isLocked, canUndo, onToolChange, onStyleChange, onUndo }: Props) {
  const [showStampMenu, setShowStampMenu] = useState(false);

  return (
    <div className="flex flex-col gap-1 bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-xl select-none">
      {/* Undo */}
      <button
        title="Undo (Ctrl+Z)"
        disabled={!canUndo || isLocked}
        onClick={onUndo}
        className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Undo2 size={16} />
      </button>

      <div className="w-full h-px bg-slate-700 my-0.5" />

      {/* Nav tools */}
      <div className="flex flex-col gap-0.5">
        {TOOLS.filter(t => t.group === 'nav').map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            title={label}
            disabled={isLocked && tool !== 'select' && tool !== 'pan'}
            onClick={() => onToolChange(tool)}
            className={[
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
              activeTool === tool
                ? 'bg-orange-500 text-white'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700',
              isLocked && tool !== 'select' && tool !== 'pan' ? 'opacity-30 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      <div className="w-full h-px bg-slate-700 my-0.5" />

      {/* Draw tools */}
      <div className="flex flex-col gap-0.5">
        {TOOLS.filter(t => t.group === 'draw').map(({ tool, icon: Icon, label }) => (
          <div key={tool} className="relative">
            <button
              title={label}
              disabled={isLocked}
              onClick={() => {
                onToolChange(tool);
                if (tool === 'stamp') setShowStampMenu(s => !s);
                else setShowStampMenu(false);
              }}
              className={[
                'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                activeTool === tool
                  ? 'bg-orange-500 text-white'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700',
                isLocked ? 'opacity-30 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <Icon size={16} />
            </button>
            {/* Stamp submenu */}
            {tool === 'stamp' && showStampMenu && (
              <div className="absolute left-full top-0 ml-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[160px]">
                {STAMP_TEMPLATES.map(st => (
                  <button
                    key={st.value}
                    onClick={() => {
                      onStyleChange({ stampTemplate: st.value });
                      setShowStampMenu(false);
                    }}
                    className={[
                      'w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg',
                      activeStyle.stampTemplate === st.value ? 'text-orange-400 font-semibold' : '',
                    ].join(' ')}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="w-full h-px bg-slate-700 my-0.5" />

      {/* Color swatches */}
      <div className="flex flex-col gap-1 px-0.5">
        {COLORS.map(c => (
          <button
            key={c}
            title={c}
            onClick={() => onStyleChange({ color: c })}
            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 mx-auto"
            style={{
              backgroundColor: c,
              borderColor: activeStyle.color === c ? '#f97316' : 'transparent',
              boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #475569' : undefined,
            }}
          />
        ))}
      </div>

      <div className="w-full h-px bg-slate-700 my-0.5" />

      {/* Stroke width */}
      <div className="flex flex-col gap-1 px-1">
        {[1, 2, 4, 6].map(w => (
          <button
            key={w}
            title={`${w}px`}
            onClick={() => onStyleChange({ strokeWidth: w })}
            className={[
              'w-7 h-7 rounded flex items-center justify-center mx-auto transition-colors',
              activeStyle.strokeWidth === w ? 'bg-orange-500/20' : 'hover:bg-slate-700',
            ].join(' ')}
          >
            <div
              className="rounded-full bg-slate-300"
              style={{ width: Math.min(w * 4, 24), height: w }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
