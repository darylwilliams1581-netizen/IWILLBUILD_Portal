/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

vi.mock('../../utils/postMessage', () => ({
  isOriginAllowed: vi.fn(() => true),
  safePostMessage: vi.fn(),
}))

import { generatePreciseSelector } from '../../utils/element-helpers'
import { isOriginAllowed } from '../../utils/postMessage'
import { resolveHoverableAnchor } from '../useImageHoverDetection'
import { usePendingEditTarget } from '../usePendingEditTarget'
import type { HoveredElement } from '../useImageHoverDetection'

const PENDING_EDIT_TARGET = 'PENDING_EDIT_TARGET'

type ElementKind = 'text' | 'image' | 'content'

function dispatchPendingTarget(
  selector: string,
  elementKind: ElementKind,
  clientX: number = 10,
  clientY: number = 20,
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: PENDING_EDIT_TARGET,
        selector,
        elementKind,
        clientX,
        clientY,
      },
    }),
  )
}

function appendHeading(id: string, text: string = 'Hello'): HTMLHeadingElement {
  const heading: HTMLHeadingElement = document.createElement('h1')
  heading.id = id
  heading.textContent = text
  document.body.appendChild(heading)
  return heading
}

function appendImage(id: string): HTMLImageElement {
  const img: HTMLImageElement = document.createElement('img')
  img.id = id
  img.src = 'https://example.com/hero.jpg'
  img.alt = 'Hero'
  document.body.appendChild(img)
  return img
}

describe('usePendingEditTarget', () => {
  let startEditing: ReturnType<typeof vi.fn<(el: HTMLElement) => void>>
  let openToolbarFor: ReturnType<typeof vi.fn<(anchor: HoveredElement) => void>>

  beforeEach(() => {
    document.body.innerHTML = ''
    startEditing = vi.fn()
    openToolbarFor = vi.fn()
    vi.mocked(isOriginAllowed).mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'elementsFromPoint')
  })

  it('stashes PENDING_EDIT_TARGET until edit mode becomes active, then starts text editing', () => {
    const heading: HTMLHeadingElement = appendHeading('pending-heading')
    const { rerender } = renderHook(
      ({ isEditModeActive }: { isEditModeActive: boolean }) =>
        usePendingEditTarget(isEditModeActive, { startEditing, openToolbarFor }),
      { initialProps: { isEditModeActive: false } },
    )

    act(() => {
      dispatchPendingTarget(`#${heading.id}`, 'text')
    })
    expect(startEditing).not.toHaveBeenCalled()
    expect(openToolbarFor).not.toHaveBeenCalled()

    rerender({ isEditModeActive: true })

    expect(startEditing).toHaveBeenCalledTimes(1)
    expect(startEditing).toHaveBeenCalledWith(heading)
    expect(openToolbarFor).not.toHaveBeenCalled()
  })

  it('starts text editing immediately when edit mode is already active', () => {
    const heading: HTMLHeadingElement = appendHeading('live-heading')
    renderHook(() => usePendingEditTarget(true, { startEditing, openToolbarFor }))

    act(() => {
      dispatchPendingTarget(generatePreciseSelector(heading), 'text')
    })

    expect(startEditing).toHaveBeenCalledWith(heading)
    expect(openToolbarFor).not.toHaveBeenCalled()
  })

  it('opens the toolbar for an image target when edit mode is active', () => {
    const img: HTMLImageElement = appendImage('hero-img')
    renderHook(() => usePendingEditTarget(true, { startEditing, openToolbarFor }))

    act(() => {
      dispatchPendingTarget(`#${img.id}`, 'image')
    })

    expect(openToolbarFor).toHaveBeenCalledTimes(1)
    const anchor: HoveredElement | undefined = openToolbarFor.mock.calls[0]?.[0]
    expect(anchor).toEqual(resolveHoverableAnchor(img))
    expect(startEditing).not.toHaveBeenCalled()
  })

  it('opens the toolbar for a content target', () => {
    const heading: HTMLHeadingElement = appendHeading('content-heading')
    renderHook(() => usePendingEditTarget(true, { startEditing, openToolbarFor }))

    act(() => {
      dispatchPendingTarget(`#${heading.id}`, 'content')
    })

    expect(openToolbarFor).toHaveBeenCalledTimes(1)
    expect(openToolbarFor.mock.calls[0]?.[0]).toEqual(resolveHoverableAnchor(heading))
    expect(startEditing).not.toHaveBeenCalled()
  })

  it('falls back to elementsFromPoint when the selector misses', () => {
    const heading: HTMLHeadingElement = appendHeading('point-heading')
    const fromPoint = vi.fn((_clientX: number, _clientY: number): Element[] => [heading])
    document.elementsFromPoint = fromPoint as Document['elementsFromPoint']
    renderHook(() => usePendingEditTarget(true, { startEditing, openToolbarFor }))

    act(() => {
      dispatchPendingTarget('#does-not-exist', 'text', 40, 60)
    })

    expect(fromPoint).toHaveBeenCalledWith(40, 60)
    expect(startEditing).toHaveBeenCalledWith(heading)
  })

  it('silently clears when selector and point both miss', () => {
    document.elementsFromPoint = ((_clientX: number, _clientY: number): Element[] => []) as Document['elementsFromPoint']
    renderHook(() => usePendingEditTarget(true, { startEditing, openToolbarFor }))

    expect(() => {
      act(() => {
        dispatchPendingTarget('#missing', 'text')
      })
    }).not.toThrow()

    expect(startEditing).not.toHaveBeenCalled()
    expect(openToolbarFor).not.toHaveBeenCalled()
  })

  it('silently clears an invalid selector without applying', () => {
    renderHook(() => usePendingEditTarget(true, { startEditing, openToolbarFor }))

    expect(() => {
      act(() => {
        dispatchPendingTarget('[[[', 'text')
      })
    }).not.toThrow()

    expect(startEditing).not.toHaveBeenCalled()
    expect(openToolbarFor).not.toHaveBeenCalled()
  })

  it('ignores PENDING_EDIT_TARGET from a disallowed origin', () => {
    vi.mocked(isOriginAllowed).mockReturnValueOnce(false)
    const heading: HTMLHeadingElement = appendHeading('untrusted-heading')
    renderHook(() => usePendingEditTarget(true, { startEditing, openToolbarFor }))

    act(() => {
      dispatchPendingTarget(`#${heading.id}`, 'text')
    })

    expect(startEditing).not.toHaveBeenCalled()
    expect(openToolbarFor).not.toHaveBeenCalled()
  })
})
