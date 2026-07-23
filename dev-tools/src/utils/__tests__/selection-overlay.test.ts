/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  endMediaReplaceSession,
  setMediaReplaceLockedElement,
  startMediaReplaceSession,
} from "../media-replace-session";
import {
  clearSelectionOverlay,
  showSelectionOverlay,
  updateSelectionOverlay,
} from "../selection-overlay";

describe("selection-overlay", function packageTests() {
  let container: HTMLDivElement;

  beforeEach(function setup() {
    container = document.createElement("div");
    document.body.appendChild(container);
    endMediaReplaceSession();
    clearSelectionOverlay({ force: true });
  });

  afterEach(function teardown() {
    endMediaReplaceSession();
    clearSelectionOverlay({ force: true });
    container.remove();
  });

  describe("#clearSelectionOverlay session re-pin", function rePinTests() {
    it("recreates the overlay when missing during an active replace session", function rePinMissing() {
      const img = document.createElement("img");
      container.appendChild(img);
      startMediaReplaceSession(img);
      setMediaReplaceLockedElement(img);

      expect(document.getElementById("ai-select-overlay")).toBeNull();
      clearSelectionOverlay();
      expect(document.getElementById("ai-select-overlay")).toBeTruthy();
      expect(img.getAttribute("data-ai-selected")).toBe("true");
    });

    it("repositions an existing overlay to the locked element", function rePinExisting() {
      const img = document.createElement("img");
      img.style.width = "200px";
      img.style.height = "100px";
      container.appendChild(img);
      startMediaReplaceSession(img);
      showSelectionOverlay(img);

      const overlay = document.getElementById("ai-select-overlay");
      expect(overlay).toBeTruthy();
      if (!overlay) return;
      overlay.style.top = "0px";
      overlay.style.left = "0px";
      overlay.style.width = "1px";
      overlay.style.height = "1px";

      clearSelectionOverlay();
      expect(document.getElementById("ai-select-overlay")).toBe(overlay);
      expect(overlay.style.width).not.toBe("1px");
      expect(overlay.style.height).not.toBe("1px");
      expect(img.getAttribute("data-ai-selected")).toBe("true");
    });
  });

  describe("#updateSelectionOverlay", function updateTests() {
    it("re-pins the locked element when data-ai-selected node is gone", function updateRepin() {
      const img = document.createElement("img");
      container.appendChild(img);
      startMediaReplaceSession(img);
      showSelectionOverlay(img);
      img.removeAttribute("data-ai-selected");

      updateSelectionOverlay();
      expect(img.getAttribute("data-ai-selected")).toBe("true");
      expect(document.getElementById("ai-select-overlay")).toBeTruthy();
    });

    it("recreates overlay via showSelectionOverlay when overlay node is missing", function updateMissingOverlay() {
      const img = document.createElement("img");
      container.appendChild(img);
      startMediaReplaceSession(img);
      setMediaReplaceLockedElement(img);
      img.setAttribute("data-ai-selected", "true");

      updateSelectionOverlay();
      expect(document.getElementById("ai-select-overlay")).toBeTruthy();
    });
  });
});
