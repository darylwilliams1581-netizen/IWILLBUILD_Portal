/**
 * ImageSafeguardBatchModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A §6 — External-sharing batch confirmation modal.
 *
 * Shown ONCE per outgoing batch when images are:
 *  - Emailed
 *  - Shared outside the company
 *  - Exported
 *  - Downloaded for external distribution
 *  - Added to a public or guest link
 *
 * NOT shown on upload. NOT shown per-image. ONE confirmation per batch.
 *
 * WORDING (exact, per spec §6):
 *  Title:   "Image Safeguard – Privacy check"
 *  Message: "People or sensitive information may be visible in the selected
 *            images. Confirm the recipients are correct and you have authority
 *            to share them."
 *
 * ACTIONS:
 *  - Review images  (secondary — opens image review if available)
 *  - Send securely  (primary — confirms and proceeds)
 *  - Cancel         (tertiary — aborts)
 *
 * GRADUATED BEHAVIOUR:
 *  clear           → compact confirmation (no GPS banner, no warning)
 *  privacy_signal  → standard confirmation + GPS banner
 *  unavailable     → standard confirmation
 *  elevated        → sharing blocked; neutral message + support route
 *  blocked         → sharing blocked; neutral message + support route
 *
 * DESIGN RULES:
 *  - Works on iPhone, iPad, Android, and desktop.
 *  - Respects safe-area insets.
 *  - Keyboard and screen-reader accessible.
 *  - Prevents double-confirmation.
 *  - "Review images" is optional — only shown when onReview is provided.
 */

import { useEffect, useRef, useCallback, useId } from 'react';
import { ShieldAlert, MapPin, AlertTriangle, Lock } from 'lucide-react';
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
  /** Called when the user confirms ("Send securely") */
  onConfirm: () => void;
  /** Called when the user cancels */
  onCancel: () => void;
  /** Optional: called when the user clicks "Review images" */
  onReview?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImageSafeguardBatchModal({
  open,
  worstStatus,
  imageCount,
  sharingSurface,
  onConfirm,
  onCancel,
  onReview,
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

  const handleConfirm = useCallback(() => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    onConfirm();
  }, [onConfirm]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onCancel();
  }, [onCancel]);

  if (!open) return null;

  // ── Blocked / elevated — no sharing allowed ───────────────────────────────
  const isBlocked = worstStatus === 'blocked' || worstStatus === 'elevated';

  // ── GPS / privacy signal ──────────────────────────────────────────────────
  const hasPrivacySignal = worstStatus === 'privacy_signal';

  const imageLabel = imageCount === 1 ? '1 image' : `${imageCount} images`;
  const surfaceLabel = sharingSurface ? ` via ${sharingSurface}` : '';

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
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isBlocked ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
            {isBlocked
              ? <Lock size={18} className="text-red-500" />
              : <ShieldAlert size={18} className="text-amber-500" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-bold text-foreground leading-snug">
              Image Safeguard – Privacy check
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {imageLabel}{surfaceLabel}
            </p>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {/* GPS / privacy signal banner */}
          {hasPrivacySignal && (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-3 mb-4">
              <MapPin size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong>Location data detected.</strong>{' '}
                One or more images contain GPS coordinates. Confirm the recipients should receive this location information.
              </p>
            </div>
          )}

          {/* Blocked / elevated message */}
          {isBlocked && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-3.5 py-3 mb-4">
              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                <strong>Sharing is not available for these images.</strong>{' '}
                One or more images cannot be shared externally at this time.
                If you believe this is an error, please contact{' '}
                <a href="mailto:support@iwillbuild.com" className="underline">IWILLBUILD Support</a>.
              </p>
            </div>
          )}

          {/* Main message */}
          {!isBlocked && (
            <p id={descId} className="text-sm text-foreground leading-relaxed">
              People or sensitive information may be visible in the selected images.
              Confirm the recipients are correct and you have authority to share them.
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex flex-col gap-2 px-5 py-4 border-t border-border bg-card"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {isBlocked ? (
            /* Blocked: only Cancel */
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          ) : (
            <>
              {/* Primary: Send securely */}
              <button
                ref={confirmRef}
                type="button"
                onClick={handleConfirm}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
              >
                Send securely
              </button>

              <div className="flex gap-2">
                {/* Optional: Review images */}
                {onReview && (
                  <button
                    type="button"
                    onClick={onReview}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    Review images
                  </button>
                )}

                {/* Cancel */}
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={onCancel}
                  className={`py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors ${onReview ? 'flex-1' : 'w-full'}`}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
