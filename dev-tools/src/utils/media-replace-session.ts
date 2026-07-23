/** Sticky purple selection while Commander Replace Image is open. */

let sessionActive = false
let lockedElement: HTMLElement | null = null

export function startMediaReplaceSession(el?: HTMLElement | null): void {
  sessionActive = true
  if (el) {
    lockedElement = el
  }
}

export function endMediaReplaceSession(): void {
  sessionActive = false
  lockedElement = null
}

export function isMediaReplaceSessionActive(): boolean {
  return sessionActive
}

export function getMediaReplaceLockedElement(): HTMLElement | null {
  return lockedElement
}

export function setMediaReplaceLockedElement(el: HTMLElement | null): void {
  lockedElement = el
}
