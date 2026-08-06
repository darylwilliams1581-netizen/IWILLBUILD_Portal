/**
 * IconTile — single icon tile used on the home screen icon grid pages.
 * Extracted so it can be shared between home.tsx and PagedHomeScreen.
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
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.06, y: -2 }}
      transition={{ type: 'spring', stiffness: 440, damping: 20 }}
      onClick={() => onNavigate(item.href)}
      className="w-full flex flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
      style={{ gap: '1px' }}
    >
      {/* Icon tile */}
      <div
        className={`w-[54px] h-[54px] sm:w-[66px] sm:h-[66px] rounded-[14px] sm:rounded-[18px] ${item.bg} ${item.fg} flex items-center justify-center relative overflow-hidden flex-shrink-0 icon-tile-shadow`}
      >
        {/* Top-left gloss sheen */}
        <div className="absolute inset-0 pointer-events-none icon-tile-gloss" />
        {/* Bottom inner shadow for depth */}
        <div className="absolute inset-0 pointer-events-none rounded-[inherit] icon-tile-depth" />
        <Icon
          size={21}
          strokeWidth={1.8}
          className="home-icon-glyph relative z-10 drop-shadow-sm"
        />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center shadow-md z-20 border-2 border-white/20">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </div>

      {/* Label */}
      <span
        className="text-[9px] sm:text-[11px] text-gray-800 font-semibold text-center w-full px-0.5"
        style={{
          lineHeight: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: '20px',
          wordBreak: 'break-word',
          hyphens: 'auto',
        }}
      >
        {item.label}
      </span>
    </motion.button>
  );
}
