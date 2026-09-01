/**
 * ImageSafetyConfirmModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A rev 2 — Soft privacy-aware image upload confirmation modal.
 *
 * DESIGN RULES (rev 2):
 *  - Only shown for 'privacy_warning' (GPS) and 'unavailable' scan results.
 *  - 'clear' results never trigger this modal.
 *  - No checkbox required — one-tap "Use photo" / "Retake" flow.
 *  - "Retake" = cancel; "Use photo" = confirm and proceed.
 *  - Closing / back action equals Retake (cancel).
 *  - Works on iPhone, iPad, Android, and desktop.
 *  - Respects safe-area insets (env(safe-area-inset-*)).
 *  - Keyboard and screen-reader accessible.
 *  - Prevents double-confirmation and duplicate uploads.
 *
 * WORDING (CP12A rev 2 §3):
 *  Standard soft warning (privacy_warning + unavailable):
 *    Title:   "People may be visible"
 *    Message: "Please make sure this photo is suitable for work and you have
 *              permission to share it."
 *    Buttons: Retake | Use photo
 *
 *  GPS additional note (privacy_warning only):
 *    Inline banner: "Location data detected. This image contains GPS
 *    coordinates. Consider whether sharing the location is appropriate."
 *
 *  High-risk / blocked (status === 'blocked'):
 *    Handled entirely in the hook — this modal is never shown for blocked files.
 *
 * POLICY VERSION:
 *  Bump POLICY_VERSION whenever the modal wording changes. The version is
 *  recorded in the audit row so we can identify which policy the user agreed to.
 */

import { useEffect, useRef, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import type { ImageScanResult } from '@/lib/imageSafety/types';

export const POLICY_VERSION = '2.0';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ImageSafetyConfirmModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Scan result that triggered this modal */
  scanResult: ImageScanResult;
  /** File name for display only — never the file itself */
  fileName: string;
  /** Called when the user taps "Use photo" */
  onConfirm: () => void;
  /** Called when the user taps "Retake" or closes the modal */
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImageSafetyConfirmModal({
  open,
  scanResult,
  fileName,
  onConfirm,
  onCancel,
}: ImageSafetyConfirmModalProps) {
  const retakeRef = useRef<HTMLButtonElement>(null);
  const usePhotoRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Guard against double-tap
  const confirmingRef = useRef(false);

  // Reset guard and focus "Retake" (safe default) when modal opens
  useEffect(() => {
    if (open) {
      confirmingRef.current = false;
      setTimeout(() => retakeRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard: Escape = Retake; Tab trap
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Tab') return;
      const focusable = overlayRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  const handleUsePhoto = useCallback(() => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    onConfirm();
  }, [onConfirm]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onCancel();
  }, [onCancel]);

  if (!open) return null;

  const showGpsBanner = scanResult.hasGpsMetadata;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="img-safety-title"
      aria-describedby="img-safety-desc"
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div
        className="
          relative w-full sm:max-w-sm bg-card border border-border
          rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col
        "
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 16px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Body ── */}
        <div className="px-5 pt-5 pb-4">
          {/* GPS banner — only when GPS detected */}
          {showGpsBanner && (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-3 mb-4">
              <MapPin size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong>Location data detected.</strong>{' '}
                This image contains GPS coordinates. Consider whether sharing the location is appropriate.
              </p>
            </div>
          )}

          {/* Title */}
          <h2
            id="img-safety-title"
            className="text-base font-bold text-foreground leading-snug mb-2"
          >
            People may be visible
          </h2>

          {/* Message */}
          <p
            id="img-safety-desc"
            className="text-sm text-muted-foreground leading-relaxed"
          >
            Please make sure this photo is suitable for work and you have permission to share it.
          </p>

          {/* File name — subtle, below message */}
          {fileName && (
            <p className="text-xs text-muted-foreground/60 mt-2 truncate" aria-label={`File: ${fileName}`}>
              {fileName}
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex gap-3 px-5 py-4 border-t border-border bg-card"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* Retake = cancel */}
          <button
            ref={retakeRef}
            type="button"
            onClick={onCancel}
            className="
              flex-1 py-2.5 rounded-xl border border-border
              text-sm font-semibold text-foreground
              hover:bg-muted transition-colors
            "
          >
            Retake
          </button>

          {/* Use photo = confirm */}
          <button
            ref={usePhotoRef}
            type="button"
            onClick={handleUsePhoto}
            className="
              flex-1 py-2.5 rounded-xl
              text-sm font-semibold text-primary-foreground
              bg-primary hover:bg-primary/90
              transition-colors
            "
          >
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}
