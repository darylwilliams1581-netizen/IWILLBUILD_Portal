// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendSpy = vi.fn();
vi.mock("../eventBus", () => ({
  send: (...args: unknown[]) => sendSpy(...args),
}));

import { trySaveContentEdit } from "../save-text-edit";

function el(attrs: Record<string, string> = {}): HTMLElement {
  const node = document.createElement("span");
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

describe("trySaveContentEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendSpy.mockClear();
  });

  it("sends CONTENT_UPDATED and returns the target for a content-backed element", () => {
    const element = el({ "data-dev-content-key": "home.ticker[0].text" });

    const result = trySaveContentEdit(element, "Old", "New");

    expect(result?.contentTarget.key).toBe("home.ticker[0].text");
    expect(result?.contentTarget.kind).toBe("copy");
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [payload] = sendSpy.mock.calls[0] as [{ type: string; data: { contentKey: string; oldText: string; newText: string } }];
    expect(payload.type).toBe("CONTENT_UPDATED");
    expect(payload.data.contentKey).toBe("home.ticker[0].text");
    expect(payload.data.oldText).toBe("Old");
    expect(payload.data.newText).toBe("New");
  });

  it("respects the richText kind attribute", () => {
    const element = el({
      "data-dev-content-key": "home.hero.title",
      "data-dev-content-kind": "richText",
    });

    const result = trySaveContentEdit(element, "Old title", "New title");

    expect(result?.contentTarget.kind).toBe("richText");
  });

  it("returns null and sends nothing for a non-content-backed element", () => {
    const element = el();

    const result = trySaveContentEdit(element, "Old", "New");

    expect(result).toBeNull();
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
