/**
 * Canonical public base URL for IWILLBUILD.
 *
 * Used wherever the server needs to construct a public-facing link
 * (share tokens, form links, SWMS sign-on links, QR codes).
 *
 * Never derive this from req.headers.origin or req.headers.host —
 * those reflect the current request origin and will expose the Airo
 * preview hostname when the app is accessed through the builder.
 *
 * Override via APP_PUBLIC_URL env var for staging / local dev.
 */
export const APP_URL =
  (process.env.APP_PUBLIC_URL ?? 'https://iwillbuild.com').replace(/\/$/, '');
