import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs/promises'

function firebaseSwPlugin(): Plugin {
  const KEYS = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ] as const

  function transform(src: string, env: Record<string, string>): string {
    return KEYS.reduce(
      (s, k) => s.replaceAll(`__${k}__`, env[k] ?? ''),
      src,
    )
  }

  return {
    name: 'firebase-sw-env',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      server.middlewares.use('/lobbyPing/firebase-messaging-sw.js', async (_req, res) => {
        const src = await fs.readFile('./public/firebase-messaging-sw.js', 'utf-8')
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(transform(src, env))
      })
    },
    async closeBundle() {
      const env = loadEnv('production', process.cwd(), '')
      const src = await fs.readFile('./public/firebase-messaging-sw.js', 'utf-8')
      await fs.writeFile('./dist/firebase-messaging-sw.js', transform(src, env))
    },
  }
}

export default defineConfig({
  base: '/lobbyPing/',
  plugins: [
    react(),
    tailwindcss(),
    firebaseSwPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-light.png', 'icon-dark.png'],
      manifest: {
        name: 'LobbyPing',
        short_name: 'LobbyPing',
        description: 'Privacy-first arrival notification system',
        start_url: '/lobbyPing/',
        theme_color: '#f97316',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/lobbyPing/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/lobbyPing/index.html',
        navigateFallbackAllowlist: [/^\/lobbyPing\/(?!.*\.[^/]+$).*/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firestore-cache' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
