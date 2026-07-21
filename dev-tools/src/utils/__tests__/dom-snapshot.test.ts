import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildVisitList,
  captureDomSnapshot,
  type DetachedNode,
  restoreInjectedNodes,
  stripInjectedNodes,
  waitForHmrSettle,
  waitForRouteSettle,
} from '../dom-snapshot.js'

vi.mock('rrweb-snapshot', () => ({
  snapshot: vi.fn((_doc: unknown) => {
    return { type: 0, childNodes: [{ type: 1, tagName: 'html' }] }
  }),
}))

describe('captureDomSnapshot', () => {
  it('returns serialized DOM tree from rrweb-snapshot', () => {
    const result: unknown = captureDomSnapshot(document)
    expect(result).toEqual({ type: 0, childNodes: [{ type: 1, tagName: 'html' }] })
  })
})

describe('buildVisitList', () => {
  it('puts the current path first', () => {
    const list: string[] = buildVisitList('/about', [{ path: '/' }, { path: '/about' }])
    expect(list[0]).toBe('/about')
  })

  it('dedups repeated paths', () => {
    const list: string[] = buildVisitList('/', [{ path: '/' }, { path: '/about' }, { path: '/about' }])
    expect(list).toEqual(['/', '/about'])
  })

  it('drops dynamic (:param) and catch-all (*) routes', () => {
    const list: string[] = buildVisitList('/', [
      { path: '/' },
      { path: '/blog/:slug' },
      { path: '/shop' },
      { path: '*' },
      { path: '/x/*' },
    ])
    expect(list).toEqual(['/', '/shop'])
  })

  it('caps the number of routes', () => {
    const routes = Array.from({ length: 30 }, (_v, i) => ({ path: `/p${i}` }))
    const list: string[] = buildVisitList('/', routes, 5)
    expect(list).toHaveLength(5)
  })
})

describe('stripInjectedNodes / restoreInjectedNodes', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.querySelectorAll('#airo-dev-tools-styles').forEach((n) => n.remove())
  })

  it('removes injected chrome and restores it in place', () => {
    document.body.innerHTML = `
      <h1>Real heading</h1>
      <button data-airo-dev-tools>Edit</button>
      <div id="airo-preview-header"><a href="#">Header link</a></div>
      <p>content</p>
    `
    const before: number = document.body.children.length
    const detached = stripInjectedNodes(document)
    expect(detached.length).toBe(2)
    expect(document.querySelector('[data-airo-dev-tools]')).toBeNull()
    expect(document.getElementById('airo-preview-header')).toBeNull()
    expect(document.querySelector('h1')?.textContent).toBe('Real heading')

    restoreInjectedNodes(detached)
    expect(document.body.children.length).toBe(before)
    expect(document.querySelector('[data-airo-dev-tools]')).not.toBeNull()
    expect(document.getElementById('airo-preview-header')).not.toBeNull()
  })

  it('falls back to appendChild when the original nextSibling is gone', () => {
    const parent: HTMLElement = document.createElement('div')
    const node: HTMLElement = document.createElement('span')
    // A reference sibling that was never attached to `parent`, so
    // insertBefore(node, orphanSibling) throws NotFoundError and the
    // restore must fall back to appendChild.
    const orphanSibling: HTMLElement = document.createElement('i')
    const detached: DetachedNode[] = [{ node, parent, nextSibling: orphanSibling }]

    restoreInjectedNodes(detached)

    expect(parent.contains(node)).toBe(true)
    expect(parent.lastChild).toBe(node)
  })
})

describe('waitForRouteSettle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves after a quiet window', async () => {
    const promise: Promise<void> = waitForRouteSettle(2000, 250)
    await vi.advanceTimersByTimeAsync(300)
    await promise
  })

  it('resolves by the max cap', async () => {
    const promise: Promise<void> = waitForRouteSettle(100, 250)
    await vi.advanceTimersByTimeAsync(150)
    await promise
  })

  it('resets the quiet window when the PerformanceObserver reports a chunk load', async () => {
    // jsdom has no PerformanceObserver, so the production observer path is
    // otherwise unexercised. Stub one that hands us its callback, then feed a
    // `script` resource entry to prove it bumps the quiet window.
    let capturedCallback: ((list: { getEntries: () => unknown[] }) => void) | null = null
    class FakePerformanceObserver {
      constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
        capturedCallback = callback
      }
      observe(): void {}
      disconnect(): void {}
    }
    const original: typeof PerformanceObserver | undefined = globalThis.PerformanceObserver
    globalThis.PerformanceObserver = FakePerformanceObserver as unknown as typeof PerformanceObserver
    try {
      const promise: Promise<void> = waitForRouteSettle(2000, 250)
      // Just before the initial quiet window elapses, a chunk lands → reset.
      await vi.advanceTimersByTimeAsync(200)
      capturedCallback?.({
        getEntries: (): unknown[] => [
          { entryType: 'resource', initiatorType: 'script', name: 'chunk-abc.js' },
        ],
      })
      // 200ms after the reset is still < 250ms quiet, so not yet settled.
      await vi.advanceTimersByTimeAsync(200)
      // Let the (reset) quiet window fully elapse; well under the 2000ms cap.
      await vi.advanceTimersByTimeAsync(250)
      await promise
    } finally {
      globalThis.PerformanceObserver = original as typeof PerformanceObserver
    }
  })
})

describe('waitForHmrSettle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves after 500ms of no HMR activity', async () => {
    const promise: Promise<void> = waitForHmrSettle()
    await vi.advanceTimersByTimeAsync(500)
    await promise
  })

  it('resets timer when HMR fires', async () => {
    const promise: Promise<void> = waitForHmrSettle()
    await vi.advanceTimersByTimeAsync(300)
    window.dispatchEvent(new CustomEvent('__dev_tools_hmr_update'))
    await vi.advanceTimersByTimeAsync(500)
    await promise
  })

  it('resolves after 5s timeout even if HMR keeps firing', async () => {
    const promise: Promise<void> = waitForHmrSettle()
    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      window.dispatchEvent(new CustomEvent('__dev_tools_hmr_update'))
    }, 400)
    await vi.advanceTimersByTimeAsync(5000)
    clearInterval(interval)
    await promise
  })
})
