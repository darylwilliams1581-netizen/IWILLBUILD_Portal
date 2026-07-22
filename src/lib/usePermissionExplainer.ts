/**
 * usePermissionExplainer
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks whether the pre-permission explainer modal has been shown for each
 * iOS permission type. Persists to localStorage so users are never nagged
 * after they've already seen (and dismissed) the explainer.
 *
 * Usage:
 *   const explainer = usePermissionExplainer();
 *
 *   // Check if we should show the explainer before requesting a permission:
 *   if (explainer.shouldShow('camera')) {
 *     // show <PermissionExplainerModal type="camera" ... />
 *   } else {
 *     // go straight to the native permission request
 *   }
 *
 *   // Call after the user taps "Not Now" or "Enable" in the modal:
 *   explainer.markShown('camera');
 *
 * Permission types:
 *   'camera'        — NSCameraUsageDescription
 *   'photos'        — NSPhotoLibraryUsageDescription
 *   'location'      — NSLocationWhenInUseUsageDescription
 *   'microphone'    — NSMicrophoneUsageDescription
 *   'notifications' — UNUserNotificationCenter
 */

import { useCallback } from 'react';

export type PermissionType = 'camera' | 'photos' | 'location' | 'microphone' | 'notifications';

const STORAGE_KEY = 'iwb_perm_explainer_shown';

/** Read the set of already-shown permission types from localStorage */
function readShown(): Set<PermissionType> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as PermissionType[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/** Persist the set back to localStorage */
function writeShown(shown: Set<PermissionType>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...shown]));
  } catch { /* storage full or private mode — silently ignore */ }
}

export interface UsePermissionExplainerReturn {
  /**
   * Returns true if the explainer modal should be shown before requesting
   * this permission. Returns false if the user has already seen it.
   */
  shouldShow: (type: PermissionType) => boolean;
  /**
   * Mark the explainer as shown for this permission type.
   * Call this when the user taps either "Not Now" or "Enable".
   */
  markShown: (type: PermissionType) => void;
  /**
   * Reset a permission's shown state (for testing / re-prompting after
   * a long period). Not used in normal app flow.
   */
  reset: (type: PermissionType) => void;
}

export function usePermissionExplainer(): UsePermissionExplainerReturn {
  const shouldShow = useCallback((type: PermissionType): boolean => {
    return !readShown().has(type);
  }, []);

  const markShown = useCallback((type: PermissionType): void => {
    const shown = readShown();
    shown.add(type);
    writeShown(shown);
  }, []);

  const reset = useCallback((type: PermissionType): void => {
    const shown = readShown();
    shown.delete(type);
    writeShown(shown);
  }, []);

  return { shouldShow, markShown, reset };
}
