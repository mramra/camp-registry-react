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
        runtimeCaching: [
          // الخطوط — CacheFirst (لا تتغير)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gf-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 }
            }
          },
          // Supabase POST — Background Sync (يُعاد تلقائياً عند الاتصال)
          {
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'supabase-write-queue',
                options: { maxRetentionTime: 24 * 60 }
              }
            }
          },
          // Supabase PATCH
          {
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly',
            method: 'PATCH',
            options: {
              backgroundSync: {
                name: 'supabase-write-queue',
                options: { maxRetentionTime: 24 * 60 }
              }
            }
          },
          // Supabase DELETE
          {
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly',
            method: 'DELETE',
            options: {
              backgroundSync: {
                name: 'supabase-write-queue',
                options: { maxRetentionTime: 24 * 60 }
              }
            }
          }
          // ملاحظة: GET لا يُخزَّن هنا — التطبيق يقرأ من Dexie مباشرة (تخزين دائم)
        ]
      }
    })
  ],
  base: '/camp-registry-react/'
})
