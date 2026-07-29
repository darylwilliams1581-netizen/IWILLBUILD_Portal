/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'

vi.mock('../../utils/translations', () => ({
  t: vi.fn((_: string, fallback: string) => fallback),
}))

const sendMock = vi.fn()
vi.mock('../../utils/eventBus', () => ({
  send: (...args: unknown[]) => sendMock(...args),
}))

vi.mock('../../utils/postMessage', () => ({
  isOriginAllowed: vi.fn(() => true),
}))

import AnnotationMode from '../AnnotationMode'

function getOverlay(): SVGSVGElement {
  const overlay = document.querySelector('[data-airo-annotation-overlay="true"]') as SVGSVGElement | null
  if (!overlay) throw new Error('annotation overlay not found')
  return overlay
}

function getQuickEditInput(): HTMLInputElement {
  const input = document.querySelector('input[type="text"]') as HTMLInputElement | null
  if (!input) throw new Error('quick edit input not found')
  return input
}

function dragSelection(
  overlay: SVGSVGElement,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  overlay.setPointerCapture = vi.fn()
  overlay.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(overlay, { clientX: fromX, clientY: fromY, button: 0, pointerId: 1 })
  fireEvent.pointerMove(overlay, { clientX: toX, clientY: toY, pointerId: 1 })
  fireEvent.pointerUp(overlay, { clientX: toX, clientY: toY, pointerId: 1 })
}

function submitQuickEdit(prompt: string): void {
  const input = getQuickEditInput()
  fireEvent.change(input, { target: { value: prompt } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

beforeEach(function setup() {
  cleanup()
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe = vi.fn()
    disconnect = vi.fn()
  })
  // jsdom (>=26) ships no PointerEvent; the drag helper needs clientX to
  // propagate through pointer events.
  vi.stubGlobal('PointerEvent', class PointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
    }
  })
  // jsdom has no elementsFromPoint; pointer-up now resolves the boxed element.
  // Default to empty; tests that assert resolution override this per-test.
  document.elementsFromPoint = vi.fn(() => []) as typeof document.elementsFromPoint
  document.body.innerHTML = ''
  Object.defineProperty(document.documentElement, 'scrollWidth', { value: 1000, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 800, configurable: true })
  Object.defineProperty(window, 'scrollX', { value: 0, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true })
  window.scrollTo = vi.fn()
})

describe('AnnotationMode', function annotationModeTests() {
  it('emits ANNOTATION_SELECTION_CREATED after drag and QuickEditBar submit', function dragSubmit() {
    render(createElement(AnnotationMode, { isActive: true }))

    dragSelection(getOverlay(), 10, 10, 110, 110)
    submitQuickEdit('fix this area')

    expect(sendMock).toHaveBeenCalledWith({
      type: 'ANNOTATION_SELECTION_CREATED',
      data: {
        number: 1,
        rect: { x: 10, y: 10, width: 100, height: 100 },
        prompt: 'fix this area',
        // No element under the box (elementsFromPoint stubbed empty) → unresolved.
        resolvedElement: {
          resolved: false,
          kind: null,
          elementInfo: { tagName: '', className: '', id: '', textContent: '', selector: '' },
          devContext: { fileName: '', componentName: '', lineNumber: 0 },
        },
      },
    })
  })

  it('emits REMOVE_SELECTION_FROM_PREVIEW when the number badge is clicked', function badgeRemove() {
    render(createElement(AnnotationMode, { isActive: true }))

    dragSelection(getOverlay(), 10, 10, 60, 60)
    submitQuickEdit('remove me')

    // Target the badge by title — the annotation overlay now also carries
    // data-airo-dev-tools (so hit-testing skips it), so that attr is ambiguous.
    const badge = document.querySelector('[title="Remove selection"]') as HTMLElement | null
    if (!badge) throw new Error('selection badge not found')
    fireEvent.click(badge)

    expect(sendMock).toHaveBeenCalledWith({
      type: 'REMOVE_SELECTION_FROM_PREVIEW',
      data: { number: 1 },
    })
    expect(document.querySelectorAll('[data-airo-annotation-overlay="true"] rect')).toHaveLength(0)
  })

  it('removes a selection when REMOVE_SELECTION is posted from parent', function removeSelection() {
    render(createElement(AnnotationMode, { isActive: true }))

    dragSelection(getOverlay(), 10, 10, 60, 60)
    submitQuickEdit('first')

    // act() so React flushes the message-handler state update before asserting.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'REMOVE_SELECTION', data: { number: 1 } },
        source: window,
      }))
    })

    expect(document.querySelectorAll('[data-airo-annotation-overlay="true"] rect')).toHaveLength(0)
  })

  it('clears all selections on CLEAR_ALL_SELECTIONS', function clearAll() {
    render(createElement(AnnotationMode, { isActive: true }))

    dragSelection(getOverlay(), 10, 10, 60, 60)
    submitQuickEdit('first')

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'CLEAR_ALL_SELECTIONS' },
        source: window,
      }))
    })

    expect(document.querySelectorAll('[data-airo-annotation-overlay="true"] rect')).toHaveLength(0)
  })

  it('scrolls to a selection on SCROLL_TO_SELECTION', function scrollToSelection() {
    render(createElement(AnnotationMode, { isActive: true }))

    dragSelection(getOverlay(), 10, 300, 60, 360)
    submitQuickEdit('scroll target')

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'SCROLL_TO_SELECTION', data: { number: 1 } },
        source: window,
      }))
    })

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 130,
      behavior: 'smooth',
    })
  })

  it('attaches a resolved image identity to the emitted payload', function resolvedImage() {
    // A real media-slot <img> under an ancestor with dev source markers.
    const wrapper: HTMLDivElement = document.createElement('div')
    wrapper.setAttribute('data-dev-file', 'src/components/Hero.tsx')
    wrapper.setAttribute('data-dev-line', '12')
    const img: HTMLImageElement = document.createElement('img')
    img.src = '/airo-assets/images/pages/home/hero'
    wrapper.appendChild(img)
    document.body.appendChild(wrapper)
    document.elementsFromPoint = vi.fn(() => [img]) as typeof document.elementsFromPoint

    render(createElement(AnnotationMode, { isActive: true }))
    dragSelection(getOverlay(), 10, 10, 110, 110)
    submitQuickEdit('make the hero bigger')

    const call = sendMock.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === 'ANNOTATION_SELECTION_CREATED',
    )
    expect(call).toBeDefined()
    const payload = (call![0] as {
      data: {
        resolvedElement?: {
          resolved: boolean
          kind: string | null
          imageInfo?: { slotPath?: string | null }
          elementInfo?: { selector?: string }
        }
      }
    }).data
    expect(payload.resolvedElement).toBeDefined()
    expect(payload.resolvedElement?.resolved).toBe(true)
    expect(payload.resolvedElement?.kind).toBe('image')
    expect(payload.resolvedElement?.imageInfo?.slotPath).toBe('pages/home/hero')
    expect(typeof payload.resolvedElement?.elementInfo?.selector).toBe('string')
    expect(payload.resolvedElement?.elementInfo?.selector).not.toBe('')
  })

  it('emits an unresolved resolvedElement when the box is over empty space', function emptySpace() {
    document.elementsFromPoint = vi.fn(() => []) as typeof document.elementsFromPoint

    render(createElement(AnnotationMode, { isActive: true }))
    dragSelection(getOverlay(), 10, 10, 110, 110)
    submitQuickEdit('fix this area')

    const call = sendMock.mock.calls.find(
      (c) => (c[0] as { type?: string }).type === 'ANNOTATION_SELECTION_CREATED',
    )
    expect(call).toBeDefined()
    const payload = (call![0] as {
      data: { resolvedElement?: { resolved: boolean; kind: string | null } }
    }).data
    expect(payload.resolvedElement).toBeDefined()
    expect(payload.resolvedElement?.resolved).toBe(false)
    expect(payload.resolvedElement?.kind).toBeNull()
  })
})
