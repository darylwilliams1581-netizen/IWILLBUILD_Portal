/**
 * MobileAnnotationBar — compact horizontal annotation toolbar for phones.
 *
 * Shown only below the sm breakpoint (hidden sm:hidden applied in DrawingViewer).
 * All 11 tools + undo are in a single scrollable row.
 * Colour swatches and stroke-width picker live in a slide-up panel toggled
 * by the palette button on the right end of the bar.
 *
 * Touch drawing still works because pointer-events and touch-action are
 * managed by the PdfViewer canvas, not this bar.
 */
import { useState } from 'react';
import type React from 'react';
import {
  MousePointer2, Hand, Minus, ArrowRight, Square, Circle,
  PenLine, Type, Highlighter, Stamp, Ruler, Undo2, Palette,
  ChevronDown,
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

const TOOLS: { tool: ToolType; icon: React.ElementType; label: string }[] = [
  { tool: 'select',    icon: MousePointer2, label: 'Select'    },
  { tool: 'pan',       icon: Hand,          label: 'Pan'       },
  { tool: 'line',      icon: Minus,         label: 'Line'      },
  { tool: 'arrow',     icon: ArrowRight,    label: 'Arrow'     },
  { tool: 'rect',      icon: Square,        label: 'Rect'      },
  { tool: 'circle',    icon: Circle,        label: 'Circle'    },
  { tool: 'freehand',  icon: PenLine,       label: 'Pen'       },
  { tool: 'highlight', icon: Highlighter,   label: 'Highlight' },
  { tool: 'text',      icon: Type,          label: 'Text'      },
  { tool: 'dimension', icon: Ruler,         label: 'Dimension' },
  { tool: 'stamp',     icon: Stamp,         label: 'Stamp'     },
];

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#7c3aed', '#8b5cf6', '#ec4899',
  '#000000', '#ffffff',
];

const STROKE_WIDTHS = [1, 2, 4, 6];

const STAMP_TEMPLATES: { value: StampTemplate; label: string }[] = [
  { value: 'AS_CONSTRUCTED', label: 'As Constructed' },
  { value: 'DATE',           label: 'Date'           },
  { value: 'NAME',           label: 'Name'           },
  { value: 'SIGN',           label: 'Sign Here'      },
  { value: 'CHANGES_NOTE',   label: 'Changes Note'   },
];

export default function MobileAnnotationBar({
  activeTool, activeStyle, isLocked, canUndo,
  onToolChange, onStyleChange, onUndo,
}: Props) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);

  function handleToolTap(tool: ToolType) {
    if (tool === 'stamp') {
      onToolChange(tool);
      setStampOpen(s => !s);
      setStyleOpen(false);
    } else {
      onToolChange(tool);
      setStampOpen(false);
    }
  }

  return (
    // Outer wrapper — hidden on sm+ (tablet/desktop uses the left sidebar)
    <div className="sm:hidden flex-shrink-0 bg-slate-900 border-t border-slate-700 select-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
    >
      {/* ── Style panel (slide-up) ─────────────────────────────────────────── */}
      {styleOpen && (
        <div className="px-3 pt-3 pb-2 border-b border-slate-700 bg-slate-800">
          {/* Colour swatches */}
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Colour</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => onStyleChange({ color: c })}
                className="w-8 h-8 rounded-full border-2 transition-transform active:scale-90 flex-shrink-0"
                style={{
                  backgroundColor: c,
                  borderColor: activeStyle.color === c ? '#7c3aed' : 'transparent',
                  boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #475569' : undefined,
                }}
                aria-label={c}
              />
            ))}
          </div>

          {/* Stroke width */}
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Stroke</p>
          <div className="flex items-center gap-2">
            {STROKE_WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => onStyleChange({ strokeWidth: w })}
                className={[
                  'flex items-center justify-center w-10 h-8 rounded-lg transition-colors',
                  activeStyle.strokeWidth === w
                    ? 'bg-violet-500/30 ring-1 ring-violet-500'
                    : 'bg-slate-700 hover:bg-slate-600',
                ].join(' ')}
                aria-label={`${w}px stroke`}
              >
                <div
                  className="rounded-full bg-slate-200"
                  style={{ width: Math.min(w * 5, 28), height: w }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Stamp submenu ─────────────────────────────────────────────────── */}
      {stampOpen && activeTool === 'stamp' && (
        <div className="px-3 pt-2 pb-1 border-b border-slate-700 bg-slate-800 flex flex-wrap gap-1.5">
          {STAMP_TEMPLATES.map(st => (
            <button
              key={st.value}
              onClick={() => { onStyleChange({ stampTemplate: st.value }); setStampOpen(false); }}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                activeStyle.stampTemplate === st.value
                  ? 'bg-violet-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
              ].join(' ')}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Main tool row ─────────────────────────────────────────────────── */}
      <div className="flex items-center pt-1">
        {/* Scrollable tool buttons */}
        <div
          className="flex items-center gap-0.5 px-1 overflow-x-auto flex-1 min-w-0"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Undo */}
          <ToolBtn
            icon={Undo2}
            label="Undo"
            disabled={!canUndo || isLocked}
            onClick={onUndo}
          />

          {/* Divider */}
          <div className="w-px h-6 bg-slate-700 mx-1 flex-shrink-0" />

          {/* All tools */}
          {TOOLS.map(({ tool, icon, label }) => (
            <ToolBtn
              key={tool}
              icon={icon}
              label={label}
              active={activeTool === tool}
              disabled={isLocked && tool !== 'select' && tool !== 'pan'}
              onClick={() => handleToolTap(tool)}
              dot={tool === 'stamp' && activeTool === 'stamp' && stampOpen ? undefined : undefined}
            />
          ))}
        </div>

        {/* Palette toggle — fixed right */}
        <div className="flex-shrink-0 pl-1 pr-2 border-l border-slate-700 ml-1">
          <button
            onClick={() => { setStyleOpen(s => !s); setStampOpen(false); }}
            className={[
              'flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-colors gap-0.5',
              styleOpen
                ? 'bg-violet-500/20 ring-1 ring-violet-500'
                : 'hover:bg-slate-700',
            ].join(' ')}
            aria-label="Colour & stroke"
          >
            {/* Active colour dot */}
            <div
              className="w-4 h-4 rounded-full border border-slate-500 flex-shrink-0"
              style={{
                backgroundColor: activeStyle.color,
                boxShadow: activeStyle.color === '#ffffff' ? 'inset 0 0 0 1px #475569' : undefined,
              }}
            />
            <ChevronDown
              size={10}
              className={['text-slate-400 transition-transform', styleOpen ? 'rotate-180' : ''].join(' ')}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small helper ─────────────────────────────────────────────────────────────

function ToolBtn({
  icon: Icon, label, active, disabled, onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  dot?: boolean;
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex flex-col items-center justify-center gap-0.5 w-11 h-11 rounded-xl flex-shrink-0 transition-colors',
        active
          ? 'bg-violet-500 text-white'
          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700 active:bg-slate-600',
        disabled ? 'opacity-30 pointer-events-none' : '',
      ].join(' ')}
    >
      <Icon size={17} />
      <span className="text-[8px] font-semibold leading-none tracking-tight">{label}</span>
    </button>
  );
}
