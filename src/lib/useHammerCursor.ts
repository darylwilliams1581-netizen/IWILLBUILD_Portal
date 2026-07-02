/**
 * Hammer Cursor — useHammerCursor hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the hammer cursor mode for the portal.
 *
 * - Reads/writes the preference to localStorage under "iwb_hammer_cursor"
 * - When enabled, adds the `.hammer-cursor-active` class to <body> so the
 *   CSS cursor rule applies globally (except inputs/textareas/rich-text)
 * - Exposes `enabled` and `setEnabled` for the settings toggle
 *
 * The actual click-animation spawning lives in HammerClickEffect.tsx which
 * is mounted once at the app root level.
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'iwb_hammer_cursor';

export function useHammerCursor() {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Sync body class whenever enabled changes
  useEffect(() => {
    if (enabled) {
      document.body.classList.add('hammer-cursor-active');
    } else {
      document.body.classList.remove('hammer-cursor-active');
    }
    return () => {
      // Clean up on unmount (safety)
      document.body.classList.remove('hammer-cursor-active');
    };
  }, [enabled]);

  const setEnabled = useCallback((value: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
    setEnabledState(value);
  }, []);

  return { enabled, setEnabled };
}
