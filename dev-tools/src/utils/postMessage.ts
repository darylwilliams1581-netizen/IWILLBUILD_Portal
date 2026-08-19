/**
 * Security utility for postMessage operations
 *
 * Gets the target origin for postMessage calls. Prefers a GoDaddy-owned origin
 * derived from document.referrer, then environment variable VITE_PARENT_ORIGIN
 * if set, otherwise falls back to '*' (not recommended for production).
 *
 * This function centralizes origin handling to make security auditing easier.
 */
const GODADDY_ORIGIN_PATTERN = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.(dev-|test-)?godaddy\.com(:\d+)?$/

function getGodaddyReferrerOrigin(): string | undefined {
  if (typeof document === 'undefined' || !document.referrer) return undefined
  try {
    const origin = new URL(document.referrer).origin
    // A same-origin referrer means this document navigated to itself (e.g. an
    // in-iframe full-page reload), not that a parent frame embedded it — never
    // treat it as the parent's origin.
    if (origin === window.location.origin) return undefined
    return GODADDY_ORIGIN_PATTERN.test(origin) ? origin : undefined
  } catch {
    return undefined
  }
}

/** Target origin for postMessage calls: a GoDaddy-owned referrer origin, then VITE_PARENT_ORIGIN, then '*'. */
export function getTargetOrigin(): string {
  const referrerOrigin = getGodaddyReferrerOrigin()
  if (referrerOrigin) {
    return referrerOrigin
  }

  // Use configured parent origin from environment if available
  const parentOrigin = import.meta.env.VITE_PARENT_ORIGIN

  if (parentOrigin) {
    return parentOrigin
  }

  // Fallback to wildcard (security risk - should only be used in development)
  console.warn('VITE_PARENT_ORIGIN not set, using wildcard origin for postMessage (security risk)')
  return '*'
}

/**
 * Validates if the message event origin is allowed
 *
 * @param event - MessageEvent to validate
 * @returns true if origin is allowed, false otherwise
 */
export function isOriginAllowed(event: MessageEvent): boolean {
  const allowedOrigin = import.meta.env.VITE_PARENT_ORIGIN

  if (!allowedOrigin || allowedOrigin === '*') {
    // Dev mode: no specific origin configured — allow localhost and GoDaddy domains.
    const origin = event.origin
    const airoBuilderPattern = /^https:\/\/airo-builder\.(dev-|test-)?godaddy\.com(:\d+)?$/
    return origin.startsWith('http://localhost:') ||
           origin.startsWith('https://localhost:') ||
           origin.startsWith('https://local.gasket.dev-godaddy.com:') ||
           origin === 'http://127.0.0.1:3000' ||
           origin === 'https://127.0.0.1:3000' ||
           airoBuilderPattern.test(origin)
  }

  // Exact match: the configured production builder URL.
  if (event.origin === allowedOrigin.replace(/\/$/, '')) return true

  // Dark-release / staging: the builder URL may differ from VITE_PARENT_ORIGIN (configured for
  // the production URL). Trust the direct parent frame when its origin is on a GoDaddy-owned
  // domain so those environments keep working. event.source cannot be spoofed by the browser,
  // but we bound the trust to GoDaddy domains — arbitrary third-party embedders are NOT trusted
  // even if they happen to be the direct parent (e.g. a customer site that is itself embedded).
  if (typeof window !== 'undefined' && window.parent !== window && event.source === window.parent) {
    if (GODADDY_ORIGIN_PATTERN.test(event.origin)) return true
  }

  return false
}

/**
 * Safe wrapper for postMessage that uses proper origin targeting.
 *
 * Swallows DataCloneError so dev-tools telemetry with non-cloneable payloads
 * (SVGAnimatedString, DOM nodes, functions, circular refs, etc.) never
 * escalates into a user-facing "Something went wrong" overlay via
 * window.onerror. Retries once with a JSON-sanitized copy as best-effort
 * delivery, otherwise drops the message and logs a console warning. Any other
 * error is rethrown so genuine issues still surface.
 */
export function safePostMessage(targetWindow: Window, message: any) {
  const origin = getTargetOrigin()
  // Callers are responsible for bounding their payload sizes (see
  // AiroErrorBoundary.buildErrorData). This wrapper does not mutate
  // user content; the previous `errorMessage` top-level truncation
  // guard was dead code — no caller used that shape.
  const safeMessage = { ...message }

  try {
    targetWindow.postMessage(safeMessage, origin)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'DataCloneError') {
      try {
        targetWindow.postMessage(JSON.parse(JSON.stringify(safeMessage)), origin)
        // Retry succeeded but the JSON round-trip silently drops
        // `undefined`, functions, Symbol keys, Maps, Sets, Dates (become
        // strings), and other non-JSON values. Log so lossy delivery is
        // diagnosable for the platform team.
        console.warn('[dev-tools] postMessage payload was JSON-sanitized (DataCloneError)', safeMessage?.type)
      } catch (retryErr) {
        // Distinguish failure modes so a cross-origin misconfiguration
        // (SecurityError — e.g. wrong VITE_PARENT_ORIGIN) doesn't hide
        // under a "non-cloneable payload" label.
        if (retryErr instanceof DOMException && retryErr.name === 'SecurityError') {
          console.warn('[dev-tools] postMessage blocked by SecurityError on retry (check VITE_PARENT_ORIGIN)', safeMessage?.type, retryErr)
        } else {
          console.warn('[dev-tools] dropped postMessage with non-cloneable payload', safeMessage?.type, retryErr)
        }
      }
      return
    }
    throw err
  }
}
