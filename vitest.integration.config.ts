import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.integration.test.ts'],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
