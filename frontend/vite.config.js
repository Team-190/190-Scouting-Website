import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const runtimeConstants = require('../runtime/constants')
const frontendPort = Number(runtimeConstants.ports.frontend)

export default defineConfig({
  plugins: [svelte(), {
    name: 'offline-assets',
    writeBundle(options, bundle) {
      const assets = Object.keys(bundle).filter(file => file.startsWith('assets/'));
      const buildId = createHash('sha256').update(assets.sort().join('\n')).digest('hex').slice(0, 12);
      fs.writeFileSync(path.join(options.dir, 'offline-assets.json'), JSON.stringify(assets.map(file => '/' + file)));
      const worker = fs.readFileSync('public/service_worker.js', 'utf8').replaceAll('__BUILD_ID__', buildId);
      fs.writeFileSync(path.join(options.dir, 'service_worker.js'), worker);
    }
  }],
  define: {
    __RUNTIME_PORTS__: JSON.stringify(runtimeConstants.ports),
    __RUNTIME_SERVER_HOST__: JSON.stringify(runtimeConstants.server.host),
    __RUNTIME_COMPRESSION__: JSON.stringify(runtimeConstants.compression)
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