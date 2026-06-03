import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import VisitorPage from '@/pages/VisitorPage'
import JoinPage from '@/pages/JoinPage'
import ResidentPage from '@/pages/ResidentPage'
import RespondPage from '@/pages/RespondPage'
import StatusPage from '@/pages/StatusPage'
import AdminPage from '@/pages/AdminPage'

function LaunchPage() {
  return <JoinPage />
}

export default function App() {
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch((err) => {
          console.error('[Auth] Anonymous sign-in failed:', err)
          setAuthReady(true) // still render even if auth fails
        })
      } else {
        setAuthReady(true)
      }
    })
    return unsub
  }, [])

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<JoinPage />} />
          <Route path="/visit" element={<VisitorPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/home" element={<ResidentPage />} />
          <Route path="/resident" element={<ResidentPage />} />
          <Route path="/respond" element={<RespondPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<LaunchPage />} />
        </Routes>
      </div>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  )
}
