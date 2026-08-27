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

vi.mock("../../utils/inline-edit-tracking", () => ({
  trackInlineEdit: vi.fn(),
}));

vi.mock("../../utils/translations", () => ({
  t: (_key: string, fallback: string) => fallback,
}));

vi.mock("../../utils/element-helpers", () => ({
  generatePreciseSelector: () => "p.test",
  extractDevContext: () => ({}),
}));

// Keep real detection (resolveContentKey, isTextEditable, findEditableContainer)
// so element A's data-dev-content-key and element B's data-dev-file naturally
// route through the content vs. AST save paths; stub only the bail-out guards.
vi.mock("../../utils/element-detection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/element-detection")>();
  return {
    ...actual,
    isDevToolsElement: () => false,
    isInsideNavSurface: () => false,
    resolveConformTarget: vi.fn(() => null),
  };
});

vi.mock("../../utils/content-edit-payload", () => ({
  buildContentUpdatePayload: () => ({}),
}));

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));

vi.mock("../../components/InlineLexicalEditor", () => ({
  default: () => null,
}));

let commitIdCounter = 0;
vi.mock("../../utils/crypto-utils", () => ({
  generateUniqueId: vi.fn((): string => `commit-${++commitIdCounter}`),
}));

import { useTextEditing } from "../useTextEditing";

type TextEditingResult = ReturnType<typeof useTextEditing>;

function renderEditing(): {
  handler: (e: MouseEvent) => void;
  result: { current: TextEditingResult };
} {
  const capturedHandlers: Array<(e: MouseEvent) => void> = [];
  const origAdd = document.addEventListener.bind(document);
  const addSpy = vi.spyOn(document, "addEventListener").mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
      if (type === "click") capturedHandlers.push(listener as (e: MouseEvent) => void);
      origAdd(type, listener, options);
    },
  );
  const { result } = renderHook(() => useTextEditing(true, true));
  addSpy.mockRestore();
  expect(capturedHandlers.length).toBeGreaterThan(0);
  return { handler: capturedHandlers[capturedHandlers.length - 1], result };
}

function clickOn(handler: (e: MouseEvent) => void, target: HTMLElement): void {
  act(() => {
    handler({
      isTrusted: true,
      target,
      clientX: 5,
      clientY: 5,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent);
  });
}

function editAndBlur(element: HTMLElement, newText: string): void {
  act(() => {
    element.textContent = newText;
    element.dispatchEvent(new FocusEvent("blur"));
  });
}

function dispatchAck(type: string, commitId: string): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type, commitId },
        origin: window.location.origin,
      }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendSpy.mockClear();
  commitIdCounter = 0;
  document.body.replaceChildren();
  // jsdom has no elementsFromPoint; the stack-scan fallback needs it callable.
  document.elementsFromPoint = vi.fn(() => []) as typeof document.elementsFromPoint;
});

afterEach(() => {
  cleanup();
});

describe("useTextEditing — a stale ack from a superseded save cannot settle a later one", () => {
  it("keeps the second save's saveStatus at \"saving\" when a first save's stale CONTENT_EDIT_SUCCEEDED ack arrives after a second save has begun", () => {
    const { handler, result } = renderEditing();

    const elementA: HTMLParagraphElement = document.createElement("p");
    elementA.setAttribute("data-dev-content-key", "a.headline");
    elementA.textContent = "Hello A";
    document.body.appendChild(elementA);

    const elementB: HTMLParagraphElement = document.createElement("p");
    elementB.setAttribute("data-dev-file", "true");
    elementB.textContent = "Hello B";
    document.body.appendChild(elementB);

    // Save A (content-backed path) — mints commit-1.
    clickOn(handler, elementA);
    editAndBlur(elementA, "Hello A edited");
    expect(result.current.saveStatus).toBe("saving");
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CONTENT_UPDATED" }),
    );

    // A's genuine ack settles it.
    dispatchAck("CONTENT_EDIT_SUCCEEDED", "commit-1");
    expect(result.current.saveStatus).toBe("saved");

    sendSpy.mockClear();

    // Save B (AST path, no content key) — mints commit-2.
    clickOn(handler, elementB);
    editAndBlur(elementB, "Hello B edited");
    expect(result.current.saveStatus).toBe("saving");
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "TEXT_UPDATED" }),
    );

    // A's now-stale ack (commit-1) arrives again while B is pending (commit-2) —
    // shouldIgnoreContentAck must reject it instead of settling B's save.
    dispatchAck("CONTENT_EDIT_SUCCEEDED", "commit-1");
    expect(result.current.saveStatus).toBe("saving");

    // B's own genuine ack still settles it correctly.
    dispatchAck("TEXT_EDIT_SUCCEEDED", "commit-2");
    expect(result.current.saveStatus).toBe("saved");
  });
});
