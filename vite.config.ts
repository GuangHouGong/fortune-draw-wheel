import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/fortune-draw-wheel/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: null,
      base: '/fortune-draw-wheel/',
      scope: '/fortune-draw-wheel/',
      filename: 'sw.js',
      manifest: {
        id: '/fortune-draw-wheel/',
        name: '土城廣厚宮功德會抽獎',
        short_name: '土城廣厚宮功德會抽獎',
        description: '準備名單、現場開獎與下載中獎紀錄，支援離線使用。',
        lang: 'zh-TW',
        start_url: '/fortune-draw-wheel/',
        scope: '/fortune-draw-wheel/',
        display: 'standalone',
        theme_color: '#8d0a16',
        background_color: '#7a0918',
        icons: [
          { src: 'assets/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'assets/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        cacheId: 'fortune-draw-wheel',
        // Only Vite's fingerprinted bundles are immutable. Public artwork and
        // manifest icons need revisions so new releases replace cached images.
        dontCacheBustURLsMatching: /\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/,
        globPatterns: ['**/*.{js,mjs,css,html,webmanifest,ico,png,jpg,jpeg,svg,webp,avif,woff,woff2,mp3,wav,ogg,json,csv,txt,xlsx}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/fortune-draw-wheel/index.html',
        navigateFallbackAllowlist: [/^\/fortune-draw-wheel(?:\/|$)/],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        inlineWorkboxRuntime: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
