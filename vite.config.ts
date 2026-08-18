import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { URL } from "node:url";
import { createRequire } from "module";

// ---------------------------------------------------------------------------
// Optional platform plugin loader
// These modules only exist inside the builder sandbox. When running locally
// (e.g. `npm run dev` or `npm run test:e2e` on a developer machine) the
// directories are absent and the imports would crash esbuild before Vite even
// starts. tryLoad() catches the missing-module error and returns null so the
// rest of the config can guard each usage with a simple truthiness check.
// ---------------------------------------------------------------------------
const _require = createRequire(import.meta.url);

function tryLoad(id: string, named?: string): ((...args: unknown[]) => unknown) | null {
  try {
    // resolve relative to this config file so Windows absolute paths work too
    const resolved = id.startsWith(".") ? path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), id) : id;
    const mod = _require(resolved);
    const fn = named ? mod[named] : (mod.default ?? mod);
    return typeof fn === "function" ? fn : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// E2E / local-dev DB stub flag
// Set by playwright.config.ts webServer.env (PW_E2E=1 / VITE_E2E=1) or by
// any CI environment. When true, Vite's resolve.alias redirects db/config
// and db/client to safe no-op stubs so the dev server never tries to read
// /local/config.json during `npm run test:e2e`.
// ---------------------------------------------------------------------------
const isE2ERun =
  process.env.PW_E2E === "1" ||
  process.env.VITE_E2E === "1" ||
  process.env.NODE_ENV === "test" ||
  process.env.CI === "1";

// ---------------------------------------------------------------------------
// Builder-only plugins — null when running locally (safe to skip)
const sourceMapperPlugin    = tryLoad("./source-mapper/src/index");
const devToolsPlugin        = tryLoad("./dev-tools/src/vite-plugin",               "devToolsPlugin");
const fullStoryPlugin       = tryLoad("./fullstory-plugin",                        "fullStoryPlugin");
const errorInterceptorPlugin = tryLoad("./dev-tools/src/vite-error-interceptor",   "errorInterceptorPlugin");
const mediaVersionsPlugin   = tryLoad("./dev-tools/src/vite-media-versions-plugin","mediaVersionsPlugin");
const formatOverridesPlugin = tryLoad("./format-overrides-plugin",                 "formatOverridesPlugin");
const contentPlugin         = tryLoad("./content-plugin/src/index",                "contentPlugin");

function extractHostname(value: string): string {
  try {
    if (value.includes("://")) {
      return new URL(value).hostname;
    }
    return value;
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// E2E DB stub plugin
// When isE2ERun is true this plugin intercepts any relative import of
// `./config` or `./config.js` that originates from inside the
// src/server/db/ directory and redirects it to the db-config stub.
// This catches the `import { getDatabaseCredentials } from './config.js'`
// line inside src/server/db/client.ts even when the importer path has
// already been resolved to an absolute path by Vite's resolver.
// ---------------------------------------------------------------------------
function e2eDbStubPlugin(): Plugin {
  const dbDir = path.resolve(__dirname, "src/server/db");
  const configStub = path.resolve(__dirname, "src/test/stubs/db-config.stub.ts");
  const clientStub = path.resolve(__dirname, "src/test/stubs/db-client.stub.ts");

  return {
    name: "e2e-db-stub",
    enforce: "pre",
    resolveId(source: string, importer?: string) {
      if (!isE2ERun) return null;

      // Redirect any relative ./config import that comes from inside src/server/db/
      if (
        importer &&
        importer.startsWith(dbDir) &&
        (source === "./config" || source === "./config.js" || source === "./config.ts")
      ) {
        return configStub;
      }

      // Belt-and-braces: catch absolute-path imports of db/client or db/config
      // that somehow slip past the resolve.alias entries below.
      const normalized = source.replace(/\\/g, "/");
      if (/\/src\/server\/db\/client(\.ts|\.js)?$/.test(normalized)) return clientStub;
      if (/\/src\/server\/db\/config(\.ts|\.js)?$/.test(normalized)) return configStub;

      return null;
    },
  };
}

function apiDevPlugin(): Plugin {
  return {
    name: "api-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api")) return next();
        try {
          const mod = await server.ssrLoadModule("/src/server/entry.ts");
          const handler = mod.default;
          handler(req, res, next);
        } catch (err) {
          if (err instanceof Error) server.ssrFixStacktrace(err);
          next(err);
        }
      });
    }
  };
}

const allowedHosts: string[] = [];
const corsOrigins: string[] = [];

if (process.env.FRONTEND_DOMAIN) {
  const frontendHost = extractHostname(process.env.FRONTEND_DOMAIN);
  allowedHosts.push(frontendHost);
  corsOrigins.push(`http://${frontendHost}`, `https://${frontendHost}`);
}
if (process.env.ALLOWED_ORIGINS) {
  const origins = process.env.ALLOWED_ORIGINS.split(",");
  allowedHosts.push(...origins.map(extractHostname));
  corsOrigins.push(...origins);
}
if (process.env.VITE_PARENT_ORIGIN) {
  allowedHosts.push(extractHostname(process.env.VITE_PARENT_ORIGIN));
  corsOrigins.push(process.env.VITE_PARENT_ORIGIN);
}
if (allowedHosts.length === 0) {
  allowedHosts.push("*");
}
if (corsOrigins.length === 0) {
  corsOrigins.push("*");
}

// ---------------------------------------------------------------------------
export default defineConfig(({ mode, isSsrBuild }) => ({
  envPrefix: ["VITE_", "SITE_"],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },

  plugins: [
    // ---------------------------------------------------------------------------
    // Frozen-snapshot eviction plugin
    // The browser's module registry has a frozen compiled copy of RootLayout.tsx
    // at ?t=1783772358219. That snapshot references SOSAlertPopup as a free
    // variable (module-scope identifier). ES modules are strict — free variables
    // that aren't declared in the module throw ReferenceError regardless of
    // globalThis. The only fix is to prevent the browser from executing that
    // frozen URL at all.
    //
    // This middleware intercepts ANY request for RootLayout.tsx that carries the
    // frozen timestamp and returns a JS module that re-exports everything from
    // the current RootLayout.tsx (without the timestamp). The browser executes
    // this shim instead of the frozen snapshot, so SOSAlertPopup is never
    // referenced as an undeclared identifier.
    // ---------------------------------------------------------------------------
    {
      name: 'evict-frozen-rootlayout-snapshot',
      configureServer(server: ViteDevServer) {
        server.middlewares.use((req, res, next) => {
          if (
            req.url &&
            req.url.includes('RootLayout.tsx') &&
            req.url.includes('t=1783772358219')
          ) {
            // Serve the current transformed RootLayout at the frozen URL.
            // transformRequest expects the URL as Vite sees it (with leading /).
            server.transformRequest('/src/layouts/RootLayout.tsx').then((result) => {
              if (result?.code) {
                res.setHeader('Content-Type', 'application/javascript');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.end(result.code);
              } else {
                next();
              }
            }).catch(() => next());
            return;
          }
          next();
        });
      },
    } as Plugin,
    // Intercept the stale Vite-pre-bundled leaflet chunk that browsers have
    // disk-cached from before Leaflet was removed. The hash in the URL is
    // immutable so browsers never re-validate it.
    // Two-pronged fix:
    //   1. resolveId + load — intercepts the module ID at bundle time so Vite
    //      prebundles an empty stub instead of the real leaflet package.
    //   2. configureServer middleware — intercepts any HTTP request for
    //      leaflet.js (stale disk-cached chunk) and returns the same stub.
    {
      name: 'evict-stale-leaflet-prebundle',
      enforce: 'pre' as const,
      resolveId(id: string) {
        if (id === 'leaflet' || id.includes('/leaflet/') || id.endsWith('/leaflet')) {
          return '\0virtual:leaflet-stub';
        }
      },
      load(id: string) {
        if (id === '\0virtual:leaflet-stub') {
          return 'export default {}; export const map = () => ({}); export const tileLayer = () => ({addTo:()=>({})}); export const marker = () => ({}); export const icon = () => ({}); export const latLng = () => ({}); export const latLngBounds = () => ({});';
        }
      },
      // Transform hook: intercept the pre-bundled leaflet dep chunk when Vite
      // serves it (catches the ?v= versioned path that configureServer may miss
      // if the browser has it in disk cache and revalidates with a 304).
      transform(_code: string, id: string) {
        if (id.includes('leaflet') && (id.includes('node_modules') || id.includes('.vite/deps'))) {
          return { code: 'export default {}; export const map = () => ({}); export const tileLayer = () => ({addTo:()=>({})});', map: null };
        }
      },
      configureServer(server: ViteDevServer) {
        server.middlewares.use((req, res, next) => {
          // Match leaflet.js with or without Vite's ?v= cache-bust query param
          // e.g. /node_modules/.vite/deps/leaflet.js?v=05d76b4a
          const url = req.url ?? '';
          const urlBase = url.split('?')[0];
          if (urlBase.endsWith('leaflet.js') || url.includes('leaflet.js?')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Clear-Site-Data', '"cache"');
            res.end('export default {}; export const map = () => {}; export const tileLayer = () => ({addTo:()=>{}});');
            return;
          }
          if (req.url && req.url.includes('sw-leaflet-evict.js')) {
            res.setHeader('Service-Worker-Allowed', '/');
          }
          next();
        });
      },
    } as Plugin,
    react({
      babel: {
        // sourceMapperPlugin is a Babel plugin (not a Vite plugin).
        // Only include it when the builder module is present.
        plugins: sourceMapperPlugin ? [sourceMapperPlugin] : [],
      }
    }),
    // E2E DB stub plugin — intercepts relative ./config imports inside
    // src/server/db/ so the dev server never reads /local/config.json
    // during `npm run test:e2e`. No-op when isE2ERun is false.
    e2eDbStubPlugin(),
    apiDevPlugin(),
    // Optional builder-only Vite plugins — skipped when null (local dev)
    formatOverridesPlugin  ? (formatOverridesPlugin as (d: string) => Plugin)(__dirname) : null,
    contentPlugin          ? (contentPlugin as () => Plugin)()                           : null,
    ...(mode === "development" ? [
      devToolsPlugin         ? (devToolsPlugin         as () => Plugin)() : null,
      fullStoryPlugin        ? (fullStoryPlugin         as () => Plugin)() : null,
      errorInterceptorPlugin ? (errorInterceptorPlugin  as () => Plugin)() : null,
      mediaVersionsPlugin    ? (mediaVersionsPlugin     as () => Plugin)() : null,
    ] : []),
  ].filter(Boolean) as Plugin[],


  resolve: {
    // Prefer the ESM export condition over the CJS `node` condition.
    // react-router v8 exports via package.json exports map — listing "import"
    // before "node" ensures ssrLoadModule gets the ESM build.
    conditions: ['import', 'module', 'browser', 'default'],
    dedupe: ["react", "react-dom", "react-router"],
    alias: [
      // react-router v8 is the unified package (react-router-dom no longer exists
      // as a separate package). No alias needed — Vite resolves react-router via
      // its package.json exports map. The old hard-alias to react-router-dom/dist/
      // index.mjs has been removed because that file does not exist in v8.
      // During SSR build, redirect browser-only packages to an empty stub so
      // they are not bundled into server.bundle.mjs. This saves ~400 kB of
      // uncompressed JS and reduces peak Rollup memory by ~200 MB.
      // NOTE: use a customResolver so subpath imports (e.g. react-pdf/dist/Page/AnnotationLayer.css)
      // are also intercepted — a plain regex replacement would concatenate the stub path
      // with the subpath suffix, producing a broken file path.
      ...(isSsrBuild ? [
        {
          find: /^react-pdf(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        {
          find: /^pdfjs-dist(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // lucide-react and @heroicons are icon libraries — they are never used
        // in server-side logic, only in React component render output.
        // Aliasing them to an icon-stub during SSR build replaces their ~53 MB
        // of source with a tiny proxy that returns null-rendering React components.
        // This saves ~53 MB of AST from Rollup's render phase without breaking
        // SSR (the stub satisfies all named imports as no-op components).
        {
          find: /^lucide-react(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/icon-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/icon-stub.ts'); },
        },
        {
          find: /^@heroicons(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/icon-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/icon-stub.ts'); },
        },
        // date-fns-jalali is a 15.5 MB Persian calendar variant of date-fns.
        // It is a transitive dep (not imported anywhere in our server code).
        // Stubbing it during SSR build saves ~15.5 MB of AST from Rollup's
        // render phase without any runtime impact.
        {
          find: /^date-fns-jalali(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // jsdom is a 11.2 MB test/DOM-emulation library. It is a direct dep
        // but is only used in test files — never imported by any server handler.
        // Stubbing it during SSR build saves ~11.2 MB of AST.
        {
          find: /^jsdom(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // @babel/* is used only by the source-mapper Vite plugin (build-time).
        // It is never imported by any server handler. Stubbing it saves ~11 MB.
        {
          find: /^@babel(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // html-to-image uses browser canvas/DOM APIs — never used server-side.
        // Saves ~2 MB of AST.
        {
          find: /^html-to-image(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // drizzle-kit is a CLI migration tool — never imported at SSR runtime.
        // Saves ~9.8 MB of AST.
        {
          find: /^drizzle-kit(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // es-abstract + related polyfill packages — pulled in transitively,
        // never used in server handlers. Saves ~10 MB of AST.
        {
          find: /^es-abstract(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // react-markdown + remark/rehype pipeline — client-side rendering only.
        // Saves ~3 MB of AST.
        {
          find: /^react-markdown(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // i18next + react-i18next — frontend translation layer, never used
        // in server handlers. Saves ~2 MB of AST.
        {
          find: /^i18next(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        {
          find: /^react-i18next(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // @lexical/* — rich-text editor, client-only. Saves ~8 MB of AST.
        {
          find: /^@lexical(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        {
          find: /^lexical(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // embla-carousel, react-day-picker, input-otp, vaul, cmdk — UI widgets
        // that ARE imported by src/components/ui/*.tsx wrappers. Do NOT stub
        // the npm packages themselves — Rollup resolves named imports statically
        // and the stub would fail to satisfy them. These packages are small
        // enough (~3 MB combined) that the memory saving is not worth the risk.
        //
        // @tanstack/react-query — NOT stubbed. entry-server.tsx calls
        // `new QueryClient()` at SSR render time, so the real class must be
        // present in the SSR bundle. The package is ~2 MB — acceptable cost.
        //
        // date-fns — 38 MB of locale/format modules, never imported server-side.
        {
          find: /^date-fns(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // react-hook-form — form state management, client-only.
        {
          find: /^react-hook-form(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // motion/react — animation library. Uses DOM APIs so it can't run
        // server-side as-is. We replace it with a dedicated SSR stub that
        // renders motion.div / motion.span etc. as plain HTML elements so
        // the SSR render doesn't crash.
        {
          find: /^motion(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/motion-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/motion-stub.ts'); },
        },
        // better-auth/react — client-side auth hooks (useSession, createAuthClient).
        // Imported by src/lib/auth/auth-client.tsx → routes.tsx → entry-server.
        // This causes better-auth to appear in BOTH the static API handler graph
        // (via auth.ts) AND the dynamic entry-server chunk, forcing Rollup to
        // create 2-3 duplicate better-auth chunks (~500 KB each) during render.
        // Stubbing better-auth/react eliminates the duplicate chunks and saves
        // ~1 MB of AST from the SSR render phase.
        {
          find: /^better-auth\/react(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/better-auth-client-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/better-auth-client-stub.ts'); },
        },
        // @heroicons/react — icon library, client-only (already covered by icon-stub
        // above but belt-and-braces for any subpath imports not caught by that alias).
        //
        // @opentelemetry — 14.3 MB transitive dep (pulled in by better-auth / openai).
        // better-auth imports named constants from @opentelemetry/semantic-conventions
        // for its optional instrumentation layer. We use a dedicated stub that exports
        // those named constants as empty strings so Rollup's named-export resolution
        // succeeds without bundling the full 14 MB package.
        {
          find: /^@opentelemetry(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/opentelemetry-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/opentelemetry-stub.ts'); },
        },
        // @jimp — 8.3 MB image-processing library, transitive dep, never used server-side.
        {
          find: /^@jimp(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        {
          find: /^jimp(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // gifwrap — 6.2 MB GIF processing library, transitive dep, never used server-side.
        {
          find: /^gifwrap(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // docx — 7.2 MB Word document generation library, transitive dep.
        // Our DOCX export handler uses pure-JS ZIP (no docx package).
        {
          find: /^docx(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // openai — 17 MB npm SDK, never directly imported in our server code.
        // All AI calls use fetch() directly. This is a transitive dep only.
        {
          find: /^openai(\/.*)?$/,
          replacement: path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'),
          customResolver() { return path.resolve(__dirname, 'src/fallbacks/browser-only-stub.ts'); },
        },
        // @aws-sdk — actively used by r2Provider.ts (S3Client, PutObjectCommand, etc.)
        // for Cloudflare R2 storage. Must NOT be stubbed — the real SDK must be
        // bundled into server.bundle.mjs so photo upload/download works at runtime.
      ] : []),
      { find: 'nothing', replacement: '/src/fallbacks/missingModule.ts' },
      // ── dev-tools alias ────────────────────────────────────────────────────
      // The builder sandbox exposes AiroErrorBoundary from ./dev-tools/src/.
      // When running locally that directory is absent, so we point at the
      // project-local copy under src/dev-tools/ instead. tryLoad() already
      // guards the Vite plugin import; this alias guards any direct JSX import.
      {
        find: '@/dev-tools/AiroErrorBoundary',
        replacement: path.resolve(__dirname, './src/dev-tools/AiroErrorBoundary.tsx'),
      },
      // ── virtual:content fallback ────────────────────────────────────────────
      // The real virtual:content module is generated by contentPlugin at build
      // time. When contentPlugin is absent (local dev / E2E) Vite would 404 on
      // any import of virtual:content. Point at the permanent fallback file so
      // the dev server and E2E runner both get a valid (empty-shape) module.
      {
        find: 'virtual:content',
        replacement: path.resolve(__dirname, './src/content/virtual-content-fallback.ts'),
      },
      { find: '@/api', replacement: path.resolve(__dirname, './src/server/api') },
      // ── E2E / local-dev DB stubs ──────────────────────────────────────────
      // When PW_E2E=1 / VITE_E2E=1 / CI=1, redirect db/client and db/config
      // to safe no-op stubs so the Vite dev server never reads /local/config.json
      // during `npm run test:e2e`. Aliases are no-ops (undefined) when not in
      // E2E mode so normal dev/build behaviour is completely unaffected.
      //
      // Four alias forms per module to cover all import patterns:
      //   1. Absolute path regex  — catches resolved absolute paths
      //   2. @/server/db/...      — catches the @-alias form used in auth.ts etc.
      //   3. db/client / db/config — catches bare specifier forms
      //   4. Windows regex [/\\]  — already handled by the regex forms above
      ...(isE2ERun ? [
        // db/client
        {
          find: /[/\\]src[/\\]server[/\\]db[/\\]client(?:\.ts|\.js)?$/,
          replacement: path.resolve(__dirname, './src/test/stubs/db-client.stub.ts'),
        },
        {
          find: '@/server/db/client',
          replacement: path.resolve(__dirname, './src/test/stubs/db-client.stub.ts'),
        },
        // db/config
        {
          find: /[/\\]src[/\\]server[/\\]db[/\\]config(?:\.ts|\.js)?$/,
          replacement: path.resolve(__dirname, './src/test/stubs/db-config.stub.ts'),
        },
        {
          find: '@/server/db/config',
          replacement: path.resolve(__dirname, './src/test/stubs/db-config.stub.ts'),
        },
      ] : []),
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },

  optimizeDeps: {
    // NOTE: leaflet is NOT listed here — it was removed from the project.
    // The old leaflet.js?v=05d76b4a hash was cached in browsers; changing
    // this include list changes the metadata hash so Vite generates a new
    // version query string, making the old cached URL unreachable.
    include: ["react", "react-dom", "react-router", "motion/react", "react/jsx-runtime"],
    // Explicitly exclude leaflet so it is never pre-bundled. Combined with the
    // resolveId stub in the evict-stale-leaflet-prebundle plugin, any import of
    // leaflet resolves to an empty stub. Adding it here also changes the dep
    // metadata hash, invalidating the old leaflet.js?v=05d76b4a disk-cache entry.
    exclude: ["drizzle-orm", "mysql2", "leaflet"],
    // Force react-router-dom through Vite's ESM pre-bundler so ssrLoadModule
    // always gets the ESM build (not the CJS fallback) in dev SSR mode.
    esbuildOptions: { target: "esnext" },
  },

  ssr: {
    // During `vite build --ssr` (publish): bundle ALL npm deps into
    // server.bundle.mjs — the publish container runs the pre-built bundle
    // directly with NO node_modules present (fast-path deploy).
    // noExternal: true ensures every import is inlined by Rollup so the
    // bundle is fully self-contained.
    //
    // During dev (`vite` / ssrLoadModule): leave noExternal as [] so Vite's
    // CJS-interop layer can handle packages like express normally. Setting
    // noExternal:true in dev causes "module is not defined" for CJS packages.
    // react-router must be in noExternal in dev so ssrLoadModule gets the
    // ESM build and named exports like createStaticRouter resolve correctly.
    noExternal: isSsrBuild ? true : ['react-router'],
    external: [
      // These packages are browser-only and must never be bundled into the
      // SSR bundle. With noExternal:true, Vite's ssr.external check uses
      // .includes(id) on the bare specifier — so list exact package names here.
      // Rollup-level regex externals are ignored when noExternal:true.
      'pdfjs-dist',
      'react-pdf',
      '@napi-rs',
      '@napi-rs/canvas',
      'canvas',
      // html-to-image uses canvas/DOM APIs — browser only.
      'html-to-image',
      // drizzle-kit is a CLI migration tool — never needed at SSR runtime.
      'drizzle-kit',
      // mammoth is a large DOCX parser (~8 MB). The main DOCX import handler
      // was rewritten to use JSZip, but two other endpoints still import it
      // dynamically. Externalising prevents OOM during the SSR Rollup build.
      // Those endpoints will gracefully handle the missing module at runtime.
      'mammoth',
      // NOTE: lucide-react and @heroicons are NOT externalized here — they are
      // aliased to a stub in resolve.alias (below) during SSR build so they
      // compile to near-zero bytes rather than their full ~53 MB on disk.
      // Externalizing them would break SSR rendering in the publish container
      // (which has no node_modules).
    ],
  },

  server: {
    host: process.env.HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "5173"),
    strictPort: !!process.env.PORT,
    allowedHosts: true,
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "User-Agent"]
    },
    hmr: {
      overlay: false
    },
    watch: {
      ignored: ["**/dist/**"]
    },
    // Pre-transform the entry chain on dev-server start so the FIRST iframe
    // request doesn't pay the full cold on-demand transpile cost. Paired with
    // the container's pre-start `vite optimize` (container-scripts/preview/
    // nomad_setup.sh), this shrinks the mount→IFRAME_READY window that the
    // builder's recovery logic waits on.
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/App.tsx"]
    }
  },

  preview: {
    host: process.env.HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "5173"),
    strictPort: !!process.env.PORT,
    allowedHosts,
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "User-Agent"]
    }
  },

  build: isSsrBuild ?
  {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: false,
    reportCompressedSize: false,
    // minifyIdentifiers MUST be false for the server bundle — esbuild mangles
    // constructor names (S3Client → o, PutObjectCommand → n, etc.) which
    // breaks `new X()` calls at runtime with "o is not a constructor".
    // keepNames: true preserves all function/class names during minification
    // without disabling identifier mangling for local variables (safe).
    minify: 'esbuild',
    esbuildOptions: { keepNames: true },
    // ssr: true enables SSR mode (noExternal, CJS interop) without overriding
    // rollupOptions.input. When ssr is a string, Vite replaces input with that
    // string — using `true` lets us declare multiple entry points below so
    // Rollup splits shared modules into separate chunks, reducing peak RSS.
    ssr: true,
    // Declare the route group files as additional Rollup entry points.
    // When multiple entry points share modules, Rollup splits those modules
    // into separate chunks instead of inlining everything into one giant
    // server.bundle.mjs. This reduces the peak render RSS by ~100–150 MB
    // because Rollup serialises each chunk independently rather than holding
    // the entire 1.3 MB entry AST in memory at once.
    rollupOptions: {
      input: {
        // Single entry point — route group files are imported statically from
        // entry.ts so Rollup builds ONE module graph sequentially. Multiple
        // entry points force Rollup to hold all graphs in memory simultaneously,
        // which caused OOM kills at ~1.1 GB. Single-entry peak RSS is ~600 MB.
        'server.bundle': 'src/server/entry.ts',
      },
      // pdfjs-dist and react-pdf are browser-only. They're listed in
      // ssr.external above (bare specifier strings) so Vite's noExternal:true
      // logic skips them. The Rollup-level external below is a belt-and-braces
      // fallback for any sub-path imports (e.g. pdfjs-dist/build/pdf.worker.mjs)
      // that Vite resolves to absolute paths before Rollup sees them.
      // lucide-react and @heroicons are handled via resolve.alias stubs — they
      // compile to near-zero bytes rather than being externalized, so SSR
      // rendering still works in the publish container (no node_modules).
      external: (id: string) => {
        // #airo/secrets is a package.json `imports` subpath alias injected by
        // the publish platform at runtime — Rollup cannot resolve it at build time.
        if (id === '#airo/secrets') return true;
        return id.includes('node_modules/pdfjs-dist') || id.includes('node_modules/react-pdf');
      },
      treeshake: {
        // IMPORTANT: Keep this as `false` — it tells Rollup to treat ALL modules
        // as side-effect-free, enabling maximum dead-code elimination and keeping
        // peak SSR build memory under the 1600 MB heap limit.
        //
        // The `if (import.meta.env.PROD) { ... app.listen() ... }` block in
        // entry.ts IS preserved correctly with this setting because Vite replaces
        // `import.meta.env.PROD` with `true` during the SSR build, making the
        // block unconditional — Rollup then includes it as live code.
        //
        // DO NOT change this to 'no-external' or a function — both cause the SSR
        // build to process more module-level code, increasing peak RSS above the
        // heap limit and causing an OOM kill that leaves the bundle incomplete.
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        // Treat unknown globals as side-effect-free so Rollup can eliminate
        // more dead code from large packages like openai, stripe, etc.
        unknownGlobalSideEffects: false,
      },
      // Allow Rollup to split the SSR output into chunks — this lets it
      // parallelise the bundling of large deps and reduces peak memory.
      // The entry point is still server.bundle.mjs; heavy deps land in bin/.
      output: {
        format: "es",
        // Use [name].mjs for entry points so server.bundle stays server.bundle.mjs.
        // Route group files are no longer separate entry points — they are
        // imported statically from entry.ts and bundled as regular chunks.
        entryFileNames: "[name].mjs",
        chunkFileNames: "bin/[name]-[hash].js",
        banner: "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);",
        // Split the heaviest deps into separate chunks to reduce peak memory
        // during Rollup's rendering phase. Rules:
        //   - Only split at package boundaries (node_modules/<pkg>) — never
        //     at sub-paths, because internal cross-imports create circular
        //     chunk dependencies that Rollup warns about and then merges back,
        //     wasting the split entirely.
        //   - Keep aws-s3 and aws-sdk in ONE chunk — the S3 sub-packages
        //     import from the core SDK, so splitting them creates a cycle.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/openai')) return 'ai-openai';
          if (id.includes('node_modules/@anthropic-ai')) return 'ai-anthropic';
          if (id.includes('node_modules/pdf-lib')) return 'pdf-lib';
          if (id.includes('node_modules/stripe')) return 'stripe';
          if (id.includes('node_modules/@aws-sdk') || id.includes('node_modules/@smithy') || id.includes('node_modules/@aws-crypto')) return 'aws-sdk';
          // Split iconv-lite out of mysql2 — iconv is ~400 kB on disk and
          // keeping it separate reduces the peak render size of the mysql2 chunk.
          if (id.includes('node_modules/iconv-lite') || id.includes('node_modules/safer-buffer')) return 'iconv';
          if (id.includes('node_modules/mysql2')) return 'mysql2';
          if (id.includes('node_modules/drizzle-orm')) return 'drizzle';
          // Split @noble/* out of better-auth — noble is also used by otplib,
          // and keeping it separate avoids duplicating it across both chunks.
          if (id.includes('node_modules/@noble/')) return 'noble';
          if (id.includes('node_modules/better-auth') || id.includes('node_modules/@better-auth') || id.includes('node_modules/@better-fetch')) return 'better-auth';
          if (id.includes('node_modules/kysely')) return 'kysely';
          if (id.includes('node_modules/xero-node')) return 'xero';
          if (id.includes('node_modules/jimp') || id.includes('node_modules/@jimp')) return 'jimp';
          if (id.includes('node_modules/docx')) return 'docx';
          if (id.includes('node_modules/jszip')) return 'jszip';
          if (id.includes('node_modules/mammoth')) return 'mammoth';
          // Splitting them keeps them out of the entry bundle.
          if (id.includes('node_modules/otplib') || id.includes('node_modules/@otplib') || id.includes('node_modules/@scure/base') || id.includes('node_modules/@otplib/plugin-base32-scure') || id.includes('node_modules/@otplib/plugin-crypto-noble')) return 'otplib';
          if (id.includes('node_modules/qrcode') || id.includes('node_modules/dijkstrajs')) return 'qrcode';
          // ── Additional splits to reduce peak Rollup render-phase RSS ──────────
          // date-fns is 38 MB on disk — one of the largest deps in the bundle.
          // Splitting it into its own chunk prevents Rollup from holding its
          // entire AST in memory alongside the entry bundle during rendering.
          if (id.includes('node_modules/date-fns')) return 'date-fns';
          // react-dom is 7 MB — split it so it doesn't inflate the entry bundle.
          if (id.includes('node_modules/react-dom')) return 'react-dom';
          // react-router pulls in a large history/routing tree — split it.
          if (id.includes('node_modules/react-router') && !id.includes('react-router')) return 'react-router';
          // @radix-ui is 6.8 MB of UI primitives — split into its own chunk.
          if (id.includes('node_modules/@radix-ui')) return 'radix-ui';
          // @opentelemetry is pulled in by better-auth/mysql2 tracing hooks.
          // 14 MB on disk — split it to keep the better-auth chunk smaller.
          if (id.includes('node_modules/@opentelemetry')) return 'opentelemetry';
          // zod is used across many modules; splitting it avoids duplicating
          // its AST in every chunk that imports it during the render phase.
          if (id.includes('node_modules/zod')) return 'zod';
          // yjs + lib0 are used by the collaborative editor — large and self-contained.
          if (id.includes('node_modules/yjs') || id.includes('node_modules/lib0')) return 'yjs';
          // tldts is used by better-auth for cookie domain parsing — 3 MB, self-contained.
          if (id.includes('node_modules/tldts')) return 'tldts';
          // undici is the fetch implementation used by openai/stripe — split it
          // so it doesn't inflate the entry bundle.
          if (id.includes('node_modules/undici')) return 'undici';
          // ── New splits added to address heap OOM during SSR build ─────────────
          // @lexical/* is a rich-text editor suite (~8 MB total) used only in
          // client-side document builder components. Split it out so it doesn't
          // inflate the SSR entry bundle.
          if (id.includes('node_modules/@lexical') || id.includes('node_modules/lexical')) return 'lexical';
          // i18next + react-i18next are frontend-only (~2 MB). Split them out.
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'i18n';
          // gifwrap is pulled in by @jimp — 6 MB, self-contained.
          if (id.includes('node_modules/gifwrap') || id.includes('node_modules/omggif')) return 'gifwrap';
          // @babel/* devDeps can get pulled in transitively — split them to
          // prevent them inflating the entry bundle.
          if (id.includes('node_modules/@babel')) return 'babel';
          // drizzle-kit is a CLI tool (9.8 MB) that should never be in the
          // runtime bundle — split it into its own chunk so tree-shaking can
          // eliminate it if nothing actually imports it at runtime.
          if (id.includes('node_modules/drizzle-kit')) return 'drizzle-kit';
          // es-abstract is pulled in by some polyfill chains — 10 MB, split it.
          if (id.includes('node_modules/es-abstract') || id.includes('node_modules/es-define-property') || id.includes('node_modules/es-errors') || id.includes('node_modules/es-object-atoms') || id.includes('node_modules/es-set-tostringtag')) return 'es-abstract';
          // html-to-image is client-only (canvas API) — split it out.
          if (id.includes('node_modules/html-to-image')) return 'html-to-image';
          // react-markdown + remark/rehype pipeline — frontend rendering only.
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark') || id.includes('node_modules/rehype') || id.includes('node_modules/unified') || id.includes('node_modules/micromark') || id.includes('node_modules/mdast') || id.includes('node_modules/hast')) return 'markdown';
          // ── Phase 2 splits: reduce entry-server chunk size ────────────────────
          // express + its deps are large and self-contained — split them out
          // so they don't inflate the server.bundle entry chunk.
          if (id.includes('node_modules/express') || id.includes('node_modules/body-parser') || id.includes('node_modules/finalhandler') || id.includes('node_modules/send') || id.includes('node_modules/serve-static') || id.includes('node_modules/router') || id.includes('node_modules/depd') || id.includes('node_modules/on-finished') || id.includes('node_modules/qs') || id.includes('node_modules/range-parser') || id.includes('node_modules/raw-body')) return 'express';
          // multer is used for file uploads — split it out.
          if (id.includes('node_modules/multer') || id.includes('node_modules/busboy') || id.includes('node_modules/streamsearch')) return 'multer';
          // sharp/canvas alternatives — jimp deps that are large.
          if (id.includes('node_modules/@thi.ng') || id.includes('node_modules/tinycolor2')) return 'jimp-deps';
          // nanoid is small but used everywhere — keep in main bundle.
          // sharp is not installed (we use jimp) — no split needed.
          return undefined;
        },
      }
    }
  } :
  {
    outDir: "dist/client",
    emptyOutDir: true,
    copyPublicDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    minify: 'esbuild',
    // Target iOS Safari 15+ (covers iPhone 6s and later on iOS 15+).
    // Without an explicit target Vite defaults to "modules" which can emit
    // syntax that older Safari versions reject with "o is not a constructor"
    // or similar minification-mangled errors.
    target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Only split truly leaf packages that have no cross-chunk deps.
          // Do NOT use a catch-all 'vendor' bucket — it creates circular
          // references when packages in different named chunks depend on each other.
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }
          if (id.includes('pdfjs-dist') || id.includes('react-pdf')) {
            return 'document-vendor';
          }
          // Let Rollup auto-chunk everything else to avoid circular deps.
          return undefined;
        }
      }
    }
  }
}));