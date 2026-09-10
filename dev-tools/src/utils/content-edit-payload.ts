/** Identifies the content field and edit kind targeted by an inline edit. */
export interface ContentEditTarget {
  key: string;
  kind: "copy" | "richText";
}

export interface ContentUpdatePayload {
  contentKey: string;
  kind: "copy" | "richText";
  oldText: string;
  newText: string;
  expectedCurrent?: string;
  /** Correlates the eventual CONTENT_EDIT_SUCCEEDED/FAILED ack to this save; omit when only one save is ever in flight. */
  commitId?: string;
  /** Ask the builder to refresh the preview once this save's own success ack lands. */
  refreshOnSuccess?: boolean;
}

/** Builds an inline-edit payload, including `expectedCurrent` where the server can reject a stale value. */
export function buildContentUpdatePayload(
  element: HTMLElement,
  target: ContentEditTarget,
  originalText: string,
  newText: string,
  commitId?: string,
  refreshOnSuccess?: boolean,
): ContentUpdatePayload {
  const requiresExpectedCurrent: boolean = element.getAttribute("data-dev-content-derived") === "true" ||
    (element.hasAttribute("data-dev-content-key") && element.hasAttribute("data-dev-content-key-template"));
  return {
    contentKey: target.key,
    kind: target.kind,
    oldText: originalText,
    newText,
    ...(requiresExpectedCurrent ? { expectedCurrent: originalText } : {}),
    ...(commitId !== undefined ? { commitId } : {}),
    ...(refreshOnSuccess ? { refreshOnSuccess } : {}),
  };
}
