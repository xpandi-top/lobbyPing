import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

function normalizeHashRoute() {
  const hash = window.location.hash
  if (!hash.startsWith('#/')) return
  const base = import.meta.env.BASE_URL
  const route = hash.slice(1)
  const nextUrl = `${base.replace(/\/$/, '')}${route}`
  window.history.replaceState(null, '', nextUrl)
}

function installCurrentPageManifest() {
  const url = new URL(window.location.href)
  const startUrl = `${url.pathname}${url.search}`
  const manifest = {
    name: 'LobbyPing',
    short_name: 'LobbyPing',
    description: 'Privacy-first arrival notification system',
    start_url: startUrl,
    scope: '/lobbyPing/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#f97316',
    icons: [
      { src: '/lobbyPing/icon-light.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/lobbyPing/icon-light.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
  const href = URL.createObjectURL(blob)
  const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  const link = existing ?? document.createElement('link')
  link.rel = 'manifest'
  link.href = href
  if (!existing) document.head.appendChild(link)
}

normalizeHashRoute()
installCurrentPageManifest()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
