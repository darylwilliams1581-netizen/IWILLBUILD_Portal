import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // Workers AI types are Cloudflare-specific — stub them for unit tests
    // The real AI binding is tested post-deploy via the synthetic POC test.
  },
  resolve: {
    // Allow .js extensions in imports (Workers convention)
    extensions: ['.ts', '.js'],
  },
});
