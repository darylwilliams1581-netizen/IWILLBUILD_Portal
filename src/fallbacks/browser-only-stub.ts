/**
 * browser-only-stub.ts
 *
 * Empty stub used during SSR build for packages that are browser-only
 * (react-pdf, pdfjs-dist, @babel, drizzle-kit, etc.). These packages are
 * only used in client components that are lazy-loaded, so they should never
 * execute on the server. The stub prevents them from being bundled into
 * server.bundle.mjs, reducing the SSR build's peak memory usage.
 *
 * IMPORTANT: Only stub packages whose named exports are NOT statically
 * imported by any src/components/ui/*.tsx shadcn wrapper. If a package has
 * a shadcn wrapper that re-exports named bindings (e.g. input-otp, vaul,
 * cmdk, embla-carousel, react-day-picker), do NOT stub the package — stub
 * the wrapper component file instead, or don't stub at all.
 *
 * This stub exports a broad set of no-op named exports so Rollup's static
 * binding resolution doesn't fail on any named import from a stubbed package.
 */

// Default export — satisfies `import X from 'pkg'`
export default {};

// ── react-pdf / pdfjs-dist ────────────────────────────────────────────────
export const Document = null;
export const Page = null;
export const pdfjs = { GlobalWorkerOptions: {} };
export const GlobalWorkerOptions = {};

// ── react-i18next / i18next ───────────────────────────────────────────────
// useTranslation is imported by LanguageSwitcher, LanguageWrapper, and
// several commerce pages. Return a no-op hook so SSR render doesn't crash.
export const useTranslation = () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: () => Promise.resolve() } });
export const initReactI18next = { type: '3rdParty', init: () => {} };
export const Trans = null;
export const I18nextProvider = null;

// ── Generic no-op exports for other stubbed packages ─────────────────────
// These cover any named import that might be pulled in transitively from
// @babel, drizzle-kit, es-abstract, html-to-image, react-markdown,
// @lexical, @tanstack/react-query, etc.
export const createEditor = null;
export const $getRoot = null;
export const $getSelection = null;
export const $createParagraphNode = null;
export const $createTextNode = null;
export const useQuery = null;
export const useMutation = null;
export const QueryClient = null;
export const QueryClientProvider = null;
export const toPng = null;
export const toJpeg = null;
export const toBlob = null;
export const toCanvas = null;

// ── react-hook-form ───────────────────────────────────────────────────────────
export const useForm = null;
export const useFormContext = null;
export const useController = null;
export const useWatch = null;
export const useFieldArray = null;
export const FormProvider = null;
export const Controller = null;
