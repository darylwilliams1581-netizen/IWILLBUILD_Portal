/**
 * browser-only-stub.ts
 *
 * Empty stub used during SSR build for packages that are browser-only
 * (react-pdf, pdfjs-dist). These packages are only used in client
 * components that are lazy-loaded, so they should never execute on the
 * server. The stub prevents them from being bundled into server.bundle.mjs,
 * reducing the SSR build's peak memory usage.
 */

// Export a no-op default so any `import X from 'react-pdf'` doesn't crash
// at module evaluation time (the component is lazy-loaded so it never runs).
export default {};

// Named exports that react-pdf / pdfjs-dist consumers reference
export const Document = null;
export const Page = null;
export const pdfjs = { GlobalWorkerOptions: {} };
export const GlobalWorkerOptions = {};
