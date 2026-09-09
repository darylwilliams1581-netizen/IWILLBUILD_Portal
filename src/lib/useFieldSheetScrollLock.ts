import { useEffect } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

/** Locks field-sheet scrolling and clears stale viewport styles on close. */
export function useFieldSheetScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;

    const roots = [document.documentElement, document.body];
    const previousHtmlOverflow = document.documentElement.style.overflow;
    roots.forEach(root => {
      root.style.removeProperty('overflow');
      root.style.removeProperty('height');
      root.style.removeProperty('position');
    });
    document.documentElement.style.overflow = 'hidden';

    return () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      document.documentElement.style.overflow = previousHtmlOverflow;
      roots.forEach(root => {
        root.style.removeProperty('height');
        root.style.removeProperty('position');
      });
      window.scrollTo(0, 0);
    };
  }, [open]);

  useBodyScrollLock(open);
}
