import { useEffect, useState } from 'react'
import ArenaDashboard from './features/arena/ArenaDashboard.jsx'
import AuthPage from './features/auth/AuthPage.jsx'
import TeacherDashboard from './features/teacher/TeacherDashboard.jsx'
import { apiRequest } from './lib/api.js'
import './styles/App.css'

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me')
      .then(({ user }) => {
        if (active) setCurrentUser(user)
      })
      .catch((error) => {
        if (active && error.message !== 'Silakan masuk terlebih dahulu.') {
          setAuthError('Backend belum tersambung. Pastikan server dijalankan dengan npm run dev.')
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false)
      })

    return () => { active = false }
  }, [])

  async function logout() {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    setCurrentUser(null)
  }

  if (checkingSession) {
    return <main className="auth-loading" aria-label="Memuat akun">Memuat GameEdu...</main>
  }

  if (currentUser) {
    if (currentUser.role === 'Guru') {
      return <TeacherDashboard user={currentUser} onLogout={logout} />
    }
    return <ArenaDashboard user={currentUser} onLogout={logout} />
  }

  return <AuthPage onAuthenticated={setCurrentUser} initialError={authError} />
}
