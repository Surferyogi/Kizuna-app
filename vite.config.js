import { defineConfig } from 'vite'
import react          from '@vitejs/plugin-react'
import { VitePWA }   from 'vite-plugin-pwa'

export default defineConfig({
  // ← Change 'kizuna-app' to your actual GitHub repo name if different
  base: '/kizuna-app/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name:             'Kizuna 絆',
        short_name:       'Kizuna',
        description:      'Warmth, loyalty & invisible strength — the thread that connects hearts across time and distance.',
        theme_color:      '#B8715C',
        background_color: '#F8F5F1',
        display:          'standalone',
        orientation:      'portrait',
        scope:            '/kizuna-app/',
        start_url:        '/kizuna-app/',
        icons: [
          {
            src:   'icon-192.png',
            sizes: '192x192',
            type:  'image/png'
          },
          {
            src:     'icon-512.png',
            sizes:   '512x512',
            type:    'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
