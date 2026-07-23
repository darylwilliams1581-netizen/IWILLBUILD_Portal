import type { MediaReplaceParentMessage } from "../types";
import { collectMediaSlotDomMatches } from "./media-slot-dom";
import {
  endMediaReplaceSession,
  setMediaReplaceLockedElement,
  startMediaReplaceSession,
} from "./media-replace-session";
import { previewMediaSlot, revertMediaSlotPreview } from "./media-slot-preview";
import { clearSelectionOverlay, showSelectionOverlay } from "./selection-overlay";

function isMediaReplaceParentMessage(data: unknown): data is MediaReplaceParentMessage {
  if (!data || typeof data !== "object") {
    return false
  }
  const type: unknown = (data as { type?: unknown }).type
  return (
    type === "PREVIEW_MEDIA_SLOT" ||
    type === "REVERT_MEDIA_SLOT" ||
    type === "MEDIA_REPLACE_SESSION_START" ||
    type === "MEDIA_REPLACE_SESSION_END"
  )
}

/**
 * Handle parent→iframe media-replace messages. Returns true when the message
 * type was recognized (whether or not a DOM match existed / payload was complete).
 * Accepts `unknown` at the postMessage boundary; narrows via the types.ts union.
 */
export function handleMediaReplaceParentMessage(data: unknown): boolean {
  if (!isMediaReplaceParentMessage(data)) {
    return false
  }

  switch (data.type) {
    case "PREVIEW_MEDIA_SLOT": {
      // Runtime guard — postMessage payloads are not trusted typed
      if (!data.slotPath || typeof data.previewUrl !== "string") {
        return false
      }
      const occurrenceIndex: number =
        typeof data.occurrenceIndex === "number" ? data.occurrenceIndex : 0
      const applied: boolean = previewMediaSlot(data.slotPath, data.previewUrl, {
        occurrenceIndex,
        isVideo: !!data.isVideo,
      })
      if (!applied) {
        console.warn("[DevTools] PREVIEW_MEDIA_SLOT: no DOM match for slot", {
          slotPath: data.slotPath,
          occurrenceIndex,
        })
      }
      return true
    }
    case "REVERT_MEDIA_SLOT": {
      revertMediaSlotPreview()
      return true
    }
    case "MEDIA_REPLACE_SESSION_START": {
      if (!data.slotPath) {
        return false
      }
      const occurrenceIndex: number =
        typeof data.occurrenceIndex === "number" ? data.occurrenceIndex : 0
      const matches: HTMLElement[] = collectMediaSlotDomMatches(data.slotPath)
      const target: HTMLElement | null =
        matches.length > 0
          ? matches[Math.max(0, Math.min(occurrenceIndex, matches.length - 1))] ?? null
          : null
      startMediaReplaceSession(target)
      if (target) {
        setMediaReplaceLockedElement(target)
        showSelectionOverlay(target)
      } else {
        console.warn("[DevTools] MEDIA_REPLACE_SESSION_START: no DOM match for slot", {
          slotPath: data.slotPath,
          occurrenceIndex,
        })
      }
      return true
    }
    case "MEDIA_REPLACE_SESSION_END": {
      endMediaReplaceSession()
      clearSelectionOverlay({ force: true })
      return true
    }
    default: {
      const _exhaustive: never = data
      void _exhaustive
      return false
    }
  }
}
