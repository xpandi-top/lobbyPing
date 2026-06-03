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

normalizeHashRoute()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
