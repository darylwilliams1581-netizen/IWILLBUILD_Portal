/**
 * Safari-safe autoplay video setup for media-slot patching.
 *
 * Safari quirks this addresses:
 * 1. `muted` / `playsinline` must be HTML attributes (not only JS properties),
 *    and preferably set before `src`, or autoplay is blocked and the first
 *    frame never paints (blank/black box).
 * 2. Explicit `play()` is often required to show frames even when muted.
 * 3. Background fill videos using `z-index: -1` paint *behind the host element's
 *    own background* in Safari — clear the host background-color while the
 *    video is active so the media is visible on dark cards.
 */

/** Absolute fill style for background-slot videos (kept behind in-flow content). */
export const BG_VIDEO_FILL_STYLE: string =
  "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;"

const CLEAR_BG_ATTR = "data-airo-bg-video-clear-bg"

/**
 * Configure a video for muted autoplay. Call before or immediately after setting
 * `src`. Always kicks `play()` — immediately when connected (and again on
 * `loadeddata` when not yet ready), or on the next animation frame when detached.
 *
 * Keep in lockstep with public/airo-video-slots.js configureAutoplayVideo
 * (see airo-video-slots-parity.test.ts).
 */
export function configureAutoplayVideo(video: HTMLVideoElement): void {
  video.muted = true
  video.defaultMuted = true
  video.autoplay = true
  video.loop = true
  video.playsInline = true
  video.preload = "auto"
  video.setAttribute("muted", "")
  video.setAttribute("playsinline", "")
  video.setAttribute("webkit-playsinline", "")

  const kick = function kickPlay(): void {
    const playResult: Promise<void> | undefined = video.play() as Promise<void> | undefined
    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch(function ignoreAutoplayBlock(): void {
        // Autoplay may still be blocked (Low Power Mode, etc.) — first frame
        // from preload=auto is the best we can do without user gesture.
      })
    }
  }

  if (video.isConnected) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      kick()
    } else {
      video.addEventListener("loadeddata", kick, { once: true })
      // Also try immediately — Safari sometimes needs the call before loadeddata
      kick()
    }
  } else {
    requestAnimationFrame(kick)
  }
}

/**
 * Prepare a background-image host so a z-index:-1 fill video is visible on Safari.
 * Clears opaque background-color (Tailwind `bg-*` included via !important).
 */
export function prepareBackgroundVideoHost(el: HTMLElement): void {
  const pos: string = window.getComputedStyle(el).position
  if (pos === "static") {
    el.style.position = "relative"
  }
  el.style.setProperty("background-color", "transparent", "important")
  el.setAttribute(CLEAR_BG_ATTR, "true")
}

/** Undo prepareBackgroundVideoHost when the fill video is removed. */
export function restoreBackgroundVideoHost(el: HTMLElement): void {
  if (!el.getAttribute(CLEAR_BG_ATTR)) {
    return
  }
  el.style.removeProperty("background-color")
  el.removeAttribute(CLEAR_BG_ATTR)
}
