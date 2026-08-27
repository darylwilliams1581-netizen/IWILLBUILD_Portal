import { buildContentUpdatePayload, type ContentEditTarget } from "./content-edit-payload";
import { resolveContentKeyWithElement, type ContentKeyResolutionWithElement } from "./element-detection";
import { send } from "./eventBus";

/** Non-null ⇒ `CONTENT_UPDATED` already posted; null ⇒ caller falls through to `TEXT_UPDATED`. */
export interface ContentEditSaveResult {
  contentTarget: ContentEditTarget;
}

/** Single shared decision point for whether a text edit is content-backed; sends CONTENT_UPDATED and returns the target, or null so callers fall through to TEXT_UPDATED. */
export function trySaveContentEdit(
  element: HTMLElement,
  originalText: string,
  newText: string,
  commitId?: string,
  refreshOnSuccess?: boolean,
): ContentEditSaveResult | null {
  const contentTarget: ContentKeyResolutionWithElement | null = resolveContentKeyWithElement(element);
  if (!contentTarget) return null;

  // Read data-dev-content-derived off the element the resolution says actually
  // owns the key — not necessarily the clicked `element` — since resolution can
  // fall through to a covering keyed descendant found via last-resort search.
  send({
    type: "CONTENT_UPDATED",
    data: buildContentUpdatePayload(contentTarget.element, contentTarget, originalText, newText, commitId, refreshOnSuccess),
  });

  return { contentTarget };
}
