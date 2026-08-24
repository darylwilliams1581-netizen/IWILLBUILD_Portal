/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";

import { Tooltip } from "../Tooltip";

describe("Tooltip", function tooltipTests() {
  beforeEach(function setup() {
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", class ResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    });
  });

  afterEach(function teardown() {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows portaled bubble immediately on hover with default delay", async function instantShow() {
    render(
      createElement(
        Tooltip,
        { content: "Toggle bold" },
        createElement("button", { type: "button" }, "B"),
      ),
    );

    fireEvent.mouseEnter(document.querySelector(".airo-tooltip-root")!);
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    const bubble = document.body.querySelector(".airo-tooltip-bubble");
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain("Toggle bold");
  });

  it("does not show bubble while disabled", function disabledSuppresses() {
    render(
      createElement(
        Tooltip,
        { content: "Text color", disabled: true },
        createElement("button", { type: "button" }, "C"),
      ),
    );

    fireEvent.mouseEnter(document.querySelector(".airo-tooltip-root")!);
    act(() => {
      vi.runAllTimers();
    });

    expect(document.body.querySelector(".airo-tooltip-bubble")).toBeNull();
  });

  it("respects custom show delay", async function customDelay() {
    render(
      createElement(
        Tooltip,
        { content: "Delayed", delayMs: 200 },
        createElement("button", { type: "button" }, "D"),
      ),
    );

    fireEvent.mouseEnter(document.querySelector(".airo-tooltip-root")!);
    await act(async () => {
      vi.advanceTimersByTime(199);
      await Promise.resolve();
    });
    expect(document.body.querySelector(".airo-tooltip-bubble")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(document.body.querySelector(".airo-tooltip-bubble")).not.toBeNull();
  });

  it("hides bubble after pointer leave", async function hideOnLeave() {
    render(
      createElement(
        Tooltip,
        { content: "Toggle italic" },
        createElement("button", { type: "button" }, "I"),
      ),
    );

    const root = document.querySelector(".airo-tooltip-root")!;
    fireEvent.mouseEnter(root);
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });
    expect(document.body.querySelector(".airo-tooltip-bubble")).not.toBeNull();

    fireEvent.mouseLeave(root);
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(document.body.querySelector(".airo-tooltip-bubble")).toBeNull();
  });

  it("strips native title from the trigger to prevent double tooltips", function stripNativeTitle() {
    render(
      createElement(
        Tooltip,
        { content: "Text color" },
        createElement("button", { type: "button", title: "Text color" }, "C"),
      ),
    );

    expect(document.querySelector("button")).not.toHaveAttribute("title");
  });

  it("keeps native title on the trigger when disabled", function keepNativeTitleWhenDisabled() {
    render(
      createElement(
        Tooltip,
        { content: "Text color", disabled: true },
        createElement("button", { type: "button", title: "Text color" }, "C"),
      ),
    );

    expect(document.querySelector("button")).toHaveAttribute("title", "Text color");
  });

  it("flips tooltip below when trigger is near top of viewport", async function flipsBelow() {
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return 35; } });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return 100; } });

    try {
      render(
        createElement(
          Tooltip,
          { content: "Reposition" },
          createElement("button", { type: "button" }, "↕"),
        ),
      );

      const root = document.querySelector(".airo-tooltip-root")!;
      vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
        top: 16,
        bottom: 56,
        left: 100,
        right: 140,
        width: 40,
        height: 40,
        x: 100,
        y: 16,
        toJSON: () => ({}),
      });

      fireEvent.mouseEnter(root);
      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
      });

      const bubble = document.querySelector(".airo-tooltip-bubble");
      expect(bubble).not.toBeNull();
      expect(bubble?.getAttribute("data-placement")).toBe("below");
    } finally {
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
      else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
      else Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
    }
  });

  it("places tooltip above when trigger has sufficient space", async function staysAbove() {
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return 35; } });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return 80; } });

    try {
      render(
        createElement(
          Tooltip,
          { content: "Delete" },
          createElement("button", { type: "button" }, "🗑"),
        ),
      );

      const root = document.querySelector(".airo-tooltip-root")!;
      vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
        top: 300,
        bottom: 340,
        left: 100,
        right: 140,
        width: 40,
        height: 40,
        x: 100,
        y: 300,
        toJSON: () => ({}),
      });

      fireEvent.mouseEnter(root);
      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
      });

      const bubble = document.querySelector(".airo-tooltip-bubble");
      expect(bubble).not.toBeNull();
      expect(bubble?.getAttribute("data-placement")).toBe("above");
    } finally {
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
      else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
      else Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
    }
  });

  it("portals bubble into the dev-tools root when present", async function portalIntoDevToolsRoot() {
    const devToolsRoot = document.createElement("div");
    devToolsRoot.id = "airo-dev-tools-injected";
    document.body.appendChild(devToolsRoot);

    try {
      render(
        createElement(
          Tooltip,
          { content: "Decrease text size" },
          createElement("button", { type: "button" }, "−"),
        ),
      );

      fireEvent.mouseEnter(document.querySelector(".airo-tooltip-root")!);
      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
      });

      // Bubble must live inside the dev-tools root so its z-index can stack
      // above the HoverBar (10000) without competing with the root's max
      // z-index from outside.
      const bubble = devToolsRoot.querySelector(".airo-tooltip-bubble");
      expect(bubble).not.toBeNull();
      expect(bubble?.parentElement).toBe(devToolsRoot);
    } finally {
      devToolsRoot.remove();
    }
  });
});
