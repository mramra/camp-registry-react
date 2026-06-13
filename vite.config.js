import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      manifest: {
        name: 'نبض المخيم',
        short_name: 'نبض المخيم',
        theme_color: '#f59e0b',
        background_color: '#0d1117',
        display: 'standalone',
        dir: 'rtl', lang: 'ar',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // استثناء workers الخاصة بـ PowerSync
        globIgnores: ['**/worker*.js', '**/open-worker*.js'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      }
    })
  ],
  base: '/camp-registry-react/',
  // إعداد خاص لـ PowerSync workers
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@powersync/web'],
  },
  build: {
    rollupOptions: {
      output: {
        // تجنب تعارض format
      }
    }
  }
})
