// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { buildContentUpdatePayload } from "../content-edit-payload";
import { resolveContentKeyWithElement } from "../element-detection";

function el(attrs: Record<string, string> = {}): HTMLElement {
  const node = document.createElement("span");
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

describe("buildContentUpdatePayload", () => {
  const target = { key: "home.stats[0].value", kind: "copy" as const };

  it("includes expectedCurrent (the original text) for a derived node", () => {
    const payload = buildContentUpdatePayload(
      el({ "data-dev-content-derived": "true" }),
      target,
      "124,000+",
      "200,000+",
    );
    expect(payload.expectedCurrent).toBe("124,000+");
    // guard engages against the text the user started from, NOT the new text
    expect(payload.expectedCurrent).not.toBe("200,000+");
  });

  it("omits expectedCurrent entirely for a non-derived node", () => {
    const payload = buildContentUpdatePayload(el(), target, "Old", "New");
    expect("expectedCurrent" in payload).toBe(false);
  });

  it("treats a missing / non-'true' derived attribute as non-derived", () => {
    const payload = buildContentUpdatePayload(
      el({ "data-dev-content-derived": "false" }),
      target,
      "Old",
      "New",
    );
    expect("expectedCurrent" in payload).toBe(false);
  });

  it("propagates content key, kind, and old/new text", () => {
    const payload = buildContentUpdatePayload(
      el(),
      { key: "home.hero.title", kind: "richText" },
      "Old title",
      "New title",
    );
    expect(payload).toMatchObject({
      contentKey: "home.hero.title",
      kind: "richText",
      oldText: "Old title",
      newText: "New title",
    });
  });

  // The source-mapper only ever places data-dev-content-derived on the keyed
  // leaf (source-mapper/src/index.ts), never on an ancestor. A click on a
  // style/animation wrapper (e.g. <motion.h1><Text as="span" k="…"/></motion.h1>)
  // resolves its content key through that leaf (element-detection's
  // resolveContentKey descendant fallback), so the derived flag must be read
  // from the SAME element the resolution says owns the key — not from
  // whatever element the caller happened to click. These two tests mirror
  // useTextEditing's handleCommit: resolve the content target first, then
  // build the payload from the resolution's source element.
  describe("derived flag follows the resolved source element, not the clicked element", () => {
    it("includes expectedCurrent when the derived, keyed leaf is nested inside the clicked wrapper", () => {
      const wrapper: HTMLElement = document.createElement("div");
      const leaf: HTMLElement = document.createElement("span");
      leaf.setAttribute("data-dev-content-key", "home.stats[0].value");
      leaf.setAttribute("data-dev-content-derived", "true");
      leaf.textContent = "124,000+";
      wrapper.appendChild(leaf);

      const contentTarget = resolveContentKeyWithElement(wrapper);
      expect(contentTarget).not.toBeNull();

      // Mirrors handleCommit: build the payload from whichever element the
      // resolution says actually owns the key, not the clicked wrapper.
      const payload = buildContentUpdatePayload(contentTarget!.element, contentTarget!, "124,000+", "200,000+");

      expect(payload.expectedCurrent).toBe("124,000+");
    });

    it("still includes expectedCurrent when the clicked element is itself the derived leaf", () => {
      const leaf: HTMLElement = el({
        "data-dev-content-key": "home.stats[0].value",
        "data-dev-content-derived": "true",
      });
      leaf.textContent = "124,000+";

      const contentTarget = resolveContentKeyWithElement(leaf);
      expect(contentTarget).not.toBeNull();

      const payload = buildContentUpdatePayload(contentTarget!.element, contentTarget!, "124,000+", "200,000+");

      expect(payload.expectedCurrent).toBe("124,000+");
    });
  });
});
