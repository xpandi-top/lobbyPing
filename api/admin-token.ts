import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'

function getApp(): admin.app.App {
  if (admin.apps.length) return admin.apps[0]!
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set')
  const credentials = JSON.parse(raw)
  if (typeof credentials.private_key === 'string') {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
  }
  return admin.initializeApp({ credential: admin.credential.cert(credentials) })
}

const ALLOWED_ORIGINS = new Set([
  'https://apps.xpandi.top',
  'http://localhost:5173',
  'http://localhost:5174',
])

const ADMIN_KEY = process.env.VITE_ADMIN_KEY ?? process.env.ADMIN_KEY ?? ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (origin && !ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: 'origin not allowed' })

  const { adminKey, uid } = (req.body ?? {}) as { adminKey?: string; uid?: string }

  if (!ADMIN_KEY) return res.status(500).json({ error: 'admin key not configured' })
  if (!adminKey || adminKey !== ADMIN_KEY) return res.status(401).json({ error: 'invalid admin key' })
  if (!uid) return res.status(400).json({ error: 'uid required' })

  try {
    const token = await getApp().auth().createCustomToken(uid, { admin: true })
    return res.status(200).json({ token })
  } catch (err) {
    console.error('[admin-token] error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}
