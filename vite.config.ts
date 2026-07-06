import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { URL } from "node:url";
import sourceMapperPlugin from "./source-mapper/src/index";
import { devToolsPlugin } from "./dev-tools/src/vite-plugin";
import { fullStoryPlugin } from "./fullstory-plugin";
import { errorInterceptorPlugin } from "./dev-tools/src/vite-error-interceptor";
import { mediaVersionsPlugin } from "./dev-tools/src/vite-media-versions-plugin";
import { formatOverridesPlugin } from "./format-overrides-plugin";
import { contentPlugin } from "./content-plugin/src/index";

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

export default defineConfig(({ mode, isSsrBuild }) => ({
  envPrefix: ["VITE_", "SITE_"],

  plugins: [
  react({
    babel: {
      plugins: [sourceMapperPlugin]
    }
  }),
  apiDevPlugin(),
  formatOverridesPlugin(__dirname),
  contentPlugin(),
  ...(mode === "development" ?
  [
  devToolsPlugin() as Plugin,
  fullStoryPlugin(),
  errorInterceptorPlugin(),
  mediaVersionsPlugin() as Plugin] :

  [])],


  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
    alias: [
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
      ] : []),
      { find: 'nothing', replacement: '/src/fallbacks/missingModule.ts' },
      { find: '@/api', replacement: path.resolve(__dirname, './src/server/api') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },

  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "motion/react"], exclude: ["drizzle-orm", "mysql2"]
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
    noExternal: isSsrBuild ? true : [],
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
    minify: 'esbuild',
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
        'server.bundle': 'src/server/entry.ts',
        'routes-jobs': 'src/server/routes-jobs.ts',
        'routes-safety': 'src/server/routes-safety.ts',
        'routes-developer': 'src/server/routes-developer.ts',
        'routes-integrations': 'src/server/routes-integrations.ts',
        'routes-settings': 'src/server/routes-settings.ts',
        'routes-fleet': 'src/server/routes-fleet.ts',
      },
      // pdfjs-dist and react-pdf are browser-only. They're listed in
      // ssr.external above (bare specifier strings) so Vite's noExternal:true
      // logic skips them. The Rollup-level external below is a belt-and-braces
      // fallback for any sub-path imports (e.g. pdfjs-dist/build/pdf.worker.mjs)
      // that Vite resolves to absolute paths before Rollup sees them.
      external: (id: string) => {
        return id.includes('node_modules/pdfjs-dist') || id.includes('node_modules/react-pdf');
      },
      treeshake: {
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
        // Use [name].mjs for entry points so server.bundle stays server.bundle.mjs
        // and route group entries get their own named files (routes-jobs.mjs etc.)
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
          if (id.includes('node_modules/mammoth')) return 'mammoth';
          // These are only used in lazy-loaded routes (2FA, backup export).
          // Splitting them keeps them out of the entry bundle.
          if (id.includes('node_modules/otplib') || id.includes('node_modules/@otplib') || id.includes('node_modules/@scure/base') || id.includes('node_modules/@otplib/plugin-base32-scure') || id.includes('node_modules/@otplib/plugin-crypto-noble')) return 'otplib';
          if (id.includes('node_modules/qrcode') || id.includes('node_modules/dijkstrajs')) return 'qrcode';
          if (id.includes('node_modules/jszip')) return 'jszip';
          // ── Additional splits to reduce peak Rollup render-phase RSS ──────────
          // date-fns is 38 MB on disk — one of the largest deps in the bundle.
          // Splitting it into its own chunk prevents Rollup from holding its
          // entire AST in memory alongside the entry bundle during rendering.
          if (id.includes('node_modules/date-fns')) return 'date-fns';
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