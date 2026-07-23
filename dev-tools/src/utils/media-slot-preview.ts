import {
  BG_VIDEO_FILL_STYLE,
  configureAutoplayVideo,
  prepareBackgroundVideoHost,
  restoreBackgroundVideoHost,
} from "./autoplay-video";
import { setMediaReplaceLockedElement } from "./media-replace-session";
import { collectMediaSlotDomMatches } from "./media-slot-dom";
import { showSelectionOverlay, updateSelectionOverlay } from "./selection-overlay";

/** Marks provisional preview nodes so MutationObserver media patching ignores them. */
const PREVIEW_ATTR = "data-airo-media-preview";

interface PreviewStashBase {
  slotPath: string
  occurrenceIndex: number
}

type PreviewStash =
  | (PreviewStashBase & {
      kind: "img"
      element: HTMLImageElement
      /** null when the slot had no resolvable src — revert skips rather than blanking. */
      originalSrc: string | null
    })
  | (PreviewStashBase & {
      kind: "video"
      element: HTMLVideoElement
      originalSrc: string | null
    })
  | (PreviewStashBase & {
      kind: "background"
      element: HTMLElement
      originalBgImage: string | null
      originalBgSize: string | null
      originalBgPosition: string | null
      originalBgRepeat: string | null
      hiddenBgVideo: HTMLVideoElement | null
      hiddenBgVideoDisplay: string
    })
  | (PreviewStashBase & {
      kind: "img-to-video"
      element: HTMLImageElement
      variant: "reuse-committed"
      reusedVideo: HTMLVideoElement
      reusedVideoOriginalSrc: string | null
    })
  | (PreviewStashBase & {
      kind: "img-to-video"
      element: HTMLImageElement
      variant: "insert-provisional"
      insertedVideo: HTMLVideoElement
      imgDisplay: string
    })
  | (PreviewStashBase & {
      kind: "video-to-img"
      element: HTMLElement
      variant: "reveal-patched"
      revealedImg: HTMLImageElement
      revealedImgOriginalSrc: string | null
      hiddenVideo: HTMLVideoElement
      hiddenVideoDisplay: string
      hiddenVideoOriginalSrc: string | null
    })
  | (PreviewStashBase & {
      kind: "video-to-img"
      element: HTMLVideoElement
      variant: "insert-provisional"
      insertedImg: HTMLImageElement
      hiddenVideoDisplay: string
    })
  | (PreviewStashBase & {
      kind: "bg-to-video"
      element: HTMLElement
      originalBgImage: string | null
      originalBgSize: string | null
      originalBgPosition: string | null
      originalBgRepeat: string | null
      insertedVideo: HTMLVideoElement
      hiddenBgVideo: HTMLVideoElement | null
      hiddenBgVideoDisplay: string
    })

let stash: PreviewStash | null = null
let overlayRefreshGeneration: number = 0

function readMediaSrc(el: HTMLImageElement | HTMLVideoElement): string | null {
  return el.src || el.getAttribute("src") || null
}

function restoreMediaSrc(el: HTMLImageElement | HTMLVideoElement, originalSrc: string | null): void {
  if (originalSrc === null) {
    return
  }
  el.src = originalSrc
}

const SAFE_PREVIEW_URL_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:", "blob:"])

/**
 * Build a CSS `background-image` value from a preview URL.
 * Validates scheme and escapes via JSON.stringify so `"`, `\`, and control
 * chars cannot break out of `url("...")` if an untrusted URL is ever routed here.
 */
function toCssBackgroundUrl(previewUrl: string): string | null {
  try {
    const parsed: URL = new URL(previewUrl, window.location.href)
    if (!SAFE_PREVIEW_URL_SCHEMES.has(parsed.protocol)) {
      return null
    }
    return `url(${JSON.stringify(parsed.href)})`
  } catch {
    return null
  }
}

function resolveTarget(slotPath: string, occurrenceIndex: number): HTMLElement | null {
  const matches: HTMLElement[] = collectMediaSlotDomMatches(slotPath)
  if (matches.length === 0) {
    return null
  }
  const targetIndex: number = Math.max(0, Math.min(occurrenceIndex, matches.length - 1))
  return matches[targetIndex] ?? null
}

function restoreInlineBackgroundProperty(
  element: HTMLElement,
  property: string,
  original: string | null,
): void {
  if (original) {
    element.style.setProperty(property, original)
  } else {
    element.style.removeProperty(property)
  }
}

function findCommittedVideoSibling(img: HTMLImageElement): HTMLVideoElement | null {
  const next: Element | null = img.nextElementSibling
  if (next instanceof HTMLVideoElement && next.hasAttribute("data-airo-video")) {
    return next
  }
  return null
}

function findPatchedImgSibling(video: HTMLVideoElement): HTMLImageElement | null {
  const prev: Element | null = video.previousElementSibling
  if (prev instanceof HTMLImageElement && prev.getAttribute("data-airo-video-patched")) {
    return prev
  }
  return null
}

function createPreviewVideo(previewUrl: string, template: HTMLElement): HTMLVideoElement {
  const video: HTMLVideoElement = document.createElement("video")
  video.className = template.className
  video.style.cssText = template.style.cssText
  video.setAttribute(PREVIEW_ATTR, "video")
  configureAutoplayVideo(video)
  video.src = previewUrl
  return video
}

function pinOverlay(element: HTMLElement, previewUrl: string): void {
  setMediaReplaceLockedElement(element)
  showSelectionOverlay(element)
  scheduleOverlayRefresh(element, previewUrl)
}

function scheduleOverlayRefresh(element: HTMLElement, previewUrl: string): void {
  const generation: number = ++overlayRefreshGeneration
  const refresh = function refreshOverlay(): void {
    if (generation !== overlayRefreshGeneration) return
    if (!document.body.contains(element)) return
    updateSelectionOverlay()
  }

  if (element instanceof HTMLImageElement) {
    if (element.complete) {
      requestAnimationFrame(refresh)
    } else {
      element.addEventListener("load", refresh, { once: true })
      element.addEventListener("error", refresh, { once: true })
    }
    return
  }

  if (element instanceof HTMLVideoElement) {
    element.addEventListener("loadeddata", refresh, { once: true })
    element.addEventListener("error", refresh, { once: true })
    return
  }

  const probe: HTMLImageElement = new Image()
  probe.addEventListener("load", refresh, { once: true })
  probe.addEventListener("error", refresh, { once: true })
  probe.src = previewUrl
}

/** True when provisional/revealed nodes may still be restorable after the anchor detaches. */
function hasRecoverablePreviewNodes(current: PreviewStash): boolean {
  switch (current.kind) {
    case "img-to-video":
      return current.variant === "insert-provisional"
    case "video-to-img":
      return true
    case "bg-to-video":
      return true
    case "img":
    case "video":
    case "background":
      return false
    default: {
      const _exhaustive: never = current
      void _exhaustive
      return false
    }
  }
}

/** Discard the global provisional preview stash without restoring the DOM. */
export function discardMediaSlotPreviewStash(): void {
  overlayRefreshGeneration += 1
  stash = null
}

export function hasMediaSlotPreviewStash(): boolean {
  return stash !== null
}

/** Restore DOM from the global provisional preview stash. */
export function revertMediaSlotPreview(): boolean {
  if (!stash) {
    return false
  }

  overlayRefreshGeneration += 1
  const current: PreviewStash = stash
  stash = null

  const anchorAttached: boolean = document.body.contains(current.element)
  if (!anchorAttached && !hasRecoverablePreviewNodes(current)) {
    console.warn("[DevTools] revertMediaSlotPreview: stash present but anchor detached", {
      slotPath: current.slotPath,
      kind: current.kind,
      occurrenceIndex: current.occurrenceIndex,
    })
    return false
  }

  switch (current.kind) {
    case "img": {
      restoreMediaSrc(current.element, current.originalSrc)
      return true
    }
    case "video": {
      restoreMediaSrc(current.element, current.originalSrc)
      current.element.load()
      return true
    }
    case "background": {
      restoreInlineBackgroundProperty(current.element, "background-image", current.originalBgImage)
      restoreInlineBackgroundProperty(current.element, "background-size", current.originalBgSize)
      restoreInlineBackgroundProperty(current.element, "background-position", current.originalBgPosition)
      restoreInlineBackgroundProperty(current.element, "background-repeat", current.originalBgRepeat)
      if (current.hiddenBgVideo) {
        current.hiddenBgVideo.style.display = current.hiddenBgVideoDisplay
      }
      return true
    }
    case "img-to-video": {
      if (current.variant === "reuse-committed") {
        restoreMediaSrc(current.reusedVideo, current.reusedVideoOriginalSrc)
        current.reusedVideo.load()
      } else {
        current.insertedVideo.remove()
        current.element.style.display = current.imgDisplay
      }
      return true
    }
    case "video-to-img": {
      if (current.variant === "reveal-patched") {
        restoreMediaSrc(current.revealedImg, current.revealedImgOriginalSrc)
        current.revealedImg.style.display = "none"
        current.revealedImg.setAttribute("data-airo-video-patched", "true")
        current.hiddenVideo.style.display = current.hiddenVideoDisplay
        restoreMediaSrc(current.hiddenVideo, current.hiddenVideoOriginalSrc)
        if (current.hiddenVideoOriginalSrc !== null) {
          current.hiddenVideo.load()
        }
      } else {
        current.insertedImg.remove()
        current.element.style.display = current.hiddenVideoDisplay
      }
      return true
    }
    case "bg-to-video": {
      current.insertedVideo.remove()
      restoreInlineBackgroundProperty(current.element, "background-image", current.originalBgImage)
      restoreInlineBackgroundProperty(current.element, "background-size", current.originalBgSize)
      restoreInlineBackgroundProperty(current.element, "background-position", current.originalBgPosition)
      restoreInlineBackgroundProperty(current.element, "background-repeat", current.originalBgRepeat)
      if (current.hiddenBgVideo) {
        // Keep Safari host transparency — committed fill video still needs it
        current.hiddenBgVideo.style.display = current.hiddenBgVideoDisplay
      } else {
        restoreBackgroundVideoHost(current.element)
      }
      return true
    }
  }
}

/**
 * Temporarily set a media slot DOM occurrence to previewUrl without touching
 * the media API/manifest. Supports image↔video cross-type swaps. Re-stashing
 * the same slot replaces the prior preview.
 */
export function previewMediaSlot(
  slotPath: string,
  previewUrl: string,
  options?: { occurrenceIndex?: number; isVideo?: boolean },
): boolean {
  if (stash) {
    revertMediaSlotPreview()
  }

  const occurrenceIndex: number = options?.occurrenceIndex ?? 0
  const wantVideo: boolean = !!options?.isVideo
  const target: HTMLElement | null = resolveTarget(slotPath, occurrenceIndex)
  if (!target) {
    return false
  }

  const tag: string = target.tagName.toLowerCase()

  if (tag === "img") {
    const img: HTMLImageElement = target as HTMLImageElement
    const committedVideo: HTMLVideoElement | null = findCommittedVideoSibling(img)

    if (wantVideo) {
      if (committedVideo) {
        stash = {
          kind: "img-to-video",
          variant: "reuse-committed",
          slotPath,
          occurrenceIndex,
          element: img,
          reusedVideo: committedVideo,
          reusedVideoOriginalSrc: readMediaSrc(committedVideo),
        }
        committedVideo.src = previewUrl
        committedVideo.load()
        configureAutoplayVideo(committedVideo)
        pinOverlay(committedVideo, previewUrl)
        return true
      }

      const video: HTMLVideoElement = createPreviewVideo(previewUrl, img)
      if (img.width) video.width = img.width
      if (img.height) video.height = img.height
      stash = {
        kind: "img-to-video",
        variant: "insert-provisional",
        slotPath,
        occurrenceIndex,
        element: img,
        insertedVideo: video,
        imgDisplay: img.style.display,
      }
      img.style.display = "none"
      img.parentNode?.insertBefore(video, img.nextSibling)
      pinOverlay(video, previewUrl)
      return true
    }

    if (committedVideo) {
      stash = {
        kind: "video-to-img",
        variant: "reveal-patched",
        slotPath,
        occurrenceIndex,
        element: img,
        revealedImg: img,
        revealedImgOriginalSrc: readMediaSrc(img),
        hiddenVideo: committedVideo,
        hiddenVideoDisplay: committedVideo.style.display,
        hiddenVideoOriginalSrc: readMediaSrc(committedVideo),
      }
      committedVideo.style.display = "none"
      img.style.display = ""
      // Keep data-airo-video-patched so MutationObserver won't re-insert a video sibling
      img.src = previewUrl
      pinOverlay(img, previewUrl)
      return true
    }

    stash = {
      kind: "img",
      slotPath,
      occurrenceIndex,
      element: img,
      originalSrc: readMediaSrc(img),
    }
    img.src = previewUrl
    pinOverlay(img, previewUrl)
    return true
  }

  if (tag === "video") {
    const video: HTMLVideoElement = target as HTMLVideoElement

    if (wantVideo) {
      stash = {
        kind: "video",
        slotPath,
        occurrenceIndex,
        element: video,
        originalSrc: readMediaSrc(video),
      }
      video.src = previewUrl
      video.load()
      configureAutoplayVideo(video)
      pinOverlay(video, previewUrl)
      return true
    }

    const patchedImg: HTMLImageElement | null = findPatchedImgSibling(video)
    if (patchedImg) {
      stash = {
        kind: "video-to-img",
        variant: "reveal-patched",
        slotPath,
        occurrenceIndex,
        element: video,
        revealedImg: patchedImg,
        revealedImgOriginalSrc: readMediaSrc(patchedImg),
        hiddenVideo: video,
        hiddenVideoDisplay: video.style.display,
        hiddenVideoOriginalSrc: readMediaSrc(video),
      }
      video.style.display = "none"
      patchedImg.style.display = ""
      // Keep data-airo-video-patched so MutationObserver won't re-insert a video sibling
      patchedImg.src = previewUrl
      pinOverlay(patchedImg, previewUrl)
      return true
    }

    const img: HTMLImageElement = document.createElement("img")
    img.src = previewUrl
    img.className = video.className
    img.style.cssText = video.style.cssText
    img.setAttribute(PREVIEW_ATTR, "img")
    stash = {
      kind: "video-to-img",
      variant: "insert-provisional",
      slotPath,
      occurrenceIndex,
      element: video,
      insertedImg: img,
      hiddenVideoDisplay: video.style.display,
    }
    video.style.display = "none"
    video.parentNode?.insertBefore(img, video)
    pinOverlay(img, previewUrl)
    return true
  }

  if (wantVideo) {
    target.querySelector(`video[${PREVIEW_ATTR}="video"]`)?.remove()
    const committedBgVideo: HTMLVideoElement | null = target.querySelector(
      "video[data-airo-bg-video]",
    )
    const video: HTMLVideoElement = document.createElement("video")
    video.setAttribute(PREVIEW_ATTR, "video")
    video.style.cssText = BG_VIDEO_FILL_STYLE
    configureAutoplayVideo(video)
    video.src = previewUrl
    stash = {
      kind: "bg-to-video",
      slotPath,
      occurrenceIndex,
      element: target,
      originalBgImage: target.style.backgroundImage || null,
      originalBgSize: target.style.backgroundSize || null,
      originalBgPosition: target.style.backgroundPosition || null,
      originalBgRepeat: target.style.backgroundRepeat || null,
      insertedVideo: video,
      hiddenBgVideo: committedBgVideo,
      hiddenBgVideoDisplay: committedBgVideo ? committedBgVideo.style.display : "",
    }
    if (committedBgVideo) {
      committedBgVideo.style.display = "none"
    }
    target.style.backgroundImage = "none"
    prepareBackgroundVideoHost(target)
    target.insertBefore(video, target.firstChild)
    pinOverlay(target, previewUrl)
    return true
  }

  const committedBgVideo: HTMLVideoElement | null = target.querySelector(
    "video[data-airo-bg-video]",
  )
  stash = {
    kind: "background",
    slotPath,
    occurrenceIndex,
    element: target,
    originalBgImage: target.style.backgroundImage || null,
    originalBgSize: target.style.backgroundSize || null,
    originalBgPosition: target.style.backgroundPosition || null,
    originalBgRepeat: target.style.backgroundRepeat || null,
    hiddenBgVideo: committedBgVideo,
    hiddenBgVideoDisplay: committedBgVideo ? committedBgVideo.style.display : "",
  }
  if (committedBgVideo) {
    committedBgVideo.style.display = "none"
  }
  const cssBackgroundUrl: string | null = toCssBackgroundUrl(previewUrl)
  if (!cssBackgroundUrl) {
    console.warn("[DevTools] previewMediaSlot: rejected background previewUrl", {
      slotPath,
      previewUrl,
    })
    return false
  }
  target.style.backgroundImage = cssBackgroundUrl
  target.style.backgroundSize = "cover"
  target.style.backgroundPosition = "center"
  target.style.backgroundRepeat = "no-repeat"
  pinOverlay(target, previewUrl)
  return true
}
