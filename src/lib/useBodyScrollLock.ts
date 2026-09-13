/**
 * useBodyScrollLock
 * Compatibility hook for existing sheets. Fixed overlays now contain their
 * own scrolling, so this hook only clears keyboard focus on close. It never
 * changes overflow on html or body.
 */
import { useEffect } from 'react';

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    return () => {
      if (document.activeElement instanceof globalThis.HTMLElement) {
        document.activeElement.blur();
      }
    };
  }, [locked]);
}
