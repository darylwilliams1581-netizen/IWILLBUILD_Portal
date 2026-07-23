/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleMediaReplaceParentMessage } from "../media-replace-messages";
import {
  discardMediaSlotPreviewStash,
  hasMediaSlotPreviewStash,
} from "../media-slot-preview";
import {
  endMediaReplaceSession,
  isMediaReplaceSessionActive,
} from "../media-replace-session";
import { clearSelectionOverlay } from "../selection-overlay";

describe("media-replace-messages", function packageTests() {
  let container: HTMLDivElement;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(function setup() {
    container = document.createElement("div");
    document.body.appendChild(container);
    endMediaReplaceSession();
    discardMediaSlotPreviewStash();
    clearSelectionOverlay({ force: true });
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(function teardown() {
    warnSpy.mockRestore();
    endMediaReplaceSession();
    discardMediaSlotPreviewStash();
    clearSelectionOverlay({ force: true });
    container.remove();
  });

  describe("#handleMediaReplaceParentMessage", function handlerTests() {
    it("applies PREVIEW_MEDIA_SLOT and reverts via REVERT_MEDIA_SLOT", function previewAndRevert() {
      const slotPath = "pages/home/hero";
      const img = document.createElement("img");
      img.src = `/airo-assets/images/${slotPath}`;
      container.appendChild(img);

      expect(
        handleMediaReplaceParentMessage({
          type: "PREVIEW_MEDIA_SLOT",
          slotPath,
          previewUrl: "https://cdn.example.com/preview.jpg",
        }),
      ).toBe(true);
      expect(img.src).toContain("cdn.example.com/preview.jpg");
      expect(hasMediaSlotPreviewStash()).toBe(true);

      expect(handleMediaReplaceParentMessage({ type: "REVERT_MEDIA_SLOT" })).toBe(true);
      expect(hasMediaSlotPreviewStash()).toBe(false);
      expect(img.src).toContain(slotPath);
    });

    it("propagates isVideo through PREVIEW_MEDIA_SLOT for img→video", function previewImgToVideo() {
      const slotPath = "pages/home/hero";
      const img = document.createElement("img");
      img.src = `/airo-assets/images/${slotPath}`;
      container.appendChild(img);

      expect(
        handleMediaReplaceParentMessage({
          type: "PREVIEW_MEDIA_SLOT",
          slotPath,
          previewUrl: "https://cdn.example.com/clip.mp4",
          isVideo: true,
        }),
      ).toBe(true);
      expect(img.style.display).toBe("none");
      expect(img.src).toContain(slotPath);
      const video = container.querySelector("video");
      expect(video?.src).toContain("cdn.example.com/clip.mp4");
      expect(video?.getAttribute("data-airo-media-preview")).toBe("video");

      expect(handleMediaReplaceParentMessage({ type: "REVERT_MEDIA_SLOT" })).toBe(true);
      expect(container.querySelector("video")).toBeNull();
      expect(img.style.display).toBe("");
    });

    it("propagates isVideo:false through PREVIEW_MEDIA_SLOT for video→img", function previewVideoToImg() {
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
        handleMediaReplaceParentMessage({
          type: "PREVIEW_MEDIA_SLOT",
          slotPath,
          previewUrl: "https://cdn.example.com/photo.jpg",
          occurrenceIndex: 1,
          isVideo: false,
        }),
      ).toBe(true);
      expect(video.style.display).toBe("none");
      expect(img.style.display).toBe("");
      expect(img.src).toContain("cdn.example.com/photo.jpg");

      expect(handleMediaReplaceParentMessage({ type: "REVERT_MEDIA_SLOT" })).toBe(true);
      expect(video.style.display).toBe("");
      expect(img.style.display).toBe("none");
    });

    it("warns when PREVIEW_MEDIA_SLOT finds no DOM match", function previewMiss() {
      expect(
        handleMediaReplaceParentMessage({
          type: "PREVIEW_MEDIA_SLOT",
          slotPath: "pages/missing/slot",
          previewUrl: "https://cdn.example.com/preview.jpg",
        }),
      ).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        "[DevTools] PREVIEW_MEDIA_SLOT: no DOM match for slot",
        expect.objectContaining({ slotPath: "pages/missing/slot" }),
      );
    });

    it("starts and ends a replace session with overlay pin", function sessionLifecycle() {
      const slotPath = "pages/home/hero";
      const img = document.createElement("img");
      img.src = `/airo-assets/images/${slotPath}`;
      container.appendChild(img);

      expect(
        handleMediaReplaceParentMessage({
          type: "MEDIA_REPLACE_SESSION_START",
          slotPath,
          occurrenceIndex: 0,
        }),
      ).toBe(true);
      expect(isMediaReplaceSessionActive()).toBe(true);
      expect(document.getElementById("ai-select-overlay")).toBeTruthy();

      expect(handleMediaReplaceParentMessage({ type: "MEDIA_REPLACE_SESSION_END" })).toBe(true);
      expect(isMediaReplaceSessionActive()).toBe(false);
      expect(document.getElementById("ai-select-overlay")).toBeNull();
    });

    it("warns when MEDIA_REPLACE_SESSION_START finds no DOM match", function sessionMiss() {
      expect(
        handleMediaReplaceParentMessage({
          type: "MEDIA_REPLACE_SESSION_START",
          slotPath: "pages/missing/slot",
        }),
      ).toBe(true);
      expect(isMediaReplaceSessionActive()).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        "[DevTools] MEDIA_REPLACE_SESSION_START: no DOM match for slot",
        expect.objectContaining({ slotPath: "pages/missing/slot" }),
      );
    });

    it("returns false for unknown and mistyped message types", function unknown() {
      expect(handleMediaReplaceParentMessage({ type: "PREVIEW_THEME" })).toBe(false);
      expect(handleMediaReplaceParentMessage({ type: "PREVEW_MEDIA_SLOT" })).toBe(false);
    });
  });
});
