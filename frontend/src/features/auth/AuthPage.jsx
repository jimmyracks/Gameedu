import { useState } from 'react'
import BrandMark from '../../components/BrandMark.jsx'
import EyeIcon from '../../components/EyeIcon.jsx'
import { apiRequest } from '../../lib/api.js'

export default function AuthPage({ onAuthenticated, initialError = '' }) {
  const [role, setRole] = useState('Murid')
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState(initialError)
  const [noticeType, setNoticeType] = useState(initialError ? 'error' : 'success')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isRegister = mode === 'register'

  function changeMode(nextMode) {
    setMode(nextMode)
    setNotice('')
    setShowPassword(false)
  }

  function startRegistration(selectedRole) {
    setRole(selectedRole)
    changeMode('register')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    if (isRegister && formData.get('password') !== formData.get('confirmPassword')) {
      setNoticeType('error')
      setNotice('Konfirmasi kata sandi belum sama. Silakan periksa kembali.')
      return
    }

    setIsSubmitting(true)
    setNotice('')
    const body = {
      email: formData.get('email'),
      password: formData.get('password'),
      role,
    }

    if (isRegister) {
      body.name = formData.get('fullName')
      body.school = role === 'Guru' ? formData.get('schoolOrClass') : ''
      body.classCode = role === 'Murid' ? formData.get('schoolOrClass') : ''
      body.termsAccepted = formData.get('terms') === 'on'
    }

    try {
      const { user } = await apiRequest(`/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (isRegister) {
        setEmail(user.email)
        setRole(user.role)
        setMode('login')
        setShowPassword(false)
        setNoticeType('success')
        setNotice(`Akun ${user.name} berhasil dibuat. Silakan masuk dengan email dan kata sandi yang baru dibuat.`)
        return
      }
      onAuthenticated(user)
    } catch (error) {
      setNoticeType('error')
      setNotice(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleForgotPassword() {
    setNoticeType('info')
    setNotice('Untuk mereset kata sandi, hubungi administrator GameEdu.')
  }

  return (
    <main className="auth-page">
      <section className="welcome-panel" aria-label="Tentang GameEdu">
        <a className="brand" href="#beranda" aria-label="GameEdu, beranda">
          <BrandMark />
          <span>Game<span className="brand-accent">Edu</span></span>
        </a>

        <div className="welcome-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> PLATFORM BELAJAR DIGITAL</span>
          <h1>Belajar lebih terarah, mengajar lebih bermakna.</h1>
          <p>
            Satu ruang untuk guru dan murid tumbuh bersama. Mulai perjalanan
            belajarmu hari ini.
          </p>
        </div>

        <div className="learning-card" aria-hidden="true">
          <div className="card-topline">
            <span className="card-label">KELAS HARI INI</span>
            <span className="live-tag"><span /> BERLANGSUNG</span>
          </div>
          <div className="class-art">
            <span className="art-sun" />
            <span className="art-book art-book-one" />
            <span className="art-book art-book-two" />
            <span className="art-pencil" />
            <span className="art-spark art-spark-one">✦</span>
            <span className="art-spark art-spark-two">✳</span>
          </div>
          <div className="class-info">
            <div>
              <strong>Matematika · Kelas 8A</strong>
              <span>Persamaan &amp; fungsi</span>
            </div>
            <span className="avatar-stack"><i>NA</i><i>RS</i><i>+12</i></span>
          </div>
        </div>

        <div className="welcome-footer">
          <span><span className="footer-check">✓</span> Aman &amp; nyaman untuk belajar</span>
          <span>© 2025 GameEdu</span>
        </div>
        <span className="decor decor-one" />
        <span className="decor decor-two" />
      </section>

      <section className="form-panel" aria-label={isRegister ? 'Buat akun' : 'Masuk ke akun'}>
        <div className="form-topbar">
          <span className="mobile-brand"><BrandMark /> Game<span>Edu</span></span>
          <p>
            {isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button
              className="text-button"
              type="button"
              onClick={() => changeMode(isRegister ? 'login' : 'register')}
            >
              {isRegister ? 'Masuk' : 'Daftar sekarang'}
            </button>
          </p>
        </div>

        <div className="form-content">
          <div className="form-heading">
            <span className="form-kicker">{isRegister ? 'MULAI PERJALANANMU' : 'SELAMAT DATANG KEMBALI'}</span>
            <h2>{isRegister ? 'Buat akun baru' : 'Masuk ke akunmu'}</h2>
            <p>
              {isRegister
                ? 'Lengkapi data berikut untuk bergabung di GameEdu.'
                : 'Masukkan detail akun untuk melanjutkan kegiatan belajar.'}
            </p>
          </div>

          <div className="role-picker" aria-label="Pilih jenis akun">
            <button
              className={`role-option${role === 'Murid' ? ' selected' : ''}`}
              type="button"
              aria-pressed={role === 'Murid'}
              onClick={() => { setRole('Murid'); setNotice('') }}
            >
              <span className="role-icon student-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 11.2v4.3c2.8 2.2 7.2 2.2 10 0v-4.3M21 9v6" /></svg>
              </span>
              <span><strong>Murid</strong><small>Belajar &amp; berkembang</small></span>
              <span className="radio-dot" />
            </button>
            <button
              className={`role-option${role === 'Guru' ? ' selected' : ''}`}
              type="button"
              aria-pressed={role === 'Guru'}
              onClick={() => { setRole('Guru'); setNotice('') }}
            >
              <span className="role-icon teacher-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 6h11M8 9h8M8 12h5M4 20h16" /></svg>
              </span>
              <span><strong>Guru</strong><small>Mengajar &amp; membimbing</small></span>
              <span className="radio-dot" />
            </button>
          </div>

          <form className="auth-form" key={mode} onSubmit={handleSubmit}>
            {isRegister && (
              <label className="field">
                <span>Nama lengkap</span>
                <input
                  type="text"
                  name="fullName"
                  placeholder="Nama lengkap kamu"
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </label>
            )}

            <label className="field">
              <span>{role === 'Guru' ? 'Email sekolah' : 'Email'}</span>
              <input
                type="email"
                name="email"
                placeholder={role === 'Guru' ? 'nama@sekolah.sch.id' : 'nama@email.com'}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            {isRegister && (
              <label className="field">
                <span>{role === 'Guru' ? 'Nama sekolah' : 'Kode kelas (opsional)'}</span>
                <input
                  type="text"
                  name="schoolOrClass"
                  placeholder={role === 'Guru' ? 'Contoh: SMP Negeri 1' : 'Masukkan kode dari guru'}
                  autoComplete="organization"
                  maxLength={role === 'Guru' ? 120 : 32}
                  required={role === 'Guru'}
                />
              </label>
            )}

            <label className="field">
              <span>Kata sandi</span>
              <span className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder={isRegister ? 'Minimal 8 karakter' : 'Masukkan kata sandi'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  <EyeIcon visible={showPassword} />
                </button>
              </span>
              {!isRegister && (
                <span className="field-helper">Gunakan kata sandi yang terdaftar di akunmu.</span>
              )}
            </label>

            {isRegister ? (
              <label className="field">
                <span>Konfirmasi kata sandi</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="Ulangi kata sandi"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            ) : (
              <div className="form-options">
                <label className="checkbox-label">
                  <input type="checkbox" name="remember" />
                  <span className="custom-checkbox" />
                  Ingat saya
                </label>
                <button className="text-button forgot-button" type="button" onClick={handleForgotPassword}>
                  Lupa kata sandi?
                </button>
              </div>
            )}

            {isRegister && (
              <label className="checkbox-label terms-label">
                <input type="checkbox" name="terms" required />
                <span className="custom-checkbox" />
                <span>Saya menyetujui <a href="#ketentuan">Ketentuan Layanan</a> dan <a href="#privasi">Kebijakan Privasi</a>.</span>
              </label>
            )}

            {notice && (
              <p className={`form-notice ${noticeType}`} role="status" aria-live="polite">
                {notice}
              </p>
            )}

            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Memproses...' : isRegister ? 'Buat akun' : 'Masuk sebagai ' + role}
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
            </button>

            {!isRegister && (
              <div className="registration-shortcuts">
                <span>Belum punya akun?</span>
                <div>
                  <button type="button" onClick={() => startRegistration('Murid')}>
                    <span className="shortcut-icon student-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none"><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 11.2v4.3c2.8 2.2 7.2 2.2 10 0v-4.3M21 9v6" /></svg>
                    </span>
                    <span><strong>Buat akun Murid</strong><small>Daftar untuk mulai belajar</small></span>
                    <svg className="shortcut-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
                  </button>
                  <button type="button" onClick={() => startRegistration('Guru')}>
                    <span className="shortcut-icon teacher-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 6h11M8 9h8M8 12h5M4 20h16" /></svg>
                    </span>
                    <span><strong>Buat akun Guru</strong><small>Daftar untuk mengajar</small></span>
                    <svg className="shortcut-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
                  </button>
                </div>
              </div>
            )}
          </form>

          <p className="form-security">
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3.5" y="7.5" width="11" height="8" rx="1.5" /><path d="M6 7.5V5a3 3 0 0 1 6 0v2.5" /></svg>
            Data akunmu terlindungi dan aman
          </p>
        </div>

        <p className="bottom-note">Butuh bantuan? <a href="mailto:bantuan@ruangkelas.id">Hubungi tim kami</a></p>
      </section>
    </main>
  )
}
