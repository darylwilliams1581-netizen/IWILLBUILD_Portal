/**
 * ImageSafeguardNotice.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A §5 — Subtle notice shown near image upload controls.
 *
 * Wording (exact, per spec §5):
 *   "Images are protected by the IWIIlBUILD Image Safeguard Protocol."
 *
 * Linked to the Privacy and Acceptable Use information (/privacy).
 *
 * DESIGN RULES:
 *  - Subtle — does not interrupt the upload flow.
 *  - No checkbox, no confirmation, no blocking.
 *  - Shown near upload controls, not as a modal.
 *  - Works on mobile and desktop.
 */

import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

interface ImageSafeguardNoticeProps {
  /** Additional CSS classes */
  className?: string;
}

export default function ImageSafeguardNotice({ className = '' }: ImageSafeguardNoticeProps) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-muted-foreground/70 ${className}`}>
      <ShieldCheck size={11} className="shrink-0 text-muted-foreground/50" aria-hidden="true" />
      <span>
        Job photos may be reviewed in a confined owner audit service. Only flags and notes are stored. Unlawful or policy-breaching content may be restricted and, where required, reported to eSafety or police. Clients are not notified of ordinary review flags.{' '}
        <Link
          to="/privacy"
          className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
          aria-label="View Privacy and Acceptable Use information"
        >
          Learn more
        </Link>
      </span>
    </p>
  );
}
