import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const runtimeConstants = require('../runtime/constants');

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  define: {
    __RUNTIME_PORTS__: JSON.stringify(runtimeConstants.ports),
    __RUNTIME_SERVER_HOST__: JSON.stringify(runtimeConstants.server.host)
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./setupTests.js'],
    include: ['src/**/*.{test,spec}.{js,ts}']
  },
  resolve: {
    conditions: ['browser'],
    alias: {
      $lib: path.resolve('./src/lib'),
      $components: path.resolve('./src/components'),
      $stores: path.resolve('./src/stores'),
      $utils: path.resolve('./src/utils')
    }
  }
});
