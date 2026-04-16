import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const runtimeConstants = require('../runtime/constants')
const frontendPort = Number(runtimeConstants.ports.frontend)

export default defineConfig({
  plugins: [svelte()],
  define: {
    __RUNTIME_PORTS__: JSON.stringify(runtimeConstants.ports),
    __RUNTIME_SERVER_HOST__: JSON.stringify(runtimeConstants.server.host)
  },
  server: {
    port: frontendPort,
    host: '0.0.0.0',
    allowedHosts: ['190scouting.com', 'localhost', '127.0.0.1', '0.0.0.0'],
    hmr: {
      host: 'localhost',
      port: frontendPort,
      protocol: 'ws'
    }
  },
  preview: {
    port: frontendPort,
    host: '0.0.0.0'
  }
})