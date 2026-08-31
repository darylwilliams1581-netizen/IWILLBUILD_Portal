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

// ── jsdom ─────────────────────────────────────────────────────────────────────
// jsdom is NOT stubbed during the SSR build — the real jsdom is bundled into
// server.bundle.mjs so sanitiseHtmlServer works in production. This stub is
// only reached if client-side code somehow imports jsdom (which it must not).
// It throws a clear error rather than silently returning unsanitised content
// (fail-closed per security policy).
export class JSDOM {
  constructor() {
    throw new Error(
      '[JSDOM stub] jsdom is a server-only module. ' +
      'It must not be imported in browser or client-side code. ' +
      'If you see this error, a server-only import has leaked into the client bundle.',
    );
  }
  window = { document: null, Node: null };
}

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
// @lexical, etc.
export const createEditor = null;
export const $getRoot = null;
export const $getSelection = null;
export const $createParagraphNode = null;
export const $createTextNode = null;
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

// ── date-fns ──────────────────────────────────────────────────────────────────
// date-fns is stubbed to this file during SSR. Export no-op versions of every
// named function imported across the codebase so Rollup binding resolution
// doesn't fail. These are never called server-side (pages are client-only).
export const format = () => '';
export const formatDistanceToNow = () => '';
export const formatDistance = () => '';
export const formatRelative = () => '';
export const parseISO = (s: string) => new Date(s);
export const parse = () => new Date(0);
export const isValid = () => false;
export const isAfter = () => false;
export const isBefore = () => false;
export const isSameDay = () => false;
export const isSameMonth = () => false;
export const isSameYear = () => false;
export const startOfDay = () => new Date(0);
export const endOfDay = () => new Date(0);
export const startOfWeek = () => new Date(0);
export const endOfWeek = () => new Date(0);
export const startOfMonth = () => new Date(0);
export const endOfMonth = () => new Date(0);
export const addDays = () => new Date(0);
export const addWeeks = () => new Date(0);
export const addMonths = () => new Date(0);
export const subDays = () => new Date(0);
export const subWeeks = () => new Date(0);
export const subMonths = () => new Date(0);
export const differenceInDays = () => 0;
export const differenceInHours = () => 0;
export const differenceInMinutes = () => 0;
export const differenceInCalendarDays = () => 0;
export const getDay = () => 0;
export const getDate = () => 0;
export const getMonth = () => 0;
export const getYear = () => 0;
export const setHours = () => new Date(0);
export const setMinutes = () => new Date(0);
export const eachDayOfInterval = () => [];
export const eachWeekOfInterval = () => [];
export const enUS = {};
export const enAU = {};
