import {
  FORM_TAGS,
  hasManagedDocMarkup,
  isClickable,
  isDevToolsElement,
  isInsideNavSurface,
  isManagedPath,
} from './element-detection';
import { generatePreciseSelector } from './element-helpers';
import {
  resolveHoverableAnchorAtPoint,
  type HoveredElement,
} from '../hooks/useImageHoverDetection';
import { findEditableContainer } from './text-editing-helpers';

export type PreviewInteractionKind =
  | { action: 'ignore' }
  | { action: 'affordance' }
  | { action: 'native-text-select' }
  | {
      action: 'enter-edit';
      selector: string;
      elementKind: 'text' | 'image' | 'content';
    };

const TYPOGRAPHIC_INLINE_TAGS = new Set(['span', 'strong', 'em', 'b', 'i', 'code']);

function isTypographicInline(element: HTMLElement): boolean {
  return TYPOGRAPHIC_INLINE_TAGS.has(element.tagName.toLowerCase());
}

function isFormElement(element: HTMLElement): boolean {
  const tag: string = element.tagName.toLowerCase();
  if (FORM_TAGS.has(tag)) return true;
  return element.closest('input, textarea, select, label') !== null;
}

function resolveMarkedTextBlockAncestor(target: HTMLElement): HTMLElement | null {
  let ancestor: HTMLElement | null = target.parentElement;
  while (ancestor && ancestor !== document.body) {
    if (
      ancestor.getAttribute('data-dev-editable') === 'text' &&
      ancestor.hasAttribute('data-dev-file')
    ) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

function resolveEditableContainer(
  target: HTMLElement,
  cmsInlineEditEnabled: boolean,
): HTMLElement | null {
  const fromTarget: HTMLElement | null = findEditableContainer(target, cmsInlineEditEnabled);
  if (fromTarget) return fromTarget;

  if (!isTypographicInline(target)) return null;

  let ancestor: HTMLElement | null = target.parentElement;
  while (ancestor) {
    const fromAncestor: HTMLElement | null = findEditableContainer(ancestor, cmsInlineEditEnabled);
    if (fromAncestor) return fromAncestor;
    if (!isTypographicInline(ancestor)) break;
    ancestor = ancestor.parentElement;
  }

  return resolveMarkedTextBlockAncestor(target);
}

export function resolvePreviewInteractionTarget(
  target: HTMLElement,
  clientX: number,
  clientY: number,
  options: { forDoubleClick: boolean; cmsInlineEditEnabled: boolean },
): PreviewInteractionKind {
  const { forDoubleClick, cmsInlineEditEnabled } = options;

  if (isManagedPath() && hasManagedDocMarkup()) {
    return { action: 'ignore' };
  }

  if (
    isClickable(target) ||
    isInsideNavSurface(target) ||
    isFormElement(target) ||
    isDevToolsElement(target)
  ) {
    return { action: 'ignore' };
  }

  const editableContainer: HTMLElement | null = resolveEditableContainer(target, cmsInlineEditEnabled);

  if (forDoubleClick && isTypographicInline(target) && editableContainer) {
    return { action: 'native-text-select' };
  }

  if (!forDoubleClick && editableContainer) {
    return { action: 'affordance' };
  }

  const hoverable: HoveredElement | null = resolveHoverableAnchorAtPoint(target, clientX, clientY);

  if (!forDoubleClick && hoverable) {
    return { action: 'affordance' };
  }

  if (forDoubleClick) {
    if (editableContainer) {
      return {
        action: 'enter-edit',
        selector: generatePreciseSelector(editableContainer),
        elementKind: 'text',
      };
    }

    if (hoverable?.type === 'image') {
      return {
        action: 'enter-edit',
        selector: generatePreciseSelector(hoverable.element),
        elementKind: 'image',
      };
    }

    if (hoverable?.type === 'content') {
      return {
        action: 'enter-edit',
        selector: generatePreciseSelector(hoverable.element),
        elementKind: 'content',
      };
    }
  }

  return { action: 'ignore' };
}
