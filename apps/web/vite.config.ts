import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173 },
  build: {
    sourcemap: false,
    // CloudBase authentication is isolated in the lazy-loaded login route.
    chunkSizeWarningLimit: 800
  }
})
