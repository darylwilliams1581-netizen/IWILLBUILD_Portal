import { isLoopRenderedElement } from "./formatOverrideMessages";
import { isCommerceManagedContent } from "./commerce-managed-content";
import { send, type BusElementInfo } from "./eventBus";
import { generatePreciseSelector, extractDevContext, getElementClassName } from "./element-helpers";

export type DeleteStrategy =
  | { type: "static-leaf" }
  | { type: "content-item"; collectionKey: string; itemId: string | null; itemIndex: number | null }
  | { type: "conformable-item"; page: string; arrayName: string; conformId: string | null; itemIndex: number }
  | { type: "container" }
  | { type: "agent-fallback" };

const CONTAINER_TAGS: Set<string> = new Set(["div", "section", "main", "article", "nav", "header", "footer", "aside", "form"]);

const LEAF_TAGS: Set<string> = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "a", "img", "video", "svg",
  "picture", "blockquote", "li", "button", "label", "figcaption", "figure",
]);

/** Resolve template brackets in a content-list key by walking up ancestor indices.
 *  e.g. "home.pricing[].features" inside pricing item index 1 → "home.pricing.1.features" */
function resolveCollectionKey(element: HTMLElement, key: string): string {
  if (!key.includes("[]")) return key;
  let resolved: string = key;
  let searchFrom: number = 0;
  while (true) {
    const bracketPos: number = key.indexOf("[]", searchFrom);
    if (bracketPos === -1) break;
    const parentPath: string = key.substring(0, bracketPos);
    const ancestor: Element | null = element.closest(`[data-dev-content-list="${parentPath}"]`);
    if (!ancestor) break;
    const idx: string | null = ancestor.getAttribute("data-dev-content-list-index");
    if (idx === null) break;
    resolved = resolved.replace("[]", `[${idx}]`);
    searchFrom = bracketPos + 2;
  }
  return resolved;
}

/** Classify how an element should be deleted, or null when deletion is not supported.
 *  Order matters: content-item and conformable-item checks (ancestor-based) run before
 *  the tag-based container/static-leaf checks so a leaf tag inside a content list is
 *  routed to its collection-aware strategy instead of the generic leaf path. */
export function classifyDeleteStrategy(element: HTMLElement): DeleteStrategy | null {
  if (isCommerceManagedContent(element)) return null;

  const contentListEl: HTMLElement | null = element.closest("[data-dev-content-list]");
  const hasOwnContentKey: boolean = !!element.getAttribute("data-dev-content-key-template");
  if (contentListEl && !hasOwnContentKey) {
    const collectionKey: string | null = contentListEl?.getAttribute("data-dev-content-list") ?? null;
    // Only trust itemId if it's on the content-list element itself (not a parent level)
    const itemIdEl: HTMLElement | null = element.closest("[data-dev-item-id]");
    const itemId: string | null =
      itemIdEl && itemIdEl === contentListEl ? itemIdEl.getAttribute("data-dev-item-id") : null;
    const indexAttr: string | null = element.closest("[data-dev-content-list-index]")?.getAttribute("data-dev-content-list-index") ?? null;
    const itemIndex: number | null = indexAttr !== null ? parseInt(indexAttr, 10) : null;
    if (collectionKey && (itemId || itemIndex !== null)) {
      return { type: "content-item", collectionKey: resolveCollectionKey(element, collectionKey), itemId, itemIndex };
    }
  }

  const conformableEl: HTMLElement | null = element.closest("[data-dev-conformable-array]");
  if (conformableEl) {
    const arrayName: string = conformableEl.getAttribute("data-dev-conformable-array") ?? "";
    const page: string = conformableEl.getAttribute("data-dev-conformable-page") ?? "";
    const conformId: string | null = conformableEl.getAttribute("data-dev-conformable-id") ?? null;
    const indexStr: string | null = element.closest("[data-dev-content-list-index]")?.getAttribute("data-dev-content-list-index") ?? null;
    const itemIndex: number = indexStr ? parseInt(indexStr, 10) : 0;
    if (arrayName && page) {
      return { type: "conformable-item", page, arrayName, conformId, itemIndex };
    }
  }

  const tag: string = element.tagName.toLowerCase();
  if (CONTAINER_TAGS.has(tag) && element.getAttribute("data-dev-id") && !isLoopRenderedElement(element)) {
    return { type: "container" };
  }

  if (
    LEAF_TAGS.has(tag) &&
    element.getAttribute("data-dev-file") &&
    !isLoopRenderedElement(element) &&
    !element.getAttribute("data-dev-dynamic") &&
    !element.getAttribute("data-dev-content-key-template")
  ) {
    return { type: "static-leaf" };
  }

  if (element.getAttribute("data-dev-file")) {
    return { type: "agent-fallback" };
  }

  return null;
}

/** Build and emit the DELETE_ELEMENT bus message for a non-image element.
 *  Shared by the hover-bar trash action and the "cleared all text → delete" path
 *  so both route container/leaf/agent-fallback deletions through the same payload. */
export function sendElementDelete(element: HTMLElement, opts?: { forceContainer?: boolean; skipAst?: boolean }): void {
  const devContext = extractDevContext(element);
  const preciseSelector: string = generatePreciseSelector(element);
  const elRect: DOMRect = element.getBoundingClientRect();
  const elementInfo: BusElementInfo = {
    tagName: element.tagName.toLowerCase(),
    className: getElementClassName(element),
    id: element.id,
    dataId: devContext?.devId || "",
    textContent: "",
    computedStyles: {},
    rect: { top: elRect.top, left: elRect.left, width: elRect.width, height: elRect.height },
    selector: preciseSelector,
    preciseSelector,
    devContext,
  };
  send({
    type: "DELETE_ELEMENT",
    data: {
      selector: preciseSelector,
      preciseSelector,
      devContext,
      elementInfo,
      isVideo: false,
      imageUrl: null,
      ...(opts?.forceContainer ? { forceContainer: true } : {}),
      ...(opts?.skipAst ? { skipAst: true } : {}),
    },
  });
}

/** Dispatch a classified deletion to the correct bus message for a non-image element.
 *  Shared by the hover-bar trash action and the "cleared all text → delete" path so a
 *  content-backed item routes to DELETE_CONTENT_ITEM (removing the single content record)
 *  rather than DELETE_ELEMENT deleting the shared JSX template. */
export function dispatchElementDelete(element: HTMLElement, strategy: DeleteStrategy): void {
  if (strategy.type === "content-item") {
    send({
      type: "DELETE_CONTENT_ITEM",
      data: { collectionKey: strategy.collectionKey, itemId: strategy.itemId, itemIndex: strategy.itemIndex },
    });
    return;
  }
  const skipAst: boolean = strategy.type === "conformable-item" || strategy.type === "agent-fallback";
  sendElementDelete(element, { forceContainer: strategy.type === "container", ...(skipAst ? { skipAst: true } : {}) });
}
