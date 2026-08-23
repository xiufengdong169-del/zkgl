import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const fileDemoMode = String(process.env.VITE_FILE_DEMO_MODE || '').toLowerCase() === 'true'

export default defineConfig({
  base: fileDemoMode ? './' : '/',
  plugins: [vue()],
  server: { port: 5173 },
  build: {
    sourcemap: false,
    // CloudBase authentication is isolated in the lazy-loaded login route.
    chunkSizeWarningLimit: 800
  }
})
