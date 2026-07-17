import type { HtmlTagDescriptor, Plugin } from 'vite'
import { V7_CONFIG } from '../v7-config'

const STATIC_MAIN_ENTRY_RE =
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/src\/main\.tsx["'])[^>]*>\s*<\/script>/i;
const DEV_RETRY_MAIN_ENTRY = `<script type="module">
      await import('/dev-tools/src/error-client.ts')
      let mainLoaded = false
      import('/src/main.tsx').then(() => { mainLoaded = true }).catch(err => {
        // Vite dep optimization can cause transient import failures that resolve
        // in 1-3s. Retry once before reporting the error to avoid false positives.
        setTimeout(() => {
          if (mainLoaded) return
          import('/src/main.tsx').then(() => { mainLoaded = true }).catch(retryErr => {
            window.dispatchEvent(new CustomEvent('vite:initial-error', { detail: retryErr }));
          });
        }, 2000);
      })
    </script>`;

// Boot spinner (AIROBUILD-3857): injected at SERVE time as a sibling of #app
// and hidden by CSS alone the instant the app mounts (#app stops matching
// :empty — the <!--app-html--> placeholder comment does not count as
// content). Injected here rather than written into index.html so production
// builds can never carry it: this plugin is `apply: 'serve'` and vite.config
// additionally gates it to development mode, while `vite build` reads
// index.html directly. It must stay a SIBLING (not a child of #app) to keep
// main.tsx's hydrate/createRoot detection (rootElement.firstElementChild)
// intact. Two guards keep it from ever masking a failure: the z-index sits
// below common error-overlay ranges (Vite's own HMR overlay is disabled in
// vite.config — hmr.overlay:false — so dev-tools' error UI is what matters),
// and the spinner removes itself outright after 90s, revealing whatever
// state is underneath (a Vite forced reload re-injects a fresh one, so long
// dep re-optimizations still show a spinner per document).
const BOOT_SPINNER_CSS = `
  #airo-boot-spinner {
    position: fixed;
    inset: 0;
    z-index: 9998;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: #fff;
    color: #555;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    opacity: 0;
    animation: airo-boot-fade 0.2s ease 0.25s forwards;
  }
  #app:not(:empty) ~ #airo-boot-spinner {
    display: none;
  }
  .airo-boot-ring {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(0, 0, 0, 0.12);
    border-top-color: #555;
    border-radius: 50%;
    animation: airo-boot-spin 0.9s linear infinite;
  }
  .airo-boot-text,
  .airo-boot-slow-text {
    margin: 0;
    font-size: 14px;
  }
  .airo-boot-slow-text {
    display: none;
  }
  #airo-boot-spinner.airo-boot-slow .airo-boot-slow-text {
    display: block;
  }
  @keyframes airo-boot-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes airo-boot-fade {
    to { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .airo-boot-ring {
      animation-duration: 2.4s;
    }
  }
`

const BOOT_SPINNER_BODY = `
      <div class="airo-boot-ring" aria-hidden="true"></div>
      <p class="airo-boot-text">Loading&hellip;</p>
      <p class="airo-boot-slow-text">Still working &mdash; the first load can take a little longer.</p>
    `

// Removes the spinner outright when the served HTML has no #app to watch
// (a heavily customized shell); otherwise reveals the "taking longer" copy
// after 20s and removes the spinner entirely after 90s so it can never
// permanently cover a blank-rendering app or an error overlay. Hiding on
// mount needs no JS — the :empty CSS gate handles it.
const BOOT_SPINNER_SLOW_SCRIPT = `
      (function () {
        var spinner = document.getElementById('airo-boot-spinner');
        if (!spinner) return;
        if (!document.getElementById('app')) {
          spinner.remove();
          return;
        }
        setTimeout(function () { spinner.classList.add('airo-boot-slow'); }, 20000);
        setTimeout(function () { spinner.remove(); }, 90000);
      })();
    `

const BOOT_SPINNER_TAGS: HtmlTagDescriptor[] = [
  { tag: 'style', children: BOOT_SPINNER_CSS, injectTo: 'head' },
  {
    tag: 'div',
    attrs: { id: 'airo-boot-spinner', role: 'status', 'aria-live': 'polite' },
    children: BOOT_SPINNER_BODY,
    injectTo: 'body'
  },
  { tag: 'script', children: BOOT_SPINNER_SLOW_SCRIPT, injectTo: 'body' }
]

/**
 * Vite plugin to inject development tools only in development mode
 * This ensures the dev tools are never included in production builds
 *
 * V7 version: Uses v7-specific configuration for import paths and entry points
 */
export function devToolsInjectorPlugin(): Plugin {
  return {
    name: 'dev-tools-injector',
    apply: 'serve', // Only apply in development mode
    enforce: 'pre', // Run before other plugins
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return {
          html: html.replace(STATIC_MAIN_ENTRY_RE, DEV_RETRY_MAIN_ENTRY),
          tags: BOOT_SPINNER_TAGS
        }
      }
    },
    transform(code, id) {
      // Use v7-specific entry points
      const isEntryPoint = V7_CONFIG.entryPoints.some(entry => id.includes(entry)) ||
                          (V7_CONFIG.hasEntryClient && id.includes('entry-client.tsx'))
      
      if (isEntryPoint) {
        console.log('🔧 Injecting dev tools initialization into v7 entry point...')
        
        // Add dev tools import and initialization after React import
        let result = code
        
        // Find the last import statement
        const importRegex = /import.*from.*['"];?\s*$/gm
        const imports = code.match(importRegex)
        
        if (imports && imports.length > 0) {
          const lastImport = imports[imports.length - 1]
          result = result.replace(
            lastImport,
            lastImport + `\nif (import.meta.env.MODE === 'development') {\n  await import('../dev-tools/src/utils/edit-mode-timer-pause');\n}\n// Auto-inject dev tools in development (v7)\nif (import.meta.env.MODE === 'development') {\n  import('${V7_CONFIG.importPath}').then(({ injectDevelopmentMode }) => {\n    injectDevelopmentMode();\n  });\n}`
          )
        }
        
        console.log('✅ Dev tools auto-injection added to v7 entry point')
        return result
      }
      
      return null
    }
  }
}

/**
 * Dev tools injection plugin only - source mapper should be imported separately
 */
export function devToolsPlugin(): Plugin {
  return devToolsInjectorPlugin()
}
