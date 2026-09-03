import { useEffect, useRef, useState } from 'react';

import { send, trackEventBus } from '../utils/eventBus';
import { resolveExternalNavigationHref } from '../utils/link-follow';
import {
  resolvePreviewInteractionTarget,
  type PreviewInteractionKind,
} from '../utils/preview-interaction-target';

export const AFFORDANCE_DELAY_MS = 250;
export const AFFORDANCE_AUTO_HIDE_MS = 2500;

export const PREVIEW_EDIT_AFFORDANCE_EID = 'devtools.preview_edit.affordance';
export const PREVIEW_EDIT_ENTER_EDIT_EID = 'devtools.preview_edit.enter_edit';

export type PreviewEditAffordancePosition = { x: number; y: number };

export function usePreviewEditInteraction(options: {
  previewActive: boolean;
  editInteractionEnabled: boolean;
  cmsInlineEditEnabled: boolean;
}): { affordance: PreviewEditAffordancePosition | null } {
  const { previewActive, editInteractionEnabled, cmsInlineEditEnabled } = options;
  const [affordance, setAffordance] = useState<PreviewEditAffordancePosition | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearShowTimer = (): void => {
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const clearHideTimer = (): void => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const hideAffordance = (): void => {
      clearHideTimer();
      setAffordance(null);
    };

    const dismiss = (): void => {
      clearShowTimer();
      hideAffordance();
    };

    if (!previewActive) {
      dismiss();
      return;
    }

    const resolveClickElement = (target: EventTarget | null): HTMLElement | null => {
      if (target instanceof HTMLElement) return target;
      if (target instanceof Text && target.parentElement instanceof HTMLElement) {
        return target.parentElement;
      }
      return null;
    };

    const handleExternalLink = (event: MouseEvent, target: HTMLElement): boolean => {
      const externalHref: string | null = resolveExternalNavigationHref(target);
      if (!externalHref) return false;
      event.preventDefault();
      send({ type: 'OPEN_EXTERNAL_URL', url: externalHref });
      dismiss();
      return true;
    };

    const handleClick = (event: MouseEvent): void => {
      if (window.parent === window) return;
      const target: HTMLElement | null = resolveClickElement(event.target);
      if (!target) return;
      if (handleExternalLink(event, target)) return;
      if (!editInteractionEnabled) return;

      const hadPendingShow: boolean = showTimerRef.current !== null;
      clearShowTimer();
      if (hadPendingShow) {
        return;
      }

      const kind: PreviewInteractionKind = resolvePreviewInteractionTarget(
        target,
        event.clientX,
        event.clientY,
        {
          forDoubleClick: false,
          cmsInlineEditEnabled,
        },
      );

      if (kind.action !== 'affordance') {
        hideAffordance();
        return;
      }

      hideAffordance();
      const clientX: number = event.clientX;
      const clientY: number = event.clientY;
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        setAffordance({ x: clientX, y: clientY });
        trackEventBus.impression(PREVIEW_EDIT_AFFORDANCE_EID);
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          setAffordance(null);
        }, AFFORDANCE_AUTO_HIDE_MS);
      }, AFFORDANCE_DELAY_MS);
    };

    document.addEventListener('click', handleClick, true);

    if (!editInteractionEnabled) {
      dismiss();
      return () => {
        document.removeEventListener('click', handleClick, true);
        dismiss();
      };
    }

    const handleDblClick = (event: MouseEvent): void => {
      if (window.parent === window) return;
      dismiss();
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      const target: HTMLElement = event.target;

      const kind: PreviewInteractionKind = resolvePreviewInteractionTarget(
        target,
        event.clientX,
        event.clientY,
        {
          forDoubleClick: true,
          cmsInlineEditEnabled,
        },
      );

      if (kind.action === 'native-text-select') {
        return;
      }

      if (kind.action === 'enter-edit') {
        event.preventDefault();
        trackEventBus.click(PREVIEW_EDIT_ENTER_EDIT_EID, { elementKind: kind.elementKind });
        send({
          type: 'PREVIEW_ENTER_EDIT',
          selector: kind.selector,
          elementKind: kind.elementKind,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }
    };

    const handlePopState = (): void => {
      dismiss();
    };

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<typeof history.pushState>): void => {
      originalPushState(...args);
      dismiss();
    };
    history.replaceState = (...args: Parameters<typeof history.replaceState>): void => {
      originalReplaceState(...args);
      dismiss();
    };

    document.addEventListener('dblclick', handleDblClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('dblclick', handleDblClick, true);
      window.removeEventListener('popstate', handlePopState);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      dismiss();
    };
  }, [previewActive, editInteractionEnabled, cmsInlineEditEnabled]);

  return { affordance };
}
