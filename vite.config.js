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
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // ── Background Sync لطلبات Supabase ──
        runtimeCaching: [
          // الخطوط
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gf-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 }
            }
          },
          // Supabase POST/PATCH/DELETE — Background Sync
          {
            urlPattern: ({ url, request }) =>
              url.hostname.includes('supabase.co') &&
              ['POST','PATCH','PUT','DELETE'].includes(request.method),
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'supabase-write-queue',
                options: {
                  maxRetentionTime: 24 * 60  // احتفظ بالطلبات 24 ساعة
                }
              }
            }
          },
          // Supabase POST/PATCH/DELETE
          {
            urlPattern: ({ url, request }) =>
              url.hostname.includes('supabase.co') &&
              ['PATCH','PUT','DELETE'].includes(request.method),
            handler: 'NetworkOnly',
            method: 'PATCH',
            options: {
              backgroundSync: {
                name: 'supabase-write-queue',
                options: { maxRetentionTime: 24 * 60 }
              }
            }
          },
          // Supabase GET — NetworkFirst (اقرأ من الشبكة أولاً ثم Cache)
          {
            urlPattern: ({ url, request }) =>
              url.hostname.includes('supabase.co') &&
              request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-get-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60  // ساعة واحدة
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  base: '/camp-registry-react/'
})
