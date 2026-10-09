import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Flex - Сборник приложений',
        short_name: 'Flex',
        description: 'Ваш персональный сборник полезных приложений',
        lang: 'ru',
        dir: 'ltr',
        id: '/',
        categories: ['productivity', 'lifestyle'],
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // No runtime caching of /api. The API is same-origin behind nginx and
        // every response is authorised by a bearer token, while the Cache API
        // keys entries by URL alone. On a shared family device the previous
        // user's /api/chat, /api/notes and /api/family responses would then be
        // replayed to whoever signs in next, or to anyone working offline.
        // Private family data is not worth an offline cache; the shell is still
        // precached, so the app opens and reports that it is offline instead.
        runtimeCaching: [],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
