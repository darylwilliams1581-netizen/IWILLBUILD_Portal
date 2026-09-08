import { useEffect } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

/** Locks field-sheet scrolling and clears stale viewport styles on close. */
export function useFieldSheetScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;

    const roots = [document.documentElement, document.body];
    roots.forEach(root => {
      root.style.removeProperty('overflow');
      root.style.removeProperty('height');
      root.style.removeProperty('position');
    });
    document.documentElement.style.overflow = 'hidden';

    return () => {
      roots.forEach(root => {
        root.style.removeProperty('overflow');
        root.style.removeProperty('height');
        root.style.removeProperty('position');
      });
    };
  }, [open]);

  useBodyScrollLock(open);
}
