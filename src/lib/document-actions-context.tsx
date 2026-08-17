/**
 * DocumentActionsContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Global registry for the Document Actions floating widget.
 *
 * A document detail/view page (or component) calls
 * `useDocumentActionsRegistration()` to register a descriptor when the
 * document is ready.  The global `DocumentActionsWidget` reads the active
 * descriptor from context and renders the floating button.
 *
 * Rules:
 *  - Only one descriptor is active at a time (last-write wins).
 *  - Registering null / calling unregister() hides the widget.
 *  - The hook auto-unregisters on unmount.
 *  - Duplicate registrations from the same component (e.g. hot-reload) are
 *    idempotent — the descriptor is replaced, not stacked.
 *
 * Output variants:
 *  - A descriptor may declare `outputVariantOptions` to signal that the user
 *    must choose a variant before an action is executed (e.g. Estimate:
 *    with_costs / without_costs / full_breakdown).
 *  - When `outputVariantOptions` is absent or empty the widget skips the
 *    selection step and uses 'default' silently.
 *  - The selected variant is stored in context and passed to every action
 *    (PDF view, PDF download, email attachment, Secure Share create/rotate).
 *  - Changing the variant for an existing Secure Share link requires explicit
 *    rotation — the widget must never silently change what a recipient link
 *    displays.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ── Output variant ────────────────────────────────────────────────────────────

/**
 * Which version of the document to generate / share.
 *
 * 'default'          — single-variant documents (completed_form, invoice, …)
 * 'with_costs'       — Estimate with line-item costs visible
 * 'without_costs'    — Estimate with costs hidden
 * 'full_breakdown'   — Estimate with full cost breakdown
 *
 * Add new values here as new document types are onboarded.
 */
export type DocumentOutputVariant =
  | 'default'
  | 'with_costs'
  | 'without_costs'
  | 'full_breakdown';

/** One selectable option shown in the variant picker UI */
export interface DocumentOutputVariantOption {
  value: DocumentOutputVariant;
  label: string;
  description?: string;
}

// ── Descriptor ────────────────────────────────────────────────────────────────

export type DocumentActionType = 'pdf' | 'email' | 'secure_share';

export interface DocumentActionDescriptor {
  /** Matches the Secure Share / content-GET target_type value */
  documentType: string;
  /** Primary record ID (job_form_submissions.id, etc.) */
  recordId: string | number;
  /** Human-readable title shown in the modal header */
  title: string;
  /** Optional job context — passed through to email modal */
  jobId?: string | number;
  /** Optional full Job object — passed through to email modal */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job?: any;
  /** Which action buttons to offer */
  availableActions: DocumentActionType[];
  /**
   * When present and non-empty, the widget shows a variant picker before
   * executing any action.  The first option in the array is the default.
   *
   * Omit (or pass an empty array) for single-variant documents such as
   * completed_form — the widget will use 'default' silently.
   */
  outputVariantOptions?: DocumentOutputVariantOption[];
}

// ── Context value ─────────────────────────────────────────────────────────────

interface DocumentActionsContextValue {
  /** Currently registered descriptor, or null when no document is active */
  descriptor: DocumentActionDescriptor | null;
  /** Register (or replace) the active descriptor */
  register: (d: DocumentActionDescriptor) => void;
  /** Clear the active descriptor */
  unregister: () => void;
  /** Whether the modal is open */
  modalOpen: boolean;
  /** Open the modal */
  openModal: () => void;
  /** Close the modal */
  closeModal: () => void;
  /**
   * The output variant currently selected by the user.
   * Always 'default' for documents with no outputVariantOptions.
   */
  selectedVariant: DocumentOutputVariant;
  /** Update the selected variant (called by the variant picker UI) */
  setSelectedVariant: (v: DocumentOutputVariant) => void;
}

const DocumentActionsContext = createContext<DocumentActionsContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function DocumentActionsProvider({ children }: { children: ReactNode }) {
  const [descriptor, setDescriptor] = useState<DocumentActionDescriptor | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<DocumentOutputVariant>('default');

  const register = useCallback((d: DocumentActionDescriptor) => {
    setDescriptor(d);
    // Reset to the first declared variant (or 'default') whenever a new
    // document is registered so stale selections don't carry over.
    const firstVariant = d.outputVariantOptions?.[0]?.value ?? 'default';
    setSelectedVariant(firstVariant);
    // Don't auto-open the modal on registration — only on explicit click.
  }, []);

  const unregister = useCallback(() => {
    setDescriptor(null);
    setModalOpen(false);
    setSelectedVariant('default');
  }, []);

  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  return (
    <DocumentActionsContext.Provider
      value={{
        descriptor,
        register,
        unregister,
        modalOpen,
        openModal,
        closeModal,
        selectedVariant,
        setSelectedVariant,
      }}
    >
      {children}
    </DocumentActionsContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useDocumentActions(): DocumentActionsContextValue {
  const ctx = useContext(DocumentActionsContext);
  if (!ctx) {
    throw new Error('useDocumentActions must be used inside DocumentActionsProvider');
  }
  return ctx;
}

// ── Registration hook (for document pages / components) ───────────────────────
/**
 * Call this hook inside any component that represents a document detail view.
 *
 * Pass `null` (or omit the argument) to hide the widget while the document
 * is loading or unavailable.
 *
 * The hook auto-unregisters when the component unmounts.
 *
 * @example — single-variant document (no picker shown)
 *   useDocumentActionsRegistration({
 *     documentType: 'completed_form',
 *     recordId: submission.id,
 *     title: templateName,
 *     jobId: job?.id,
 *     job,
 *     availableActions: ['pdf', 'email', 'secure_share'],
 *   });
 *
 * @example — multi-variant document (picker shown before each action)
 *   useDocumentActionsRegistration({
 *     documentType: 'estimate',
 *     recordId: estimate.id,
 *     title: estimate.title,
 *     availableActions: ['pdf', 'email', 'secure_share'],
 *     outputVariantOptions: [
 *       { value: 'with_costs',    label: 'With costs' },
 *       { value: 'without_costs', label: 'Without costs' },
 *       { value: 'full_breakdown', label: 'Full breakdown' },
 *     ],
 *   });
 */
export function useDocumentActionsRegistration(
  descriptor: DocumentActionDescriptor | null | undefined,
): void {
  const ctx = useContext(DocumentActionsContext);
  // Stable ref so the cleanup closure always sees the latest ctx.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Serialise the descriptor to a string so the effect only re-runs when
  // the values actually change (avoids re-registering on every render when
  // the caller passes an inline object literal).
  const key = descriptor
    ? `${descriptor.documentType}:${descriptor.recordId}:${descriptor.title}`
    : null;

  useEffect(() => {
    if (!ctxRef.current) return;
    if (descriptor) {
      ctxRef.current.register(descriptor);
    } else {
      ctxRef.current.unregister();
    }
    return () => {
      ctxRef.current?.unregister();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
