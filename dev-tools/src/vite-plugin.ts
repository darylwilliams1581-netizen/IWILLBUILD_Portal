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

// Boot spinner (AIROBUILD-3857): injected at SERVE time as a sibling of #app.
// Purely load-state-driven: the spinner starts invisible (opacity 0) and only
// fades in after a 1s grace delay if #app is still empty by then. Loads that
// mount within the grace window (warm reloads, builder iframe remounts) never
// show it; anything slower (cold starts, dep re-optimization) gets loading
// feedback until #app receives its first element child (MutationObserver),
// then the spinner is removed from the DOM permanently. Injected here rather
// than in index.html so production builds never carry it: this plugin is
// `apply: 'serve'` and vite.config gates it to development mode. Must stay a
// SIBLING (not child of #app) to keep main.tsx's hydrate/createRoot detection
// (rootElement.firstElementChild) intact. The z-index sits below error-overlay
// ranges; 90s self-destruct backstop ensures it never permanently masks
// failures.
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
    pointer-events: none;
    animation: airo-boot-fade 0.2s ease 1s forwards;
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
// (a heavily customized shell). Otherwise the spinner stays until #app
// receives content (MutationObserver) — visibility is handled entirely by
// the CSS grace-delay fade, so loads that mount within the grace window
// never paint it. Reveals "taking longer" after 20s and removes entirely
// after 90s as a backstop.
const BOOT_SPINNER_SLOW_SCRIPT = `
      (function () {
        var spinner = document.getElementById('airo-boot-spinner');
        if (!spinner) return;
        var appEl = document.getElementById('app');
        if (!appEl) {
          spinner.remove();
          return;
        }
        if (appEl.firstElementChild) {
          spinner.remove();
          return;
        }
        var observer = new MutationObserver(function () {
          if (appEl.firstElementChild) {
            observer.disconnect();
            spinner.remove();
          }
        });
        observer.observe(appEl, { childList: true });
        setTimeout(function () { spinner.classList.add('airo-boot-slow'); }, 20000);
        setTimeout(function () { observer.disconnect(); spinner.remove(); }, 90000);
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
