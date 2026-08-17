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
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

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
}

const DocumentActionsContext = createContext<DocumentActionsContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function DocumentActionsProvider({ children }: { children: ReactNode }) {
  const [descriptor, setDescriptor] = useState<DocumentActionDescriptor | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function register(d: DocumentActionDescriptor) {
    setDescriptor(d);
    // Don't auto-open the modal on registration — only on explicit click
  }

  function unregister() {
    setDescriptor(null);
    setModalOpen(false);
  }

  function openModal() { setModalOpen(true); }
  function closeModal() { setModalOpen(false); }

  return (
    <DocumentActionsContext.Provider
      value={{ descriptor, register, unregister, modalOpen, openModal, closeModal }}
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
 * @example
 *   useDocumentActionsRegistration({
 *     documentType: 'completed_form',
 *     recordId: submission.id,
 *     title: templateName,
 *     jobId: job?.id,
 *     job,
 *     availableActions: ['pdf', 'email', 'secure_share'],
 *   });
 */
export function useDocumentActionsRegistration(
  descriptor: DocumentActionDescriptor | null | undefined,
): void {
  const ctx = useContext(DocumentActionsContext);
  // Stable ref so the cleanup closure always sees the latest ctx
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
