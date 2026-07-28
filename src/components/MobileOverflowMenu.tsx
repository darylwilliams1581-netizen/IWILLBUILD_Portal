/**
 * MobileOverflowMenu — reusable "⋯" overflow menu for page headers.
 *
 * Usage:
 *   <MobileOverflowMenu
 *     items={[
 *       { label: 'Print', icon: <Printer size={15} />, onSelect: handlePrint },
 *       { label: 'Export CSV', icon: <Download size={15} />, onSelect: exportCsv },
 *       { label: 'Delete', icon: <Trash2 size={15} />, onSelect: handleDelete, destructive: true },
 *     ]}
 *   />
 *
 * Design rules:
 * - Button is always 40×40 px, touch-manipulation, no text label.
 * - Menu drops below the button, right-aligned, min-w-[180px].
 * - Backdrop closes the menu on tap-outside.
 * - Destructive items render in red.
 * - Disabled items are greyed and non-interactive.
 * - Works on both light (white bg) and dark (coloured header) surfaces via the
 *   `surface` prop: 'light' (default) | 'dark'.
 */

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface OverflowMenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Render a divider line above this item */
  dividerAbove?: boolean;
}

interface MobileOverflowMenuProps {
  items: OverflowMenuItem[];
  /** 'light' = dark icon on white header (default); 'dark' = white icon on coloured header */
  surface?: 'light' | 'dark';
  /** Extra className on the trigger button */
  className?: string;
  /** aria-label for the trigger button */
  label?: string;
}

export default function MobileOverflowMenu({
  items,
  surface = 'light',
  className = '',
  label = 'More options',
}: MobileOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside tap
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const triggerCls = surface === 'dark'
    ? 'text-white/80 hover:text-white hover:bg-white/20 active:bg-white/30'
    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:bg-gray-200';

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      {/* Trigger */}
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(s => !s)}
        className={[
          'w-10 h-10 rounded-xl flex items-center justify-center transition-colors touch-manipulation',
          triggerCls,
          className,
        ].join(' ')}
      >
        <MoreHorizontal size={20} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 overflow-hidden"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)' }}
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.dividerAbove && (
                <div className="h-px bg-gray-100 mx-3 my-1" />
              )}
              <button
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  if (!item.disabled) item.onSelect();
                }}
                className={[
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left transition-colors touch-manipulation',
                  item.disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : item.destructive
                      ? 'text-red-600 hover:bg-red-50 active:bg-red-100'
                      : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100',
                ].join(' ')}
              >
                {item.icon && (
                  <span className={item.disabled ? 'opacity-40' : item.destructive ? 'text-red-500' : 'text-gray-400'}>
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
