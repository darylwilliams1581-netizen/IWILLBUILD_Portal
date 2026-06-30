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
    alias: {
      nothing: "/src/fallbacks/missingModule.ts",
      "@/api": path.resolve(__dirname, "./src/server/api"),
      "@": path.resolve(__dirname, "./src")
    }
  },

  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "motion/react"], exclude: ["drizzle-orm", "mysql2"]
  },

  ssr: {
    // During `vite build --ssr` (publish): bundle ALL npm deps into
    // server.bundle.mjs — the publish environment has no node_modules.
    // OOM risk is managed by --max-old-space-size=4096 on the SSR build step.
    //
    // During dev (`vite` / ssrLoadModule): leave noExternal as [] so Vite's
    // CJS-interop layer can handle packages like express normally. Setting
    // noExternal:true in dev causes "module is not defined" for CJS packages.
    noExternal: isSsrBuild ? true : [],
    external: [
      // Always exclude — browser-only or native packages that must never
      // be traversed by Rollup/Node in any context.
      'pdfjs-dist',
      'react-pdf',
      '@napi-rs',
      '@napi-rs/canvas',
      'canvas',
      // Heavy server-only packages — externalized to keep server.bundle.mjs
      // under the publish upload size limit. The publish container has
      // node_modules available at runtime so require() works fine.
      'stripe',
      'drizzle-orm',
      'mysql2',
      'better-auth',
      'pdf-lib',
      'docx',
      'jimp',
      '@jimp',
      'qrcode',
      'bcryptjs',
      'otplib',
      'nodemailer',
      '@aws-sdk',
      'openai',
      'twilio',
      '@opentelemetry',
      'kysely',
      'date-fns',
      'date-fns-jalali',
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
    minify: false,
    ssr: "src/server/entry.ts",
    rollupOptions: {
      output: {
        format: "es",
        entryFileNames: "server.bundle.mjs",
        chunkFileNames: "bin/[name]-[hash].js",
        banner: "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);"
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