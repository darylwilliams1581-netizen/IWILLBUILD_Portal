/**
 * IconTile — 2-column card tile used on Field and Manage pages.
 *
 * Matches the height and visual weight of the Dashboard quick-action tiles
 * so the whole home screen feels consistent. Each tile is a full-width card
 * in a 2-col grid: large icon circle on top, bold label below.
 */

import { motion } from 'motion/react';
import type { HomeIconDef } from '@/lib/homeIcons';

export function IconTile({
  item,
  onNavigate,
}: {
  item: HomeIconDef;
  onNavigate: (href: string) => void;
}) {
  const Icon = item.icon;
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.02, y: -1 }}
      transition={{ type: 'spring', stiffness: 440, damping: 22 }}
      onClick={() => onNavigate(item.href)}
      className={`
        w-full h-full flex flex-col items-center justify-center gap-2
        px-3 py-4 rounded-2xl shadow-sm
        active:scale-95 transition-transform
        outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2
        ${item.bg} ${item.fg}
      `}
    >
      {/* Icon circle */}
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center relative flex-shrink-0">
        <Icon size={20} strokeWidth={2} className="relative z-10" />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shadow-md z-20 border-2 border-white/20">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </div>

      {/* Label */}
      <span
        className="text-sm font-bold leading-tight text-center"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {item.label}
      </span>
    </motion.button>
  );
}
