import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import VisitorPage from '@/pages/VisitorPage'
import JoinPage from '@/pages/JoinPage'
import ResidentPage from '@/pages/ResidentPage'
import RespondPage from '@/pages/RespondPage'
import StatusPage from '@/pages/StatusPage'
import AdminPage from '@/pages/AdminPage'

export default function App() {
  useEffect(() => {
    // Sign in anonymously so all Firestore writes pass auth check
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch((err) => {
          console.error('[Auth] Anonymous sign-in failed:', err)
        })
      }
    })
    return unsub
  }, [])

  return (
    <HashRouter>
      <div className="min-h-screen bg-background">
        <Routes>
          {/* Visitor: /visit?b=buildingId */}
          <Route path="/visit" element={<VisitorPage />} />
          {/* Resident registration: /join?b=buildingId&code=ABC123 */}
          <Route path="/join" element={<JoinPage />} />
          {/* Resident dashboard: /resident?b=buildingId&r=roomId */}
          <Route path="/resident" element={<ResidentPage />} />
          {/* Resident responds to arrival: /respond?b=buildingId&r=roomId&a=arrivalId */}
          <Route path="/respond" element={<RespondPage />} />
          {/* Visitor polls status: /status?b=buildingId&r=roomId&a=arrivalId */}
          <Route path="/status" element={<StatusPage />} />
          {/* Admin panel: /admin?key=SECRET */}
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/visit" replace />} />
        </Routes>
      </div>
      <Toaster position="top-center" richColors />
    </HashRouter>
  )
}
