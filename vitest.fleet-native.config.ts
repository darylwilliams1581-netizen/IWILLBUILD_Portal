import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom', maxWorkers: 1, minWorkers: 1, testTimeout: 10000,
    include: ['tests/fleet-native/*.test.ts', 'tests/fleet-native/*.test.tsx', 'src/lib/__tests__/tripLogbookStore.test.ts'],
  },
});
