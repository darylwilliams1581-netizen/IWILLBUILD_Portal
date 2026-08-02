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
  generatePreciseSelector: () => "img.hero",
  extractDevContext: () => ({}),
}));

// Keep real detection so a real <img> resolves as media; stub only the bail-out guards.
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

import { useTextEditing } from "../useTextEditing";

function captureClickHandler(): (e: MouseEvent) => void {
  const capturedHandlers: Array<(e: MouseEvent) => void> = [];
  const origAdd = document.addEventListener.bind(document);
  const addSpy = vi.spyOn(document, "addEventListener").mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
      if (type === "click") capturedHandlers.push(listener as (e: MouseEvent) => void);
      origAdd(type, listener, options);
    },
  );
  renderHook(({ active }: { active: boolean }) => useTextEditing(active, true), {
    initialProps: { active: true },
  });
  addSpy.mockRestore();
  expect(capturedHandlers.length).toBeGreaterThan(0);
  return capturedHandlers[capturedHandlers.length - 1];
}

function clickOn(handler: (e: MouseEvent) => void, target: HTMLElement): {
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  act(() => {
    handler({ isTrusted: true, target, clientX: 5, clientY: 5, preventDefault, stopPropagation } as unknown as MouseEvent);
  });
  return { preventDefault, stopPropagation };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendSpy.mockClear();
  document.body.replaceChildren();
  // jsdom has no elementsFromPoint; the stack-scan fallback needs it callable.
  document.elementsFromPoint = vi.fn(() => []) as typeof document.elementsFromPoint;
});

afterEach(() => {
  cleanup();
});

describe("useTextEditing — media clicks suppress the app's own click handler", () => {
  it("stops propagation on an image click so an app lightbox/expand can't also fire", function mediaClick() {
    const handler = captureClickHandler();

    const img: HTMLImageElement = document.createElement("img");
    img.src = "http://localhost/hero.png";
    document.body.appendChild(img);

    const { preventDefault, stopPropagation } = clickOn(handler, img);

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("suppresses a click on an image inside a clickable wrapper (the reported lightbox shape)", function wrappedMediaClick() {
    const handler = captureClickHandler();

    const link: HTMLAnchorElement = document.createElement("a");
    link.href = "/detail";
    const img: HTMLImageElement = document.createElement("img");
    img.src = "http://localhost/hero.png";
    link.appendChild(img);
    document.body.appendChild(link);

    const { preventDefault, stopPropagation } = clickOn(handler, img);

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("leaves a non-media, non-editable click alone (media-only scope)", function nonMediaClick() {
    const handler = captureClickHandler();

    const div: HTMLDivElement = document.createElement("div");
    document.body.appendChild(div);

    const { stopPropagation } = clickOn(handler, div);

    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
