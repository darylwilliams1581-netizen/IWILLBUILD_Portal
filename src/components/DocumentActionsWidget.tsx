/**
 * DocumentActionsWidget
 * ─────────────────────────────────────────────────────────────────────────────
 * Global floating button that appears when a document detail page registers
 * a DocumentActionDescriptor via useDocumentActionsRegistration().
 *
 * Desktop: compact pill — document icon + "Document" label
 * Mobile:  compact icon button (44×44 minimum touch target)
 *
 * Positioning: top-left of page content, below the application navigation.
 * z-index: above page content, below dialogs/modals/sheets.
 * print:hidden — never appears in print or PDF output.
 *
 * The widget dispatches to the correct Document Actions implementation based
 * on documentType.  Stage 2 supports: completed_form.
 *
 * Output variants:
 *   When the registered descriptor declares outputVariantOptions, the widget
 *   will (in a future stage) show a picker before executing an action.
 *   For Stage 2 / completed_form the variant is always 'default' and no
 *   picker is shown.  The selectedVariant is passed to every modal so the
 *   interface is ready for Estimates without any further plumbing changes.
 */

import { LockKeyhole } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useDocumentActions } from '@/lib/document-actions-context';

// Lazy-load the modal so it is not in the initial bundle
const FormDocumentActionsModal = lazy(
  () => import('@/components/job/FormDocumentActionsModal'),
);

// ── Registry — maps documentType → renderer ───────────────────────────────────
// Add new document types here in Stage 3+.
const SUPPORTED_TYPES = new Set(['completed_form']);

export default function DocumentActionsWidget() {
  const { descriptor, modalOpen, openModal, closeModal, selectedVariant } =
    useDocumentActions();
  const [localOpen, setLocalOpen] = useState(false);

  // Derive open state: prefer context modal flag (set by openModal/closeModal)
  // but also allow local state for the widget's own button click.
  const isOpen = modalOpen || localOpen;

  function handleOpen() {
    openModal();
    setLocalOpen(true);
  }

  function handleClose() {
    closeModal();
    setLocalOpen(false);
  }

  // ── Visibility guard ───────────────────────────────────────────────────────
  // Hide when:
  //  - No descriptor registered
  //  - Document type not yet supported
  //  - On public share pages (pathname starts with /share/)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isSharePage = pathname.startsWith('/share/');

  if (!descriptor || !SUPPORTED_TYPES.has(descriptor.documentType) || isSharePage) {
    return null;
  }

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────────────── */}
      <div
        className={[
          // Position: top-left, below nav. Use safe-area-inset for mobile.
          'fixed z-40 print:hidden',
          // Desktop: top-left with comfortable offset from nav
          'top-[calc(env(safe-area-inset-top,0px)+56px)] left-[calc(env(safe-area-inset-left,0px)+12px)]',
        ].join(' ')}
        aria-label="Document actions"
      >
        <button
          onClick={handleOpen}
          aria-label="Document actions"
          title="Document actions"
          className={[
            // Base: purple circle, visible focus ring, keyboard accessible
            'group flex items-center justify-center',
            'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
            'text-white',
            'rounded-full shadow-lg shadow-violet-900/30',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2',
            // 44×44 minimum touch target on all screen sizes
            'h-11 w-11',
          ].join(' ')}
        >
          <LockKeyhole size={18} className="shrink-0" />
        </button>
      </div>

      {/* ── Modal / bottom-sheet ─────────────────────────────────────────────── */}
      {isOpen && descriptor.documentType === 'completed_form' && (
        <Suspense fallback={null}>
          <FormDocumentActionsModal
            submissionId={Number(descriptor.recordId)}
            templateName={descriptor.title}
            jobId={descriptor.jobId !== undefined ? Number(descriptor.jobId) : undefined}
            job={descriptor.job ?? null}
            outputVariant={selectedVariant}
            onClose={handleClose}
          />
        </Suspense>
      )}
    </>
  );
}
