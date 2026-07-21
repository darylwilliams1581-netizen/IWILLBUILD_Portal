import { snapshot } from 'rrweb-snapshot'

const HMR_SETTLE_DELAY_MS: number = 500
const HMR_MAX_WAIT_MS: number = 5000
const HMR_EVENT: string = '__dev_tools_hmr_update'

/**
 * Shared timing budget for the multi-route capture walk.
 *
 * These are the single source of truth on the dev-tools side. The builder's
 * `SNAPSHOT_TIMEOUT_MS` (app/src/.../useDomSnapshotCapture.ts) is derived from
 * the same numbers by hand (the dev-tools package is excluded from the pnpm
 * workspace, so the constant can't be imported across the boundary). Worst-case
 * walk ≈ MAX_ROUTES × (ROUTE_SETTLE_MAX_MS + per-route capture) + HMR settle +
 * route discovery ≈ 55s; the builder allots 90s so a completed response is never
 * discarded before it arrives. Keep the two comments stating the same figures.
 */
export const MAX_ROUTES: number = 20
export const ROUTE_SETTLE_MAX_MS: number = 2000
export const ROUTE_SETTLE_QUIET_MS: number = 250

/**
 * Curated list of dev-tools / preview chrome injected into the live document.
 * The rrweb blob is captured with these nodes detached so builder chrome never
 * pollutes the snapshot.
 *
 * Kept as one exported constant so the set is reviewable and testable. Each
 * entry maps to a concrete injector:
 *  - `[data-airo-dev-tools]`        — overlays, hover bars, quick-edit UI, error UI
 *  - `#airo-preview-header`         — injected preview header (index.ts)
 *  - `#airo-dev-tools-styles`       — injected global <style> (injectDevToolsStyles.ts)
 *  - `#ai-select-pulse-keyframes`   — selection pulse <style> (selection-overlay.ts)
 *  - `#ai-select-overlay`, numbered — selection overlays (selection-overlay.ts)
 *  - `#airo-preview-font-link`      — injected google-fonts <link> (DevelopmentMode.tsx)
 *  - `video[data-airo-video|bg-video]` — dev-tools media-preview <video> replacements
 *  - `.airo-section-toggle`         — injected compliance section-toggle control
 *  - `script[src*="fullstory.com"]` — off-localhost analytics script (fullstory-injector.ts)
 */
export const INJECTED_NODE_SELECTORS: readonly string[] = [
  '[data-airo-dev-tools]',
  '#airo-preview-header',
  '#airo-dev-tools-styles',
  '#ai-select-pulse-keyframes',
  '#ai-select-overlay',
  '[id^="ai-select-overlay-"]',
  '#airo-preview-font-link',
  'video[data-airo-video]',
  'video[data-airo-bg-video]',
  '.airo-section-toggle',
  'script[src*="fullstory.com"]',
]

export function waitForHmrSettle(): Promise<void> {
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const startTime: number = Date.now()

    const resetTimer = (): void => {
      if (Date.now() - startTime >= HMR_MAX_WAIT_MS) {
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        cleanup()
        resolve()
      }, HMR_SETTLE_DELAY_MS)
    }

    const onTimeout = (): void => {
      cleanup()
      resolve()
    }

    const cleanup = (): void => {
      if (timer) clearTimeout(timer)
      if (maxTimer) clearTimeout(maxTimer)
      window.removeEventListener(HMR_EVENT, resetTimer)
    }

    const maxTimer: ReturnType<typeof setTimeout> = setTimeout(onTimeout, HMR_MAX_WAIT_MS)
    window.addEventListener(HMR_EVENT, resetTimer)
    resetTimer()
  })
}

/**
 * Wait for a freshly-navigated SPA route to settle before snapshotting.
 *
 * Lazy routes in the v8 template are code-split (`lazy(() => import(...))`) and
 * render under `<Suspense fallback={<SpinnerFallback />}>`. A quiet-only
 * MutationObserver window resolves *early* against the static spinner (no
 * mutations → looks settled) and snapshots the fallback instead of the page.
 *
 * We therefore wait on a **template-independent** signal: dynamic `import()` of
 * a route chunk shows up as a `resource` PerformanceEntry (script/fetch). We
 * hold off the quiet window until no new such resource has completed for
 * `quietMs`, then add one `requestAnimationFrame` so the resolved page has
 * painted. The whole thing is capped at `maxWaitMs`.
 *
 * When `PerformanceObserver` is unavailable (e.g. jsdom, older embeds) we fall
 * back to a plain quiet timer — still better than resolving instantly.
 */
export function waitForRouteSettle(
  maxWaitMs: number = ROUTE_SETTLE_MAX_MS,
  quietMs: number = ROUTE_SETTLE_QUIET_MS,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const startTime: number = Date.now()
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    let maxTimer: ReturnType<typeof setTimeout> | null = null
    let observer: PerformanceObserver | null = null
    let settled: boolean = false

    const cleanup = (): void => {
      if (quietTimer) clearTimeout(quietTimer)
      if (maxTimer) clearTimeout(maxTimer)
      if (observer) {
        try {
          observer.disconnect()
        } catch {
          // ignore
        }
      }
    }

    const finish = (): void => {
      if (settled) return
      settled = true
      cleanup()
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve())
      } else {
        resolve()
      }
    }

    const bumpQuietWindow = (): void => {
      if (settled) return
      if (Date.now() - startTime >= maxWaitMs) {
        finish()
        return
      }
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(finish, quietMs)
    }

    try {
      if (typeof PerformanceObserver === 'function') {
        observer = new PerformanceObserver((list: PerformanceObserverEntryList) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType !== 'resource') continue
            const resource = entry as PerformanceResourceTiming
            const isChunk: boolean =
              resource.initiatorType === 'script' ||
              resource.initiatorType === 'fetch' ||
              /\.m?js(\?|$)/.test(resource.name)
            if (isChunk) bumpQuietWindow()
          }
        })
        observer.observe({ type: 'resource', buffered: true })
      }
    } catch {
      observer = null
    }

    maxTimer = setTimeout(finish, maxWaitMs)
    // Start the quiet window immediately; a chunk load will reset it.
    bumpQuietWindow()
  })
}

/**
 * Build the ordered list of route paths to visit during a capture walk.
 *
 * Pure: current route first (so the user's active page is always captured),
 * then discovered routes, de-duplicated, dropping dynamic (`:param`) and
 * catch-all (`*`) patterns (they aren't concrete navigable URLs), capped at
 * `max`.
 */
export function buildVisitList(
  currentPath: string,
  routes: readonly { path: string }[],
  max: number = MAX_ROUTES,
): string[] {
  const out: string[] = []
  const seen: Set<string> = new Set<string>()

  const push = (candidate: string): void => {
    if (!candidate) return
    if (candidate.includes(':') || candidate.includes('*')) return
    if (seen.has(candidate)) return
    seen.add(candidate)
    out.push(candidate)
  }

  push(currentPath)
  for (const route of routes) push(route.path)

  return out.slice(0, max)
}

export interface DetachedNode {
  node: Node
  parent: Node
  nextSibling: Node | null
}

/**
 * Detach every injected-chrome node (see `INJECTED_NODE_SELECTORS`) from
 * `root`, returning enough state to restore them in place afterwards. Callers
 * MUST call `restoreInjectedNodes` in a `finally` so the live preview is left
 * untouched. Detach → snapshot → restore runs synchronously (no paint in
 * between), so the user never sees a flash.
 */
export function stripInjectedNodes(root: ParentNode): DetachedNode[] {
  const detached: DetachedNode[] = []
  const selector: string = INJECTED_NODE_SELECTORS.join(',')
  const matches: Element[] = Array.from(root.querySelectorAll(selector))
  for (const el of matches) {
    const parent: Node | null = el.parentNode
    if (!parent) continue
    detached.push({ node: el, parent, nextSibling: el.nextSibling })
    parent.removeChild(el)
  }
  return detached
}

/** Re-attach nodes detached by `stripInjectedNodes`, restoring original order. */
export function restoreInjectedNodes(detached: DetachedNode[]): void {
  // Restore in reverse so a `nextSibling` reference is valid when re-inserting
  // multiple siblings under the same parent.
  for (let i = detached.length - 1; i >= 0; i--) {
    const entry: DetachedNode = detached[i]!
    try {
      entry.parent.insertBefore(entry.node, entry.nextSibling)
    } catch {
      // Best-effort: if the reference sibling is gone, append.
      try {
        entry.parent.appendChild(entry.node)
      } catch {
        // ignore
      }
    }
  }
}

export function captureDomSnapshot(doc: Document = document): unknown {
  return snapshot(doc)
}
