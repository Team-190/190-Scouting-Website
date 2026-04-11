import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ['190scouting.com', 'localhost', '127.0.0.1', '0.0.0.0'],
    hmr: {
      host: 'localhost',
      port: 5173,
      protocol: 'ws'
    }
  }
})