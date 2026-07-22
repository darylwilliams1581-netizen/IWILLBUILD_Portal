import { describe, expect, it } from 'vitest'

import { devToolsInjectorPlugin } from '../vite-plugin'

type Transform = (code: string, id: string) => string | null | Promise<string | null>

describe('devToolsInjectorPlugin', function plugin() {
  it('handles a failed optional dev-tools import without rejecting the app entry', async function transform() {
    const plugin: ReturnType<typeof devToolsInjectorPlugin> = devToolsInjectorPlugin()
    const run: Transform = plugin.transform as Transform
    const result: string | null = await run("import React from 'react'\n\nReact.createElement('main')", '/app/src/main.tsx')

    expect(result?.match(/import\('\.\.\/dev-tools\/src\/index'\)/g)).toHaveLength(2)
    expect(result).toContain("console.warn('[dev-tools] initial load failed; retrying:', error)")
    expect(result).toContain("console.warn('[dev-tools] failed to load dev tools:', error)")
  })
})
