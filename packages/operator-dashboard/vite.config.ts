import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { BRAND_NAME } from '../shared/src/constants/brand';

const APP_NAME = `${BRAND_NAME} – עמדת הקלדה`;

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    // index.html's <title> takes the shared brand name (%BRAND_NAME%).
    { name: 'brand-name', transformIndexHtml: (html) => html.replaceAll('%BRAND_NAME%', BRAND_NAME) },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: APP_NAME,
        short_name: 'עמדת הקלדה',
        display: 'standalone',
        orientation: 'portrait',
        // Design tokens (packages/shared/src/design): paper and pine.
        background_color: '#eef3f5',
        theme_color: '#395c6b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Precache the self-hosted fonts too, so the queue keeps its type offline.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@lotto-maker/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
});
