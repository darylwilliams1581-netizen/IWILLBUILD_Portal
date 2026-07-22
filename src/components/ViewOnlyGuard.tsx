/**
 * ViewOnlyGuard
 * ─────────────────────────────────────────────────────────────────────────────
 * Utility components for disabling write actions in view-only mode.
 *
 * COMPONENTS
 * ──────────
 * <ViewOnlyGuard>
 *   Wraps children and disables pointer events + shows a tooltip when
 *   the company is in view-only mode.  Use around buttons, forms, etc.
 *
 *   Props:
 *     children    — React node(s) to wrap
 *     tooltip     — override the default tooltip text
 *     asChild     — if true, clones the single child and adds disabled prop
 *                   (useful for <Button> components)
 *
 * HOOK
 * ────
 * useViewOnly()  — returns { isViewOnly, isLoading }
 *   Convenience re-export of useSubscriptionGate for components that only
 *   need the boolean.
 *
 * USAGE EXAMPLES
 * ──────────────
 * // Wrap a button:
 * <ViewOnlyGuard>
 *   <Button onClick={createJob}>New Job</Button>
 * </ViewOnlyGuard>
 *
 * // Conditional disable:
 * const { isViewOnly } = useViewOnly();
 * <Button disabled={isViewOnly} title={isViewOnly ? 'Subscribe to continue' : undefined}>
 *   Upload Photo
 * </Button>
 */

import { type ReactNode, cloneElement, isValidElement } from 'react';
import { useSubscriptionGate } from '@/lib/useSubscriptionGate';

const DEFAULT_TOOLTIP = 'Subscribe to continue';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useViewOnly() {
  const { isViewOnly, isLoading } = useSubscriptionGate();
  return { isViewOnly, isLoading };
}

// ── Guard component ───────────────────────────────────────────────────────────

interface ViewOnlyGuardProps {
  children: ReactNode;
  tooltip?: string;
  /** If true, clones the single child element and passes disabled={true} */
  asChild?: boolean;
}

export function ViewOnlyGuard({ children, tooltip = DEFAULT_TOOLTIP, asChild = false }: ViewOnlyGuardProps) {
  const { isViewOnly } = useSubscriptionGate();

  if (!isViewOnly) return <>{children}</>;

  // asChild mode: clone the child and add disabled prop
  if (asChild && isValidElement(children)) {
    return cloneElement(children as React.ReactElement<{ disabled?: boolean; title?: string }>, {
      disabled: true,
      title: tooltip,
    });
  }

  // Wrapper mode: overlay a transparent div that blocks pointer events
  return (
    <span
      className="relative inline-flex"
      title={tooltip}
      style={{ cursor: 'not-allowed' }}
    >
      <span
        className="pointer-events-none opacity-50 select-none"
        aria-disabled="true"
      >
        {children}
      </span>
    </span>
  );
}
