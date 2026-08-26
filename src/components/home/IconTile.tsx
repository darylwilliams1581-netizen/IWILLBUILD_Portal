/**
 * IconTile — compact card tile used on the Manage page.
 *
 * Visual spec (matches Work & Field JobFeatureCard):
 *   Normal tile  — horizontal layout, 32×32 badge, 16px glyph, min-h 52px
 *   Wide tile    — horizontal banner, 32×32 badge, 16px glyph, min-h 52px
 *
 * Touch targets are always ≥ 44px (min-h-[52px] satisfies this).
 * Labels wrap naturally — no truncation on long text.
 */

import { motion } from 'motion/react';
import type { HomeIconDef } from '@/lib/homeIcons';

export function IconTile({
  item,
  onNavigate,
  wide,
}: {
  item: HomeIconDef;
  onNavigate: (href: string) => void;
  wide?: boolean;
}) {
  const Icon = item.icon;

  if (wide) {
    // Full-width horizontal banner tile — compact badge left, label right
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01, y: -1 }}
        transition={{ type: 'spring', stiffness: 440, damping: 22 }}
        onClick={() => onNavigate(item.href)}
        data-testid={`icon-tile-wide-${item.key}`}
        aria-label={item.label}
        className={`
          col-span-2 w-full flex flex-row items-center gap-3
          px-3 py-2.5 rounded-xl shadow-sm
          active:scale-[0.98] transition-transform
          outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2
          ${item.bg} ${item.fg}
        `}
        style={{ minHeight: 52 }}
      >
        {/* Icon badge — 32×32 */}
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center relative flex-shrink-0">
          <Icon size={16} strokeWidth={2} className="relative z-10" />
          {item.badge != null && item.badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shadow-md z-20 border border-white/20">
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          )}
        </div>

        {/* Label block */}
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[13px] font-bold leading-tight">{item.label}</span>
          <span className="text-[11px] font-medium opacity-75 mt-0.5">Builders Calc · Takeoff Pad</span>
        </div>

        {/* Chevron hint */}
        <svg className="ml-auto flex-shrink-0 opacity-60" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </motion.button>
    );
  }

  // Normal compact horizontal tile — matches JobFeatureCard in Work & Field
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.02, y: -1 }}
      transition={{ type: 'spring', stiffness: 440, damping: 22 }}
      onClick={() => onNavigate(item.href)}
      data-testid={`icon-tile-${item.key}`}
      aria-label={item.label}
      className={`
        w-full flex flex-row items-center gap-2.5
        px-3 py-2.5 rounded-xl shadow-sm
        active:scale-95 transition-transform
        outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2
        ${item.bg} ${item.fg}
      `}
      style={{ minHeight: 52 }}
    >
      {/* Icon badge — 32×32 */}
      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center relative flex-shrink-0">
        <Icon size={16} strokeWidth={2} className="relative z-10" />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shadow-md z-20 border border-white/20">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </div>

      {/* Label — wraps naturally, never truncates */}
      <span className="text-[13px] font-bold leading-tight text-left">
        {item.label}
      </span>
    </motion.button>
  );
}
