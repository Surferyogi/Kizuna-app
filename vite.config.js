import { defineConfig } from 'vite'
import react          from '@vitejs/plugin-react'
import { VitePWA }   from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Kizuna-app/',
  plugins: [
    react(),
    VitePWA({
      strategies:   'generateSW',
      registerType: 'autoUpdate',
      workbox: {
        clientsClaim: true,
        skipWaiting:  true,
        // Import our push handler into the generated service worker
        importScripts: ['/Kizuna-app/push-handler.js'],
        navigateFallback: '/Kizuna-app/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name:             'Kizuna 絆',
        short_name:       'Kizuna',
        description:      'Bonding with trust, loyalty & love.',
        theme_color:      '#B8715C',
        background_color: '#F8F5F1',
        display:          'standalone',
        orientation:      'portrait',
        scope:            '/Kizuna-app/',
        start_url:        '/Kizuna-app/',
        icons: [
          { src:'icon-192.png', sizes:'192x192', type:'image/png' },
          { src:'icon-512.png', sizes:'512x512', type:'image/png', purpose:'any maskable' }
        ]
      }
    })
  ]
})
