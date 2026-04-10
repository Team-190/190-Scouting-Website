import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'fs'

export default defineConfig({
  plugins: [svelte()],
  server: {
    https: {
      key: fs.readFileSync('../certificate.key'),
      cert: fs.readFileSync('../certificate.crt'),
    },
    port: 443,
    host: '0.0.0.0',
    hmr: {
      protocol: 'wss',
      host: '190scouting.com',
      port: 443
    }
  }
})