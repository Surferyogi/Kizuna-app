import { defineConfig } from 'vite'
import react          from '@vitejs/plugin-react'
import { VitePWA }   from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Kizuna-app/',
  plugins: [
    react(),
    VitePWA({
      strategies:   'injectManifest',
      srcDir:       'src',
      filename:     'sw.js',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: [],           // let vite-plugin-pwa handle caching
        injectionPoint: undefined,  // no __WB_MANIFEST injection needed
      },
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
