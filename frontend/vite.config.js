import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const runtimeConstants = require('../runtime/constants')
const buildVersion = process.env.VITE_APP_VERSION
  || process.env.APP_VERSION
  || new Date().toISOString()
const frontendPort = Number(runtimeConstants.ports.frontend)

export default defineConfig({
  plugins: [svelte()],
  define: {
    __RUNTIME_PORTS__: JSON.stringify(runtimeConstants.ports),
    __RUNTIME_SERVER_HOST__: JSON.stringify(runtimeConstants.server.host),
    __RUNTIME_COMPRESSION__: JSON.stringify(runtimeConstants.compression),
    __APP_VERSION__: JSON.stringify(buildVersion)
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