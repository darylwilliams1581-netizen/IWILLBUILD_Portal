// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build, createServer, type ViteDevServer } from 'vite'

// Boundary tests for the boot spinner (AIROBUILD-3857). The spinner must be
// injected by the dev server (sibling after #app, CSS :empty gated) and must
// NEVER appear in production build output — published customer sites carry
// zero spinner bytes. Run explicitly in CI (docker-build-v8-template.yml);
// excluded from customer apps like every *.test.* file.
const templateRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('boot spinner injection boundary', () => {
  it('dev serve injects the spinner as a sibling after #app with the :empty gate', async () => {
    const server: ViteDevServer = await createServer({
      root: templateRoot,
      mode: 'development',
      logLevel: 'silent',
      server: { middlewareMode: true },
    })
    try {
      const shellHtml: string = await readFile(path.join(templateRoot, 'index.html'), 'utf8')
      const servedHtml: string = await server.transformIndexHtml('/', shellHtml)

      const appIndex: number = servedHtml.indexOf('id="app"')
      const spinnerIndex: number = servedHtml.indexOf('id="airo-boot-spinner"')
      const bodyCloseIndex: number = servedHtml.lastIndexOf('</body>')
      expect(appIndex).toBeGreaterThan(-1)
      expect(spinnerIndex).toBeGreaterThan(appIndex)
      expect(bodyCloseIndex).toBeGreaterThan(spinnerIndex)
      expect(servedHtml).toContain('#app:not(:empty) ~ #airo-boot-spinner')
      // Grace delay: the spinner starts invisible and only fades in after 1s,
      // so loads that mount within the window never paint it. No sessionStorage
      // warm-stamp heuristic remains.
      expect(servedHtml).toContain('animation: airo-boot-fade 0.2s ease 1s forwards')
      expect(servedHtml).not.toContain('__airo_warm_reload')
    } finally {
      await server.close()
    }
  }, 60000)

  it('production build output contains zero spinner bytes', async () => {
    const outDir: string = await mkdtemp(path.join(tmpdir(), 'v8-spinner-build-'))
    try {
      await build({
        root: templateRoot,
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true, copyPublicDir: false },
      })
      const builtHtml: string = await readFile(path.join(outDir, 'index.html'), 'utf8')
      expect(builtHtml).not.toContain('airo-boot')
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 120000)
})
