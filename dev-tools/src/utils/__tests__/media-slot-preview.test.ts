/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  endMediaReplaceSession,
  getMediaReplaceLockedElement,
  isMediaReplaceSessionActive,
  setMediaReplaceLockedElement,
  startMediaReplaceSession,
} from "../media-replace-session";
import {
  discardMediaSlotPreviewStash,
  hasMediaSlotPreviewStash,
  previewMediaSlot,
  revertMediaSlotPreview,
} from "../media-slot-preview";
import { clearSelectionOverlay } from "../selection-overlay";

describe("media-slot-preview", function packageTests() {
  let container: HTMLDivElement;

  beforeEach(function setup() {
    container = document.createElement("div");
    document.body.appendChild(container);
    endMediaReplaceSession();
    discardMediaSlotPreviewStash();
    clearSelectionOverlay({ force: true });
  });

  afterEach(function teardown() {
    endMediaReplaceSession();
    discardMediaSlotPreviewStash();
    clearSelectionOverlay({ force: true });
    container.remove();
  });

  describe("#previewMediaSlot", function previewTests() {
    it("sets img src to previewUrl and stashes the original", function previewImg() {
      const slotPath = "pages/home/hero";
      const img = document.createElement("img");
      img.src = `/airo-assets/images/${slotPath}`;
      container.appendChild(img);

      const ok = previewMediaSlot(slotPath, "https://cdn.example.com/preview.jpg");
      expect(ok).toBe(true);
      expect(hasMediaSlotPreviewStash()).toBe(true);
      expect(img.src).toContain("cdn.example.com/preview.jpg");
    });

    it("restores original src on revert", function revertImg() {
      const slotPath = "pages/home/hero";
      const original = `/airo-assets/images/${slotPath}`;
      const img = document.createElement("img");
      img.src = original;
      container.appendChild(img);

      previewMediaSlot(slotPath, "https://cdn.example.com/preview.jpg");
      revertMediaSlotPreview();
      expect(hasMediaSlotPreviewStash()).toBe(false);
      expect(img.getAttribute("src") || img.src).toContain(slotPath);
    });

    it("skips src restore when original was unresolved", function skipNullSrc() {
      const slotPath = "pages/home/hero";
      const video = document.createElement("video");
      video.setAttribute("data-slot", slotPath);
      video.load = vi.fn();
      container.appendChild(video);

      expect(
        previewMediaSlot(slotPath, "https://cdn.example.com/preview.mp4", { isVideo: true }),
      ).toBe(true);
      revertMediaSlotPreview();
      // originalSrc was null — leave the preview src rather than blanking
      expect(video.src).toContain("cdn.example.com/preview.mp4");
    });

    it("targets occurrenceIndex among multiple matches", function occurrence() {
      const slotPath = "pages/home/hero";
      for (let i = 0; i < 3; i++) {
        const img = document.createElement("img");
        img.src = `/airo-assets/images/${slotPath}`;
        container.appendChild(img);
      }

      previewMediaSlot(slotPath, "https://cdn.example.com/second.jpg", { occurrenceIndex: 1 });
      const imgs = container.querySelectorAll("img");
      expect(imgs[1]?.src).toContain("cdn.example.com/second.jpg");
      expect(imgs[0]?.src).not.toContain("cdn.example.com/second.jpg");
    });

    it("clears inline backgroundImage on revert when none was set", function revertBgNoInline() {
      const slotPath = "pages/home/hero";
      const el = document.createElement("div");
      el.setAttribute("data-airo-video-bg-patched", slotPath);
      container.appendChild(el);

      previewMediaSlot(slotPath, "https://cdn.example.com/preview.jpg");
      expect(el.style.backgroundImage).toContain("cdn.example.com/preview.jpg");
      expect(el.style.backgroundSize).toBe("cover");
      expect(el.style.backgroundPosition).toContain("center");
      expect(el.style.backgroundRepeat).toBe("no-repeat");
      revertMediaSlotPreview();
      expect(el.style.backgroundImage).toBe("");
      expect(el.style.backgroundSize).toBe("");
      expect(el.style.backgroundPosition).toBe("");
      expect(el.style.backgroundRepeat).toBe("");
    });

    it("restores prior inline background styles on revert", function revertBgInline() {
      const slotPath = "pages/home/hero";
      const el = document.createElement("div");
      el.setAttribute("data-airo-video-bg-patched", slotPath);
      el.style.backgroundImage = `url("/airo-assets/images/${slotPath}")`;
      el.style.backgroundSize = "contain";
      el.style.backgroundPosition = "left top";
      el.style.backgroundRepeat = "repeat";
      container.appendChild(el);

      previewMediaSlot(slotPath, "https://cdn.example.com/preview.jpg");
      expect(el.style.backgroundSize).toBe("cover");
      revertMediaSlotPreview();
      expect(el.style.backgroundImage).toContain(slotPath);
      expect(el.style.backgroundImage).not.toContain("cdn.example.com");
      expect(el.style.backgroundSize).toBe("contain");
      expect(el.style.backgroundPosition).toBe("left top");
      expect(el.style.backgroundRepeat).toBe("repeat");
    });

    it("rejects unsafe background previewUrl schemes", function rejectUnsafeBgUrl() {
      const slotPath = "pages/home/hero";
      const el = document.createElement("div");
      el.setAttribute("data-airo-video-bg-patched", slotPath);
      container.appendChild(el);
      const warn = vi.spyOn(console, "warn").mockImplementation(function noop() {});

      expect(previewMediaSlot(slotPath, 'javascript:alert(1)')).toBe(false);
      expect(el.style.backgroundImage).toBe("");
      expect(warn).toHaveBeenCalledWith(
        "[DevTools] previewMediaSlot: rejected background previewUrl",
        expect.objectContaining({ slotPath }),
      );
      warn.mockRestore();
    });

    it("escapes quotes in background previewUrl for CSS url()", function escapeBgUrl() {
      const slotPath = "pages/home/hero";
      const el = document.createElement("div");
      el.setAttribute("data-airo-video-bg-patched", slotPath);
      container.appendChild(el);

      expect(
        previewMediaSlot(slotPath, 'https://cdn.example.com/a"b).jpg'),
      ).toBe(true);
      // URL() percent-encodes " → %22; value stays a single quoted url("...")
      expect(el.style.backgroundImage).toContain("%22");
      expect(el.style.backgroundImage).not.toMatch(/url\("[^"]*"[^)]/);
      expect(el.style.backgroundImage.startsWith('url("')).toBe(true);
      expect(el.style.backgroundImage.endsWith('")')).toBe(true);
    });

    it("previews and reverts video src", function previewVideo() {
      const slotPath = "pages/home/hero";
      const video = document.createElement("video");
      video.src = `/airo-assets/videos/${slotPath}`;
      video.load = vi.fn();
      container.appendChild(video);

      expect(previewMediaSlot(slotPath, "https://cdn.example.com/preview.mp4", { isVideo: true })).toBe(true);
      expect(video.src).toContain("cdn.example.com/preview.mp4");
      revertMediaSlotPreview();
      expect(video.src).toContain(slotPath);
      expect(video.load).toHaveBeenCalled();
    });

    it("returns false and clears stash when reverting a detached element", function revertDetached() {
      const slotPath = "pages/home/hero";
      const img = document.createElement("img");
      img.src = `/airo-assets/images/${slotPath}`;
      container.appendChild(img);
      const warn = vi.spyOn(console, "warn").mockImplementation(function noop() {});

      previewMediaSlot(slotPath, "https://cdn.example.com/preview.jpg");
      img.remove();
      expect(revertMediaSlotPreview()).toBe(false);
      expect(hasMediaSlotPreviewStash()).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        "[DevTools] revertMediaSlotPreview: stash present but anchor detached",
        expect.objectContaining({ slotPath, kind: "img" }),
      );
      warn.mockRestore();
    });

    it("previews video onto an img by inserting a provisional video", function imgToVideo() {
      const slotPath = "pages/home/hero";
      const img = document.createElement("img");
      img.src = `/airo-assets/images/${slotPath}`;
      container.appendChild(img);

      expect(
        previewMediaSlot(slotPath, "https://cdn.example.com/clip.mp4", { isVideo: true }),
      ).toBe(true);
      expect(img.style.display).toBe("none");
      const video = container.querySelector("video");
      expect(video).toBeTruthy();
      expect(video?.src).toContain("cdn.example.com/clip.mp4");
      expect(video?.getAttribute("data-airo-media-preview")).toBe("video");

      revertMediaSlotPreview();
      expect(container.querySelector("video")).toBeNull();
      expect(img.style.display).toBe("");
      expect(img.src).toContain(slotPath);
    });

    it("previews image onto a video with a patched img sibling", function videoToImg() {
      const slotPath = "pages/home/hero";
      const img = document.createElement("img");
      img.src = `/airo-assets/images/${slotPath}`;
      img.style.display = "none";
      img.setAttribute("data-airo-video-patched", "true");
      const video = document.createElement("video");
      video.src = `/airo-assets/videos/${slotPath}`;
      video.setAttribute("data-airo-video", "");
      video.setAttribute("data-slot", slotPath);
      video.load = vi.fn();
      container.appendChild(img);
      container.appendChild(video);

      expect(
        previewMediaSlot(slotPath, "https://cdn.example.com/photo.jpg", {
          occurrenceIndex: 1,
          isVideo: false,
        }),
      ).toBe(true);
      expect(video.style.display).toBe("none");
      expect(img.style.display).toBe("");
      expect(img.getAttribute("data-airo-video-patched")).toBe("true");
      expect(img.src).toContain("cdn.example.com/photo.jpg");

      revertMediaSlotPreview();
      expect(video.style.display).toBe("");
      expect(img.style.display).toBe("none");
      expect(img.getAttribute("data-airo-video-patched")).toBe("true");
      expect(img.src).toContain(slotPath);
    });

    it("previews video onto a background host", function bgToVideo() {
      const slotPath = "pages/home/hero";
      const el = document.createElement("div");
      el.setAttribute("data-airo-video-bg-patched", slotPath);
      el.style.backgroundImage = `url("/airo-assets/images/${slotPath}")`;
      container.appendChild(el);

      expect(
        previewMediaSlot(slotPath, "https://cdn.example.com/clip.mp4", { isVideo: true }),
      ).toBe(true);
      expect(el.style.backgroundImage).toBe("none");
      expect(el.getAttribute("data-airo-bg-video-clear-bg")).toBe("true");
      const video = el.querySelector("video");
      expect(video?.src).toContain("cdn.example.com/clip.mp4");
      expect(video?.getAttribute("playsinline")).toBe("");
      expect(video?.getAttribute("muted")).toBe("");

      revertMediaSlotPreview();
      expect(el.querySelector("video")).toBeNull();
      expect(el.getAttribute("data-airo-bg-video-clear-bg")).toBeNull();
      expect(el.style.backgroundImage).toContain(slotPath);
    });

    it("keeps Safari host transparency when reverting over a committed bg video", function bgToVideoOverCommitted() {
      const slotPath = "pages/home/hero";
      const el = document.createElement("div");
      el.setAttribute("data-airo-video-bg-patched", slotPath);
      el.style.backgroundImage = "none";
      el.style.setProperty("background-color", "transparent", "important");
      el.setAttribute("data-airo-bg-video-clear-bg", "true");
      const committed = document.createElement("video");
      committed.setAttribute("data-airo-bg-video", "");
      committed.src = "https://cdn.example.com/committed.mp4";
      el.appendChild(committed);
      container.appendChild(el);

      expect(
        previewMediaSlot(slotPath, "https://cdn.example.com/preview.mp4", { isVideo: true }),
      ).toBe(true);
      expect(committed.style.display).toBe("none");
      expect(el.querySelectorAll("video").length).toBe(2);

      revertMediaSlotPreview();
      expect(el.querySelectorAll("video").length).toBe(1);
      expect(committed.style.display).toBe("");
      expect(el.getAttribute("data-airo-bg-video-clear-bg")).toBe("true");
      expect(el.style.getPropertyValue("background-color")).toBe("transparent");
    });
  });

  describe("media replace session selection lock", function sessionTests() {
    it("ignores clearSelectionOverlay while session is active", function stickyOverlay() {
      const img = document.createElement("img");
      img.src = "/airo-assets/images/pages/home/hero";
      container.appendChild(img);
      startMediaReplaceSession(img);
      setMediaReplaceLockedElement(img);
      img.setAttribute("data-ai-selected", "true");
      const overlay = document.createElement("div");
      overlay.id = "ai-select-overlay";
      document.body.appendChild(overlay);

      clearSelectionOverlay();
      expect(document.getElementById("ai-select-overlay")).toBeTruthy();
      expect(isMediaReplaceSessionActive()).toBe(true);
      expect(getMediaReplaceLockedElement()).toBe(img);

      clearSelectionOverlay({ force: true });
      expect(document.getElementById("ai-select-overlay")).toBeNull();
    });

    it("ends session and clears lock", function endSession() {
      const img = document.createElement("img");
      container.appendChild(img);
      startMediaReplaceSession(img);
      endMediaReplaceSession();
      expect(isMediaReplaceSessionActive()).toBe(false);
      expect(getMediaReplaceLockedElement()).toBeNull();
    });
  });
});
