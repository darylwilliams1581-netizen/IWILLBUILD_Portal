/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

// ── Mocks (must be declared before importing the hook) ──

const postMessageSpy = vi.fn();
vi.mock("../../utils/postMessage", () => ({
  isOriginAllowed: () => true,
  safePostMessage: (...args: unknown[]) => postMessageSpy(...args),
}));

vi.mock("../../utils/eventBus", () => ({
  send: vi.fn(),
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

// resolveContentKey / resolveContentKeyWithElement stay real — the whole
// point of this test is exercising their descendant-fallback resolution
// against the actual element the hook builds the save payload from.
vi.mock("../../utils/element-detection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/element-detection")>();
  return {
    ...actual,
    isDevToolsElement: () => false,
    generateSelector: () => "p",
    isBodyTextElement: () => false,
    resolveConformTarget: vi.fn(() => null),
    isInsideNavSurface: () => false,
  };
});

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));

vi.mock("../../components/InlineLexicalEditor", () => ({
  default: () => null,
}));

import { useTextEditing } from "../useTextEditing";

// ── Tests ──

beforeEach(() => {
  vi.clearAllMocks();
  postMessageSpy.mockClear();
  document.body.replaceChildren();
});

afterEach(() => {
  cleanup();
});

describe("useTextEditing — content-key save payload uses the resolved element", () => {
  it("builds CONTENT_UPDATED from the descendant that owns the key, not the clicked wrapper", async () => {
    vi.useFakeTimers();

    const capturedHandlers: Array<(e: MouseEvent) => void> = [];
    const origAdd = document.addEventListener.bind(document);
    const addSpy = vi.spyOn(document, "addEventListener").mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
        if (type === "click") capturedHandlers.push(listener as (e: MouseEvent) => void);
        origAdd(type, listener, options);
      },
    );

    renderHook(() => useTextEditing(true, true));
    addSpy.mockRestore();

    expect(capturedHandlers.length).toBeGreaterThan(0);
    const clickHandler: (e: MouseEvent) => void = capturedHandlers[capturedHandlers.length - 1];

    // A styling wrapper (stands in for motion.div) that cannot itself be the
    // <Text> primitive — the content key lives on its sole descendant, which
    // also carries data-dev-content-derived, the attribute the bug read from
    // the wrong element.
    const wrapper: HTMLElement = document.createElement("div");
    const span: HTMLElement = document.createElement("span");
    span.setAttribute("data-dev-content-key", "hero.title");
    span.setAttribute("data-dev-content-derived", "true");
    span.textContent = "Hello";
    wrapper.appendChild(span);
    document.body.appendChild(wrapper);

    act(() => {
      const syntheticClick = {
        isTrusted: true,
        target: wrapper,
        clientX: 0,
        clientY: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;
      clickHandler(syntheticClick);
    });

    // findEditableContainer resolves the wrapper itself as the editable
    // container (via resolveContentKey's descendant fallback), so the legacy
    // path makes the wrapper contentEditable and commits on blur.
    const legacyEditStarted: boolean = wrapper.style.outline === "none";
    expect(legacyEditStarted).toBe(true);

    // Simulate the user's edit — mutate the descendant's text, keeping the
    // key-bearing element in place, then blur to commit.
    span.textContent = "World";
    act(() => {
      wrapper.dispatchEvent(new Event("blur"));
    });

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const [, message] = postMessageSpy.mock.calls[0] as [unknown, { type: string; data: Record<string, unknown> }];
    expect(message.type).toBe("CONTENT_UPDATED");
    // Only present when isDerived is read off the resolved descendant (span);
    // reading it off the clicked wrapper — the bug this PR fixes — omits it.
    expect(message.data.expectedCurrent).toBe("Hello");
    expect(message.data.contentKey).toBe("hero.title");
    expect(message.data.newText).toBe("World");

    vi.useRealTimers();
  });
});
