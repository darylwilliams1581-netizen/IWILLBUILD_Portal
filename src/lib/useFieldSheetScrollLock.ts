import { useEffect } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

/** Keeps touch scrolling inside field sheets and clears focus on close. */
export function useFieldSheetScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;

    return () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    };
  }, [open]);

  useBodyScrollLock(open);
}
