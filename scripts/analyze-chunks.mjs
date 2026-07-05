import { build } from 'vite';

await build({
  configFile: './vite.config.ts',
  logLevel: 'silent',
  build: {
    ssr: 'src/server/entry.ts',
    emptyOutDir: false,
    rollupOptions: {
      plugins: [{
        name: 'chunk-analyzer',
        generateBundle(_opts, bundle) {
          for (const [name, chunk] of Object.entries(bundle)) {
            if (chunk.type !== 'chunk') continue;
            const mods = Object.keys(chunk.modules || {});
            const pkgs = [...new Set(
              mods
                .filter(m => m.includes('node_modules'))
                .map(m => m.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1])
                .filter(Boolean)
            )];
            const sizeKb = Math.round(
              mods.reduce((s, m) => s + (chunk.modules[m]?.renderedLength || 0), 0) / 1024
            );
            if (sizeKb > 100) {
              console.log(`\nCHUNK ${name} (${sizeKb} kB):`);
              pkgs.forEach(p => console.log('  ', p));
            }
          }
        }
      }]
    }
  }
});
