import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'نبض المخيم',
        short_name: 'نبض المخيم',
        theme_color: '#f59e0b',
        background_color: '#0d1117',
        display: 'standalone',
        dir: 'rtl',
        lang: 'ar',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  base: '/camp-registry-react/'
})
