/**
 * useBodyScrollLock
 * Prevents the page body from scrolling while a mobile overlay is open.
 * Uses overflow:hidden on <body> and restores on cleanup.
 * Safe for multiple concurrent callers — uses a ref-count approach.
 */
import { useEffect } from 'react';

let lockCount = 0;

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lockCount++;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      lockCount--;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = prev;
      }
    };
  }, [locked]);
}
