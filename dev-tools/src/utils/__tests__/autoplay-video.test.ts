/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BG_VIDEO_FILL_STYLE,
  configureAutoplayVideo,
  prepareBackgroundVideoHost,
  restoreBackgroundVideoHost,
} from "../autoplay-video";

function mockVideo(options?: {
  readyState?: number;
  connected?: boolean;
  playImpl?: () => Promise<void>;
}): { video: HTMLVideoElement; play: ReturnType<typeof vi.fn> } {
  const video: HTMLVideoElement = document.createElement("video");
  const play = vi.fn(
    options?.playImpl ??
      function resolvePlay(): Promise<void> {
        return Promise.resolve();
      },
  );
  video.play = play;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    get: function getReadyState(): number {
      return options?.readyState ?? HTMLMediaElement.HAVE_NOTHING;
    },
  });
  if (options?.connected !== false) {
    document.body.appendChild(video);
  }
  return { video, play };
}

describe("autoplay-video", function autoplayVideoTests() {
  afterEach(function cleanup() {
    document.body.replaceChildren();
  });

  describe("#configureAutoplayVideo", function configureTests() {
    it("sets muted/playsinline attributes before playback kick", function attrs() {
      const { video } = mockVideo({ connected: false });

      configureAutoplayVideo(video);

      expect(video.muted).toBe(true);
      expect(video.defaultMuted).toBe(true);
      expect(video.autoplay).toBe(true);
      expect(video.loop).toBe(true);
      expect(video.playsInline).toBe(true);
      expect(video.preload).toBe("auto");
      expect(video.getAttribute("muted")).toBe("");
      expect(video.getAttribute("playsinline")).toBe("");
      expect(video.getAttribute("webkit-playsinline")).toBe("");
    });

    it("kicks play immediately when connected with HAVE_CURRENT_DATA", function ready() {
      const { video, play } = mockVideo({
        readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
      });

      configureAutoplayVideo(video);

      expect(play).toHaveBeenCalledTimes(1);
    });

    it("kicks play immediately and again on loadeddata when not yet ready", function notReady() {
      const { video, play } = mockVideo({
        readyState: HTMLMediaElement.HAVE_NOTHING,
      });

      configureAutoplayVideo(video);

      expect(play).toHaveBeenCalledTimes(1);

      video.dispatchEvent(new Event("loadeddata"));

      expect(play).toHaveBeenCalledTimes(2);
    });

    it("kicks play via requestAnimationFrame when disconnected", async function disconnected() {
      const { video, play } = mockVideo({ connected: false });

      configureAutoplayVideo(video);

      expect(play).not.toHaveBeenCalled();
      await new Promise<void>(function waitFrame(resolve) {
        requestAnimationFrame(function onFrame() {
          resolve();
        });
      });
      expect(play).toHaveBeenCalledTimes(1);
    });

    it("swallows rejected play() without throwing", async function rejectedPlay() {
      const { video, play } = mockVideo({
        readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
        playImpl: function rejectPlay(): Promise<void> {
          return Promise.reject(new Error("NotAllowedError"));
        },
      });

      expect(function configure(): void {
        configureAutoplayVideo(video);
      }).not.toThrow();
      expect(play).toHaveBeenCalledTimes(1);

      // Flush the rejection handled by ignoreAutoplayBlock — must not surface
      await expect(Promise.resolve()).resolves.toBeUndefined();
    });
  });

  describe("#prepareBackgroundVideoHost / #restoreBackgroundVideoHost", function hostTests() {
    it("clears opaque host background for Safari z-index:-1 videos", function clearBg() {
      const el = document.createElement("div");
      el.style.backgroundColor = "rgb(0, 0, 0)";
      document.body.appendChild(el);

      prepareBackgroundVideoHost(el);

      expect(el.getAttribute("data-airo-bg-video-clear-bg")).toBe("true");
      expect(el.style.getPropertyValue("background-color")).toBe("transparent");
      expect(el.style.getPropertyPriority("background-color")).toBe("important");
      expect(BG_VIDEO_FILL_STYLE).toContain("z-index:-1");

      restoreBackgroundVideoHost(el);

      expect(el.getAttribute("data-airo-bg-video-clear-bg")).toBeNull();
      expect(el.style.getPropertyValue("background-color")).toBe("");
    });

    it("positions static hosts so absolute fill video can cover", function position() {
      const el = document.createElement("div");
      document.body.appendChild(el);

      prepareBackgroundVideoHost(el);

      expect(el.style.position).toBe("relative");
    });
  });
});
