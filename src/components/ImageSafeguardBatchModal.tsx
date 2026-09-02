/**
 * ImageSafeguardBatchModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A §6 — External-sharing batch confirmation modal.
 *
 * Shown ONCE per outgoing batch when images are emailed or shared externally.
 * NOT shown on upload. NOT shown per-image. ONE confirmation per batch.
 *
 * WORDING (per spec):
 *  Title:   "Image sharing check"
 *  Message: "Please confirm that you are authorised to share these images and
 *            that they do not contain inappropriate material or information
 *            that breaches another person's privacy.
 *
 *            Images may be reviewed under the IWIIlBUILD Image Safeguard
 *            Protocol."
 *
 * ACTIONS:
 *  - Go Back          (secondary — aborts)
 *  - Confirm and Share / Confirm and Send  (primary — confirms and proceeds)
 *
 * DESIGN RULES:
 *  - Works on iPhone, iPad, Android, and desktop.
 *  - Respects safe-area insets.
 *  - Keyboard and screen-reader accessible.
 *  - Prevents double-confirmation.
 */

import { useEffect, useRef, useCallback, useId } from 'react';
import { ShieldCheck, AlertTriangle, Lock } from 'lucide-react';
import type { SafeguardStatus } from '@/lib/imageSafeguard/types';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ImageSafeguardBatchModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Worst-case status across all images in the batch */
  worstStatus: SafeguardStatus;
  /** Number of images in the batch */
  imageCount: number;
  /** Sharing surface label for display (e.g. "email", "share link") */
  sharingSurface?: string;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Called when the user cancels */
  onCancel: () => void;
  /**
   * When true, the confirm button reads "Confirm and Send" (email).
   * When false/undefined, reads "Confirm and Share" (share link).
   */
  isEmail?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImageSafeguardBatchModal({
  open,
  worstStatus,
  imageCount,
  onConfirm,
  onCancel,
  isEmail = false,
}: ImageSafeguardBatchModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const confirmingRef = useRef(false);
  const titleId = useId();
  const descId = useId();

  // Reset guard and focus cancel on open
  useEffect(() => {
    if (open) {
      confirmingRef.current = false;
      setTimeout(() => cancelRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard: Escape = Cancel; Tab trap
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) { // eslint-disable-line no-undef
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

  const handleConfirm = useCallback(() => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    onConfirm();
  }, [onConfirm]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => { // eslint-disable-line no-undef
    if (e.target === overlayRef.current) onCancel();
  }, [onCancel]);

  if (!open) return null;

  const isBlocked = worstStatus === 'blocked' || worstStatus === 'elevated';
  const imageLabel = imageCount === 1 ? '1 image' : `${imageCount} images`;
  const confirmLabel = isEmail ? 'Confirm and Send' : 'Confirm and Share';

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
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
          relative w-full sm:max-w-md bg-card border border-border
          rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col
        "
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 16px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-border">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isBlocked ? 'bg-red-500/15' : 'bg-primary/10'}`}>
            {isBlocked
              ? <Lock size={18} className="text-red-500" />
              : <ShieldCheck size={18} className="text-primary" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-bold text-foreground leading-snug">
              Image sharing check
            </h2>
            {imageCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {imageLabel}
              </p>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {/* Blocked / elevated message */}
          {isBlocked && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-3.5 py-3 mb-4">
              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                <strong>Sharing is not available for these images.</strong>{' '}
                One or more images cannot be shared externally at this time.
                If you believe this is an error, please contact{' '}
                <a href="mailto:support@iwillbuild.com" className="underline">IWIIlBUILD Support</a>.
              </p>
            </div>
          )}

          {/* Main message */}
          {!isBlocked && (
            <div id={descId} className="text-sm text-foreground leading-relaxed space-y-3">
              <p>
                Please confirm that you are authorised to share these images and that they do not
                contain inappropriate material or information that breaches another person's privacy.
              </p>
              <p className="text-xs text-muted-foreground">
                Images may be reviewed under the IWIIlBUILD Image Safeguard Protocol.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex flex-col gap-2 px-5 py-4 border-t border-border bg-card"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {isBlocked ? (
            /* Blocked: only Go Back */
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Go Back
            </button>
          ) : (
            <>
              {/* Primary: Confirm and Share / Confirm and Send */}
              <button
                ref={confirmRef}
                type="button"
                onClick={handleConfirm}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
              >
                {confirmLabel}
              </button>

              {/* Go Back */}
              <button
                ref={cancelRef}
                type="button"
                onClick={onCancel}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Go Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
