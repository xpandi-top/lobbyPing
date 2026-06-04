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

function refreshWhenPwaUpdates() {
  if (!('serviceWorker' in navigator)) return

  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistration(import.meta.env.BASE_URL)
      .then((registration) => registration?.update())
      .catch((err) => console.warn('[PWA] update check failed:', err))
  })
}

normalizeHashRoute()
refreshWhenPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
