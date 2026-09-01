/**
 * ImageSafetyConfirmModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Privacy-aware image upload confirmation modal.
 *
 * DESIGN RULES:
 *  - Shown AFTER file selection and validation, BEFORE any upload, DB reference,
 *    or signed URL is created.
 *  - Confirm button disabled until checkbox is selected.
 *  - Closing / back action equals Cancel.
 *  - Works on iPhone, iPad, Android, and desktop.
 *  - Respects safe-area insets (env(safe-area-inset-*)).
 *  - Keyboard and screen-reader accessible.
 *  - Prevents double-confirmation and duplicate uploads.
 *
 * POLICY VERSION:
 *  Bump POLICY_VERSION whenever the modal wording changes. The version is
 *  recorded in the audit row so we can identify which policy the user agreed to.
 */

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { AlertTriangle, MapPin, ShieldAlert, X } from 'lucide-react';
import type { ImageScanResult } from '@/lib/imageSafety/types';

export const POLICY_VERSION = '1.0';

// ── Modal wording (exact text per CP12A §4) ───────────────────────────────────

const MODAL_TITLE = 'Check this image before uploading';

const MODAL_MESSAGE =
  'This image may contain a person, personal information, or other sensitive ' +
  'content. Confirm it is appropriate for this job and that you have permission ' +
  'to upload it. Flagged images may be reviewed by authorised IWILLBUILD Support ' +
  'personnel under our Privacy and Acceptable Use Policies.';

const CHECKBOX_LABEL =
  'I confirm this image is lawful, appropriate, work-related, and I have ' +
  'authority to upload it.';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ImageSafetyConfirmModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Scan result that triggered this modal */
  scanResult: ImageScanResult;
  /** File name for display only — never the file itself */
  fileName: string;
  /** Called when the user confirms (checkbox checked + button clicked) */
  onConfirm: () => void;
  /** Called when the user cancels or closes the modal */
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
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const checkboxId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setChecked(false);
      setConfirming(false);
      // Focus the cancel button on open (safe default — doesn't accidentally confirm)
      setTimeout(() => cancelRef.current?.focus(), 50);
    }
  }, [open]);

  // Trap focus within modal while open
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = overlayRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    if (!checked || confirming) return;
    setConfirming(true);
    onConfirm();
  }, [checked, confirming, onConfirm]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    // Clicking the backdrop = cancel
    if (e.target === overlayRef.current) onCancel();
  }, [onCancel]);

  if (!open) return null;

  const showGpsWarning = scanResult.hasGpsMetadata;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="img-safety-title"
      aria-describedby="img-safety-desc"
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div
        className="
          relative w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl
          shadow-2xl overflow-hidden
          flex flex-col
        "
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 16px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldAlert size={18} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="img-safety-title"
              className="text-base font-bold text-foreground leading-snug"
            >
              {MODAL_TITLE}
            </h2>
            {fileName && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate" aria-label={`File: ${fileName}`}>
                {fileName}
              </p>
            )}
          </div>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            aria-label="Cancel upload"
            className="
              w-7 h-7 rounded-lg flex items-center justify-center
              text-muted-foreground hover:text-foreground hover:bg-muted
              transition-colors shrink-0
            "
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {/* GPS warning banner */}
          {showGpsWarning && (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-3 mb-4">
              <MapPin size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong>Location data detected.</strong> This image contains GPS coordinates in its
                metadata. Consider whether sharing the location is appropriate.
              </p>
            </div>
          )}

          {/* Scanner unavailable notice */}
          {scanResult.status === 'unavailable' && !showGpsWarning && (
            <div className="flex items-start gap-2.5 bg-muted/60 border border-border rounded-xl px-3.5 py-3 mb-4">
              <AlertTriangle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Automated content scanning is not available. Please review the image manually
                before confirming.
              </p>
            </div>
          )}

          {/* Main message */}
          <p
            id="img-safety-desc"
            className="text-sm text-foreground leading-relaxed"
          >
            {MODAL_MESSAGE}
          </p>

          {/* Checkbox */}
          <label
            htmlFor={checkboxId}
            className="
              flex items-start gap-3 mt-5 cursor-pointer
              rounded-xl border border-border bg-muted/40 px-3.5 py-3
              hover:bg-muted/70 transition-colors select-none
            "
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-primary shrink-0 cursor-pointer"
              aria-required="true"
            />
            <span className="text-sm text-foreground leading-relaxed">
              {CHECKBOX_LABEL}
            </span>
          </label>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex gap-3 px-5 py-4 border-t border-border bg-card"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="
              flex-1 py-2.5 rounded-xl border border-border
              text-sm font-semibold text-foreground
              hover:bg-muted transition-colors
            "
          >
            Cancel upload
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={!checked || confirming}
            aria-disabled={!checked || confirming}
            className="
              flex-1 py-2.5 rounded-xl
              text-sm font-semibold text-primary-foreground
              bg-primary hover:bg-primary/90
              transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {confirming ? 'Confirming…' : 'Confirm and upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
