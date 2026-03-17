import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  envDir: "../",
  server: {
    host: true,
    port: 5173
  },
  plugins: [svelte()],
})
