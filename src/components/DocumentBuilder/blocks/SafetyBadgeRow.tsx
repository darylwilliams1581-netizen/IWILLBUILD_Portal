import { ShieldCheck } from 'lucide-react';
import type { SafetyBadgeRowBlock, SafetyBadgeType } from '../types';

interface Props {
  block: SafetyBadgeRowBlock;
  columnsBlockId?: string;
  columnId?: string;
}

const BADGE_ICONS: Record<SafetyBadgeType, string> = {
  ppe:               '🦺',
  helmet:            '⛑️',
  footwear:          '👢',
  eye_protection:    '🥽',
  gloves:            '🧤',
  electrical_gloves: '⚡',
  hearing:           '🎧',
  hi_vis:            '🟡',
  fall_arrest:       '🪝',
  custom:            '🛡️',
};

const SIZE_MAP = {
  sm: { box: 'w-12 h-12', icon: 'text-2xl', label: 'text-[9px]' },
  md: { box: 'w-16 h-16', icon: 'text-3xl', label: 'text-[10px]' },
  lg: { box: 'w-20 h-20', icon: 'text-4xl', label: 'text-xs' },
};

export default function SafetyBadgeRowView({ block }: Props) {
  const sizeStyle = SIZE_MAP[block.size] ?? SIZE_MAP.md;
  const alignClass = block.align === 'center' ? 'justify-center'
    : block.align === 'right' ? 'justify-end'
    : 'justify-start';

  return (
    <div className={`flex flex-wrap gap-3 py-2 ${alignClass}`}>
      {block.badges.map((badge) => (
        <div key={badge.id} className="flex flex-col items-center gap-1">
          <div
            className={`${sizeStyle.box} rounded-xl border-2 ${badge.required ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50'} flex items-center justify-center`}
          >
            {badge.customImageUrl ? (
              <img src={badge.customImageUrl} alt={badge.label} className="w-3/4 h-3/4 object-contain" />
            ) : (
              <span className={sizeStyle.icon}>{BADGE_ICONS[badge.badgeType] ?? '🛡️'}</span>
            )}
          </div>
          <span className={`${sizeStyle.label} font-medium text-slate-600 text-center max-w-[80px] leading-tight`}>
            {badge.label}
          </span>
          {badge.required && (
            <span className="text-[8px] font-bold text-orange-500 uppercase tracking-wider">Required</span>
          )}
        </div>
      ))}
      {block.badges.length === 0 && (
        <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
          <ShieldCheck size={14} />
          <span>No safety badges added</span>
        </div>
      )}
    </div>
  );
}
