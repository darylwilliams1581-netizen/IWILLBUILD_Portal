export interface AuditIssue {
  type: 'broken-image' | 'broken-link' | 'empty-section' | 'placeholder-text'
  detail: string
  src?: string
  href?: string
}

export interface MediaAuditFailure {
  reason: 'missing_src' | 'zero_natural_size' | 'http_error' | 'invalid_content_type' | 'timeout'
  failureCount: number
}

export interface MediaAuditResult {
  eligibleCount: number
  checkedCount: number
  failures: MediaAuditFailure[]
}

const MEDIA_AUDIT_IMAGE_SETTLE_MS = 5_000
const MEDIA_AUDIT_DOM_QUIET_MS = 250

function imageSource(img: HTMLImageElement): string {
  const srcAttr = img.getAttribute('src')
  return (img.currentSrc && img.currentSrc.trim().length > 0 ? img.currentSrc : srcAttr)?.trim() ?? ''
}

function waitForImage(img: HTMLImageElement, timeoutMs: number): Promise<void> {
  if (img.complete) {
    return Promise.resolve()
  }
  return new Promise(function settle(resolve) {
    const done = function done(): void {
      clearTimeout(timer)
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    img.addEventListener('load', done)
    img.addEventListener('error', done)
  })
}

function waitForDomQuiet(deadline: number, quietMs: number): Promise<void> {
  const remainingMs = Math.max(0, deadline - Date.now())
  if (remainingMs === 0) {
    return Promise.resolve()
  }
  return new Promise(function settle(resolve) {
    let timer: ReturnType<typeof setTimeout>
    const observer = new MutationObserver(function mutated() {
      clearTimeout(timer)
      timer = setTimeout(done, Math.min(quietMs, Math.max(0, deadline - Date.now())))
    })
    const done = function done(): void {
      clearTimeout(timer)
      observer.disconnect()
      resolve()
    }
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    })
    timer = setTimeout(done, Math.min(quietMs, remainingMs))
  })
}

/**
 * Audits rendered <img> elements. Only completed images count as checked.
 * Re-queries the DOM after settle so images inserted during HMR are included.
 */
export async function runMediaAudit(
  options: { settleTimeoutMs?: number; quietMs?: number } = {},
): Promise<MediaAuditResult> {
  const settleTimeoutMs = options.settleTimeoutMs ?? MEDIA_AUDIT_IMAGE_SETTLE_MS
  const quietMs = options.quietMs ?? MEDIA_AUDIT_DOM_QUIET_MS
  const deadline = Date.now() + settleTimeoutMs

  async function settlePass(): Promise<HTMLImageElement[]> {
    await waitForDomQuiet(deadline, quietMs)
    const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
    const remainingMs = Math.max(0, deadline - Date.now())
    await Promise.all(
      images.map(function wait(img) {
        if (imageSource(img).length === 0) {
          return Promise.resolve()
        }
        return waitForImage(img, remainingMs)
      }),
    )
    return Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
  }

  await settlePass()
  const images = await settlePass()

  let eligibleCount = 0
  let checkedCount = 0
  let missingSourceCount = 0
  let zeroNaturalSizeCount = 0
  images.forEach(function audit(img) {
    eligibleCount += 1
    const source = imageSource(img)
    if (source.length === 0) {
      missingSourceCount += 1
      return
    }
    if (!img.complete) {
      return
    }
    checkedCount += 1
    if (img.naturalWidth === 0) {
      zeroNaturalSizeCount += 1
    }
  })
  const failures: MediaAuditFailure[] = []
  if (missingSourceCount > 0) {
    failures.push({ reason: 'missing_src', failureCount: missingSourceCount })
  }
  if (zeroNaturalSizeCount > 0) {
    failures.push({ reason: 'zero_natural_size', failureCount: zeroNaturalSizeCount })
  }
  return {
    eligibleCount,
    checkedCount,
    failures,
  }
}

export function runDomAudit(validRoutes: string[]): AuditIssue[] {
  const issues: AuditIssue[] = []

  // Broken images (loaded but 0 naturalWidth or errored)
  document.querySelectorAll('img[src]').forEach(img => {
    const el = img as HTMLImageElement
    if (el.complete && el.naturalWidth === 0 && el.src && !el.src.startsWith('data:')) {
      issues.push({
        type: 'broken-image',
        src: el.src,
        detail: `Image failed to load: ${el.src}`,
      })
    }
  })

  // Broken internal links (href to routes that don't exist)
  const routeSet = new Set(validRoutes)
  document.querySelectorAll('a[href^="/"]').forEach(a => {
    const el = a as HTMLAnchorElement
    try {
      const pathname = new URL(el.href).pathname
      if (pathname !== '#' && pathname !== '/' && !routeSet.has(pathname)) {
        issues.push({
          type: 'broken-link',
          href: pathname,
          detail: `Link to nonexistent route: ${pathname} ("${(el.textContent ?? '').trim().slice(0, 40)}")`,
        })
      }
    } catch {
      // Invalid URL, skip
    }
  })

  // Empty sections (no text and no media)
  document.querySelectorAll('section, [role="region"], main > div').forEach(el => {
    const htmlEl = el as HTMLElement
    const text = htmlEl.innerText?.trim() ?? ''
    const hasMedia = el.querySelector('img, svg, video, canvas, iframe')
    if (text.length < 10 && !hasMedia) {
      issues.push({
        type: 'empty-section',
        detail: `Empty section: <${el.tagName.toLowerCase()}> with no visible content`,
      })
    }
  })

  // Placeholder text patterns
  const bodyText = document.body.innerText ?? ''
  const patterns: Array<[RegExp, string]> = [
    [/lorem ipsum/i, 'Lorem ipsum placeholder text'],
    [/\bTODO\b/, 'TODO marker in visible content'],
    [/placeholder/i, '"placeholder" text visible on page'],
    [/example\.com/i, 'example.com URL in visible content'],
    [/your\s+\w+\s+here/i, '"your X here" placeholder'],
  ]

  for (const [pattern, label] of patterns) {
    const match = bodyText.match(pattern)
    if (match) {
      issues.push({
        type: 'placeholder-text',
        detail: `${label}: "${match[0]}"`,
      })
    }
  }

  return issues
}
