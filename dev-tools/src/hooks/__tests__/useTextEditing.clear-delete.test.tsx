/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

// ── Mocks (must be declared before importing the hook) ──

vi.mock("../../utils/postMessage", () => ({
  isOriginAllowed: () => true,
  safePostMessage: vi.fn(),
}));

const sendSpy = vi.fn();
vi.mock("../../utils/eventBus", () => ({
  send: (...args: unknown[]) => sendSpy(...args),
  TextEditErrorCode: {},
}));

vi.mock("../../utils/inline-edit-tracking", () => ({ trackInlineEdit: vi.fn() }));
vi.mock("../../utils/translations", () => ({ t: (_k: string, f: string) => f }));
vi.mock("../../utils/element-helpers", () => ({
  generatePreciseSelector: () => "p.body",
  extractDevContext: () => ({ devId: "dev-1", fileName: "Page.tsx", componentName: "Page", lineNumber: 1 }),
  getElementClassName: () => "body",
}));
vi.mock("../../utils/content-edit-payload", () => ({ buildContentUpdatePayload: () => ({}) }));

// Keep real sendElementDelete + dispatchElementDelete (so their DELETE_ELEMENT /
// DELETE_CONTENT_ITEM payloads are exercised), but force the classified strategy per
// test — the DOM-attribute classifier itself is covered by delete-strategy.test.ts.
// This isolates the commit routing.
const { classifyMock } = vi.hoisted(() => ({
  classifyMock: vi.fn((): import("../../utils/delete-strategy").DeleteStrategy => ({ type: "static-leaf" })),
}));
vi.mock("../../utils/delete-strategy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/delete-strategy")>();
  return { ...actual, classifyDeleteStrategy: classifyMock };
});

// Force the clicked element to be treated as the editable container so we reach
// the inline editor without depending on the full editability gate.
vi.mock("../../utils/text-editing-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/text-editing-helpers")>();
  return { ...actual, findEditableContainer: (el: HTMLElement) => el, findBrSegment: () => null };
});

vi.mock("../../utils/element-detection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/element-detection")>();
  return { ...actual, isDevToolsElement: () => false, isInsideNavSurface: () => false, resolveContentKey: () => null };
});

// Capture the onCommit the hook wires into the editor.
let capturedOnCommit: ((newText: string, newHtml: string | null) => void) | null = null;
vi.mock("../../components/InlineLexicalEditor", () => ({
  default: (props: { onCommit: (t: string, h: string | null) => void }) => {
    capturedOnCommit = props.onCommit;
    return null;
  },
}));

// Real createRoot.render needs a DOM renderer; invoke the element factory directly
// so the mocked editor captures its props synchronously.
vi.mock("react-dom/client", () => ({
  createRoot: () => ({
    render: (el: { type: (p: unknown) => unknown; props: unknown }) => el.type(el.props),
    unmount: vi.fn(),
  }),
}));

import { useTextEditing } from "../useTextEditing";

function captureClickHandler(): (e: MouseEvent) => void {
  const captured: Array<(e: MouseEvent) => void> = [];
  const origAdd = document.addEventListener.bind(document);
  const addSpy = vi.spyOn(document, "addEventListener").mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
      if (type === "click") captured.push(listener as (e: MouseEvent) => void);
      origAdd(type, listener, options);
    },
  );
  renderHook(() => useTextEditing(true, true));
  addSpy.mockRestore();
  expect(captured.length).toBeGreaterThan(0);
  return captured[captured.length - 1];
}

function beginEdit(): void {
  const handler = captureClickHandler();
  const el = document.createElement("p");
  el.textContent = "hello";
  el.setAttribute("data-dev-file", "Page.tsx");
  document.body.appendChild(el);
  act(() => {
    handler({ isTrusted: true, target: el, clientX: 5, clientY: 5, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as MouseEvent);
  });
  expect(capturedOnCommit).toBeTypeOf("function");
}

const sentTypes = (): string[] => sendSpy.mock.calls.map((c) => (c[0] as { type: string }).type);

describe("useTextEditing — clearing text deletes the element", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_LEXICAL_EDITOR", "true");
    sendSpy.mockClear();
    classifyMock.mockReturnValue({ type: "static-leaf" });
    capturedOnCommit = null;
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
    document.body.innerHTML = "";
  });

  it("routes an emptied standalone static-text edit to DELETE_ELEMENT, not TEXT_UPDATED", () => {
    beginEdit();
    act(() => capturedOnCommit!("", null));

    expect(sentTypes()).toContain("DELETE_ELEMENT");
    expect(sentTypes()).not.toContain("TEXT_UPDATED");
  });

  it("routes an emptied content-list/item-id text root to DELETE_CONTENT_ITEM, not DELETE_ELEMENT", () => {
    classifyMock.mockReturnValue({
      type: "content-item",
      collectionKey: "home.pricing.1.features",
      itemId: "feat-3",
      itemIndex: 3,
    });
    beginEdit();
    act(() => capturedOnCommit!("", null));

    const types = sentTypes();
    expect(types).toContain("DELETE_CONTENT_ITEM");
    expect(types).not.toContain("DELETE_ELEMENT");
    expect(types).not.toContain("TEXT_UPDATED");
    const contentItemCall = sendSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === "DELETE_CONTENT_ITEM",
    )![0] as { data: { collectionKey: string; itemId: string | null; itemIndex: number | null } };
    expect(contentItemCall.data).toEqual({ collectionKey: "home.pricing.1.features", itemId: "feat-3", itemIndex: 3 });
  });

  it("still sends TEXT_UPDATED when text remains", () => {
    beginEdit();
    act(() => capturedOnCommit!("world", null));

    expect(sentTypes()).toContain("TEXT_UPDATED");
    expect(sentTypes()).not.toContain("DELETE_ELEMENT");
  });
});

describe("useTextEditing — legacy contentEditable path, clearing text on cancel", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_LEXICAL_EDITOR", "");
    sendSpy.mockClear();
    document.body.replaceChildren();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
    document.body.innerHTML = "";
  });

  function beginLegacyEdit(): HTMLElement {
    const handler = captureClickHandler();
    const el = document.createElement("p");
    el.textContent = "hello";
    el.setAttribute("data-dev-file", "Page.tsx");
    document.body.appendChild(el);
    act(() => {
      handler({ isTrusted: true, target: el, clientX: 5, clientY: 5, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as MouseEvent);
    });
    return el;
  }

  it("restores innerHTML (not blank) when the user clears text and blurs, so a cancelled delete leaves content intact", () => {
    const el = beginLegacyEdit();
    expect(el.contentEditable).toBe("true");

    // Simulate the browser having emptied the live DOM, as it does when a user
    // selects-all and deletes inside a contentEditable element.
    el.textContent = "";
    act(() => {
      el.dispatchEvent(new Event("blur"));
    });

    expect(el.innerHTML).toBe("hello");
    expect(sentTypes()).toContain("DELETE_ELEMENT");
  });
});
