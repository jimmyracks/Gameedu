import { useEffect, useState } from 'react'
import ArenaDashboard from '../arena/ArenaDashboard.jsx'
import BrandMark from '../../components/BrandMark.jsx'
import { apiRequest } from '../../lib/api.js'
import './TeacherDashboard.css'

const navigation = [
  { id: 'overview', label: 'Dashboard', icon: '⌂' },
  { id: 'questions', label: 'Bank soal', icon: '▦' },
  { id: 'sessions', label: 'Sesi game', icon: '◉' },
  { id: 'classes', label: 'Kelas & siswa', icon: '♙' },
  { id: 'reports', label: 'Laporan', icon: '▤' },
  { id: 'settings', label: 'Pengaturan', icon: '⚙' },
]

const pageTitles = {
  overview: 'Dashboard Guru',
  questions: 'Bank Soal',
  sessions: 'Sesi Game',
  createSession: 'Buat Sesi Game',
  questionForm: 'Tambah Soal',
  classes: 'Kelas & Siswa',
  reports: 'Laporan',
  settings: 'Pengaturan',
}

const emptyQuestion = {
  subject: 'Matematika',
  chapter: '',
  questionType: 'Pilihan ganda',
  bloomLevel: 'C2',
  difficulty: 'Sedang',
  durationSeconds: 30,
  prompt: '',
  options: ['', '', '', ''],
  correctOption: 'A',
  explanation: '',
}

function writeTeacherHistory(route, replace = false) {
  const currentState = window.history.state
  const baseState = currentState && typeof currentState === 'object' ? currentState : {}
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method](
    { ...baseState, asalinkTeacher: route },
    '',
    window.location.href,
  )
}

async function loadPageData(view) {
  if (view === 'overview') {
    const [questionData, roomData, classData, reportData] = await Promise.all([
      apiRequest('/api/teacher/questions'),
      apiRequest('/api/rooms'),
      apiRequest('/api/teacher/classes'),
      apiRequest('/api/teacher/reports'),
    ])
    return {
      questions: questionData,
      rooms: roomData.rooms,
      classes: classData.classes,
      reports: reportData,
    }
  }
  if (view === 'questions') {
    return { questions: await apiRequest('/api/teacher/questions') }
  }
  if (view === 'createSession') {
    return { questions: await apiRequest('/api/teacher/questions') }
  }
  if (view === 'sessions') {
    return { rooms: (await apiRequest('/api/rooms')).rooms }
  }
  if (view === 'classes') {
    return { classes: (await apiRequest('/api/teacher/classes')).classes }
  }
  if (view === 'reports') {
    return { reports: await apiRequest('/api/teacher/reports') }
  }
  return {}
}

export default function TeacherDashboard({ user, onLogout }) {
  const initialTeacherRoute = window.history.state?.asalinkTeacher
  const initialTeacherRouteIsCurrent = initialTeacherRoute?.userId === user.id
  const [activeView, setActiveView] = useState(
    initialTeacherRouteIsCurrent ? initialTeacherRoute.view || 'overview' : 'overview',
  )
  const [questions, setQuestions] = useState([])
  const [questionSummary, setQuestionSummary] = useState({ total: 0, reviewed: 0, hots: 0 })
  const [rooms, setRooms] = useState([])
  const [classes, setClasses] = useState([])
  const [reports, setReports] = useState(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [questionFormOpen, setQuestionFormOpen] = useState(
    Boolean(initialTeacherRouteIsCurrent && initialTeacherRoute.questionFormOpen),
  )
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [questionForm, setQuestionForm] = useState(emptyQuestion)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [className, setClassName] = useState('')
  const [savingClass, setSavingClass] = useState(false)
  const [activeRoom, setActiveRoom] = useState(null)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [selectedGame, setSelectedGame] = useState('speed_clash')

  useEffect(() => {
    const savedRoute = window.history.state?.asalinkTeacher
    if (savedRoute?.userId !== user.id) {
      writeTeacherHistory({ view: 'overview', userId: user.id }, true)
    } else if (savedRoute.roomCode) {
      apiRequest(`/api/rooms/${savedRoute.roomCode}`)
        .then(({ room }) => setActiveRoom(room))
        .catch((requestError) => setError(requestError.message))
    }

    function restoreTeacherRoute(event) {
      const route = event.state?.asalinkTeacher
      const view = route?.userId === user.id ? route.view || 'overview' : 'overview'
      setPageLoading(true)
      setError('')
      setActiveView(view)
      setQuestionFormOpen(Boolean(route?.userId === user.id && route.questionFormOpen))
      setRefreshKey((key) => key + 1)
      if (route?.userId === user.id && route.roomCode) {
        apiRequest(`/api/rooms/${route.roomCode}`)
          .then(({ room }) => setActiveRoom(room))
          .catch((requestError) => setError(requestError.message))
      } else {
        setActiveRoom(null)
      }
    }

    window.addEventListener('popstate', restoreTeacherRoute)
    return () => window.removeEventListener('popstate', restoreTeacherRoute)
  }, [user.id])

  useEffect(() => {
    let active = true
    loadPageData(activeView)
      .then((data) => {
        if (!active) return
        if (data.questions) {
          setQuestions(data.questions.questions)
          setQuestionSummary(data.questions.summary)
        }
        if (data.rooms) setRooms(data.rooms)
        if (data.classes) setClasses(data.classes)
        if (data.reports) setReports(data.reports)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setPageLoading(false)
      })

    return () => { active = false }
  }, [activeView, refreshKey, user.id])

  function navigateToView(view) {
    writeTeacherHistory({ view, userId: user.id })
    setPageLoading(true)
    setNotice('')
    setError('')
    setQuestionFormOpen(false)
    setEditingQuestion(null)
    setActiveView(view)
  }

  function refreshCurrentPage() {
    setPageLoading(true)
    setRefreshKey((key) => key + 1)
  }

  function showQuestionForm(question = null) {
    writeTeacherHistory({
      view: activeView,
      questionFormOpen: true,
      userId: user.id,
    })
    setError('')
    setNotice('')
    setEditingQuestion(question)
    setQuestionForm(question ? {
      subject: question.subject,
      chapter: question.chapter,
      questionType: question.questionType,
      bloomLevel: question.bloomLevel,
      difficulty: question.difficulty,
      durationSeconds: question.durationSeconds,
      prompt: question.prompt,
      options: question.options.map((option) => option.text),
      correctOption: question.correctOption,
      explanation: question.explanation,
    } : { ...emptyQuestion, options: [...emptyQuestion.options] })
    setQuestionFormOpen(true)
  }

  function closeQuestionForm() {
    if (window.history.state?.asalinkTeacher?.questionFormOpen) {
      window.history.back()
      return
    }
    setQuestionFormOpen(false)
    setEditingQuestion(null)
  }

  function updateOption(index, value) {
    setQuestionForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? value : option),
    }))
  }

  async function saveQuestion(event) {
    event.preventDefault()
    setSavingQuestion(true)
    setError('')
    setNotice('')
    try {
      const method = editingQuestion ? 'PUT' : 'POST'
      const endpoint = editingQuestion
        ? `/api/teacher/questions/${editingQuestion.id}`
        : '/api/teacher/questions'
      await apiRequest(endpoint, {
        method,
        body: JSON.stringify({
          ...questionForm,
          durationSeconds: Number(questionForm.durationSeconds),
          options: questionForm.options.map((text) => ({ text })),
        }),
      })
      closeQuestionForm()
      setNotice(editingQuestion ? 'Soal berhasil diperbarui.' : 'Soal berhasil ditambahkan ke bank soal.')
      refreshCurrentPage()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingQuestion(false)
    }
  }

  async function deleteQuestion(question) {
    if (!window.confirm(`Hapus soal "${question.prompt}"?`)) return
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/teacher/questions/${question.id}`, { method: 'DELETE' })
      setNotice('Soal berhasil dihapus.')
      refreshCurrentPage()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createClass(event) {
    event.preventDefault()
    setSavingClass(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest('/api/teacher/classes', {
        method: 'POST',
        body: JSON.stringify({ name: className }),
      })
      setClassName('')
      setNotice(`Kelas ${result.class.name} berhasil dibuat. Bagikan kode ${result.class.classCode} kepada murid.`)
      refreshCurrentPage()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingClass(false)
    }
  }

  async function startSession(configuration) {
    setError('')
    setNotice('')
    try {
      const result = await apiRequest('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ gameType: selectedGame, ...configuration }),
      })
      writeTeacherHistory({ view: activeView, roomCode: result.room.code, userId: user.id })
      setActiveRoom(result.room)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function openSessionSetup(gameType) {
    setSelectedGame(gameType === 'territory_grid' ? 'territory_grid' : 'speed_clash')
    navigateToView('createSession')
  }

  async function openSession(code) {
    setError('')
    try {
      const result = await apiRequest(`/api/rooms/${code}`)
      writeTeacherHistory({ view: activeView, roomCode: result.room.code, userId: user.id })
      setActiveRoom(result.room)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function copyRoomCode(code) {
    setError('')
    setNotice('')
    try {
      await navigator.clipboard.writeText(code)
      setNotice(`Kode arena ${code} berhasil disalin.`)
    } catch {
      setError('Kode arena tidak dapat disalin. Silakan salin kodenya secara manual.')
    }
  }

  async function logout() {
    setLogoutBusy(true)
    setError('')
    try {
      await onLogout()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLogoutBusy(false)
    }
  }

  function exportReports() {
    if (!reports) {
      setError('Data laporan belum siap diekspor.')
      return
    }

    const records = [
      ['Jenis', 'Nama atau kode', 'Detail', 'Jumlah', 'Nilai'],
      ...(reports.completedRooms || []).map((room) => [
        'Sesi selesai',
        room.code,
        new Date(`${room.createdAt}Z`).toLocaleDateString('id-ID'),
        `${room.studentCount} murid`,
        `${room.highestScore} poin`,
      ]),
      ...(reports.classPerformance || []).map((classItem) => [
        'Kelas',
        classItem.name,
        `Kode ${classItem.classCode}`,
        `${classItem.studentsPlayed}/${classItem.studentCount} murid bermain`,
        `${classItem.averageScore} rata-rata poin`,
      ]),
      ...(reports.studentPerformance || []).map((student) => [
        'Murid',
        student.studentName,
        student.className,
        `${student.completedSessions} sesi`,
        `${student.totalPoints} total poin`,
      ]),
      ...(reports.questionAnalytics || []).map((question) => [
        'Analisis soal',
        question.question,
        `${question.subject} · ${question.chapter}`,
        `${question.attempts} giliran`,
        `${question.accuracyPercent}% benar`,
      ]),
    ]
    const csvCell = (value) => {
      const text = String(value ?? '')
      const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
      return `"${safeText.replace(/"/g, '""')}"`
    }
    const csv = `\uFEFF${records.map((record) => record.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `laporan-asalink-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Laporan berhasil diekspor ke CSV.')
    setError('')
  }

  function closeActiveRoom() {
    if (window.history.state?.asalinkTeacher?.roomCode) {
      window.history.back()
      return
    }
    setActiveRoom(null)
  }

  if (activeRoom) {
    return (
      <ArenaDashboard
        user={user}
        onLogout={onLogout}
        initialRoom={activeRoom}
        onExit={closeActiveRoom}
      />
    )
  }

  const myRooms = rooms.filter((room) => room.ownedByMe && !room.finished)
  const recentQuestions = questions.slice(0, 4)
  const selectedNavigation = activeView === 'createSession' ? 'sessions' : activeView

  return (
    <div className="teacher-dashboard">
      <aside className="teacher-sidebar">
        <a className="teacher-brand" href="#dashboard" onClick={(event) => {
          event.preventDefault()
          navigateToView('overview')
        }}>
          <BrandMark />
          <span>GameEdu</span>
        </a>
        <div className="teacher-side-label">MENU UTAMA</div>
        <nav className="teacher-nav" aria-label="Navigasi guru">
          {navigation.map((item) => (
            <button
              className={`teacher-nav-item${selectedNavigation === item.id ? ' is-active' : ''}`}
              key={item.id}
              type="button"
              onClick={() => {
                navigateToView(item.id)
              }}
            >
              <span className="teacher-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'questions' && questionSummary.total > 0 && (
                <span className="teacher-nav-count">{questionSummary.total}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="teacher-sidebar-bottom">
          <div className="teacher-school-card">
            <span className="teacher-school-icon" aria-hidden="true">⌂</span>
            <div><small>Sekolah</small><strong>{user.school || 'Sekolah saya'}</strong></div>
          </div>
          <div className="teacher-profile">
            <span className="teacher-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="teacher-profile-name"><strong>{user.name}</strong><small>Guru</small></span>
            <button className="teacher-profile-menu" type="button" aria-label="Buka pengaturan akun" onClick={() => navigateToView('settings')}>···</button>
          </div>
        </div>
      </aside>

      <div className="teacher-content">
        <header className="teacher-topbar">
          <div className="teacher-breadcrumb"><span>GameEdu</span><b>/</b><strong>{questionFormOpen ? pageTitles.questionForm : pageTitles[activeView]}</strong></div>
          <div className="teacher-topbar-actions">
            <span className="teacher-role-pill"><span /> Mode Guru</span>
            <button type="button" className="teacher-logout" onClick={logout} disabled={logoutBusy}>
              {logoutBusy ? 'Keluar...' : 'Keluar'}
            </button>
          </div>
        </header>

        <main className="teacher-main">
          {(error || notice) && (
            <div className={`teacher-alert${error ? ' is-error' : ' is-success'}`} role={error ? 'alert' : 'status'}>
              <span>{error || notice}</span>
              <button type="button" aria-label="Tutup notifikasi" onClick={() => { setError(''); setNotice('') }}>×</button>
            </div>
          )}
          {pageLoading && <div className="teacher-loading">Memuat data dashboard...</div>}
          {questionFormOpen && (
            <QuestionForm
              inline
              form={questionForm}
              isEditing={Boolean(editingQuestion)}
              isSaving={savingQuestion}
              onChange={setQuestionForm}
              onOptionChange={updateOption}
              onClose={closeQuestionForm}
              onSubmit={saveQuestion}
            />
          )}
          {!questionFormOpen && !pageLoading && activeView === 'overview' && (
            <OverviewPage
              user={user}
              questionSummary={questionSummary}
              recentQuestions={recentQuestions}
              activeRooms={myRooms}
              classes={classes}
              reports={reports}
              onNavigate={navigateToView}
              onAddQuestion={() => showQuestionForm()}
              onStartSession={openSessionSetup}
              onOpenSession={openSession}
              onCopyRoomCode={copyRoomCode}
            />
          )}
          {!questionFormOpen && !pageLoading && activeView === 'questions' && (
            <QuestionsPage
              questions={questions}
              onAdd={() => showQuestionForm()}
              onEdit={showQuestionForm}
              onDelete={deleteQuestion}
            />
          )}
          {!questionFormOpen && !pageLoading && activeView === 'sessions' && (
            <SessionsPage rooms={myRooms} onCreate={openSessionSetup} onOpen={openSession} />
          )}
          {!questionFormOpen && !pageLoading && activeView === 'createSession' && (
            <SessionSetupPage
              questions={questions}
              selectedGame={selectedGame}
              onSelectGame={setSelectedGame}
              onCreate={startSession}
              onAddQuestion={() => showQuestionForm()}
              onCancel={() => navigateToView('sessions')}
            />
          )}
          {!questionFormOpen && !pageLoading && activeView === 'classes' && (
            <ClassesPage
              classes={classes}
              className={className}
              setClassName={setClassName}
              saving={savingClass}
              onCreate={createClass}
            />
          )}
          {!questionFormOpen && !pageLoading && activeView === 'reports' && (
            <ReportsPage reports={reports} onExport={exportReports} />
          )}
          {!questionFormOpen && !pageLoading && activeView === 'settings' && <SettingsPage user={user} />}
        </main>
      </div>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="teacher-page-heading">
      <div>
        <span className="teacher-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="teacher-heading-action">{children}</div>}
    </div>
  )
}

function OverviewPage({
  user,
  questionSummary,
  recentQuestions,
  activeRooms,
  classes,
  reports,
  onNavigate,
  onAddQuestion,
  onStartSession,
  onOpenSession,
  onCopyRoomCode,
}) {
  const studentCount = classes.reduce((total, classItem) => total + classItem.studentCount, 0)
  const recentResults = reports?.completedRooms?.slice(0, 3) || []
  const largestClasses = [...classes]
    .sort((first, second) => second.studentCount - first.studentCount)
    .slice(0, 3)

  return (
    <>
      <div className="teacher-home-grid">
        <div className="teacher-home-main">
          <div className="teacher-home-hero">
            <div className="teacher-home-hero-copy">
              <span className="teacher-card-kicker">HALO, {user.name.split(' ')[0].toUpperCase()}!</span>
              <h1>Ubah bab jadi<br />arena kelas</h1>
              <button type="button" className="teacher-home-cta" onClick={onStartSession}>
                Buat sesi game <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="teacher-quiz-art" aria-hidden="true">
              <span className="quiz-tile tile-a">A</span><span className="quiz-tile tile-star">★</span>
              <span className="quiz-tile tile-b">B</span><span className="quiz-tile tile-c">C</span>
              <span className="quiz-tile tile-d">D</span><span className="quiz-tile tile-empty" />
              <span className="quiz-tile tile-pink" /><span className="quiz-tile tile-empty second" />
            </div>
          </div>

          <section className="teacher-stat-grid" aria-label="Ringkasan aktivitas mengajar">
            <StatCard label="Kelas" value={classes.length} detail="Kelas yang kamu kelola" icon="▦" tone="blue" />
            <StatCard label="Murid" value={studentCount} detail={`Terdaftar di ${classes.length} kelas`} icon="♙" tone="green" />
            <StatCard label="Sesi aktif" value={activeRooms.length} detail="Sedang berlangsung" icon="◉" tone="orange" />
            <StatCard label="Soal siap" value={questionSummary.reviewed} detail={`Dari ${questionSummary.total} soal tersimpan`} icon="✓" tone="blue" />
          </section>

          <section className="teacher-game-library">
            <GameCard
              initials="SC"
              name="Speed Clash"
              description="Adu cepat menjawab benar. Cocok untuk pemanasan dan review!"
              tone="orange"
              action="Pakai"
              onClick={() => onStartSession('speed_clash')}
            />
            <GameCard
              initials="TG"
              name="Territory Grid"
              description="Rebut petak pada papan 5×5 dengan menjawab soal secara bergiliran."
              tone="blue"
              action="Pakai"
              onClick={() => onStartSession('territory_grid')}
            />
          </section>

          <section className="teacher-recent-panel">
            <div className="teacher-section-title">
              <div><span className="teacher-eyebrow">BANK SOAL</span><h2>Soal terbaru</h2></div>
              <button type="button" className="teacher-text-button" onClick={() => onNavigate('questions')}>Lihat semua <span>→</span></button>
            </div>
            {recentQuestions.length === 0 ? (
              <div className="teacher-empty-inline">
                <span className="teacher-empty-icon">▦</span>
                <div><strong>Bank soalmu masih kosong</strong><p>Tambahkan soal pertama untuk digunakan di game.</p></div>
                <button className="teacher-outline-button" type="button" onClick={onAddQuestion}>Tambah soal</button>
              </div>
            ) : (
              <div className="teacher-recent-list">
                {recentQuestions.map((question) => (
                  <article className="teacher-recent-question" key={question.id}>
                    <span className="question-letter">{question.correctOption}</span>
                    <div><strong>{question.prompt}</strong><small>{question.subject} <span>·</span> {question.chapter} <span>·</span> {question.bloomLevel}</small></div>
                    <span className="question-status">{question.reviewStatus}</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="teacher-recent-panel">
            <div className="teacher-section-title">
              <div><span className="teacher-eyebrow">HASIL BELAJAR</span><h2>Hasil sesi terbaru</h2></div>
              <button type="button" className="teacher-text-button" onClick={() => onNavigate('reports')}>Buka laporan <span>→</span></button>
            </div>
            {recentResults.length === 0 ? (
              <div className="teacher-empty-inline">
                <span className="teacher-empty-icon">▤</span>
                <div><strong>Belum ada hasil sesi</strong><p>Ringkasan skor dan partisipasi muncul setelah permainan selesai.</p></div>
              </div>
            ) : (
              <div className="teacher-result-list">
                {recentResults.map((room) => (
                  <article className="teacher-result-row" key={room.code}>
                    <span className="teacher-result-icon">SC</span>
                    <div><strong>Speed Clash · Kode {room.code}</strong><small>{new Date(`${room.createdAt}Z`).toLocaleDateString('id-ID')}</small></div>
                    <span>{room.studentCount} murid</span>
                    <strong>{room.highestScore} poin</strong>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="teacher-home-rail">
          <section className="teacher-notification-card">
            <div className="teacher-rail-heading"><h2>Sesi aktif</h2><button type="button" onClick={() => onNavigate('sessions')}>Semua sesi</button></div>
            {activeRooms.length > 0 ? (
              activeRooms.slice(0, 3).map((room) => (
                <article className="teacher-active-session-card" key={room.code}>
                  <div className="teacher-active-session-heading">
                    <span className="teacher-active-session-icon">SC</span>
                    <span><strong>{room.title}</strong><small>{room.subject} · {room.chapter}</small></span>
                  </div>
                  <div className="teacher-active-session-meta">
                    <span>{room.playerCount} murid</span>
                    <span>{room.gameType === 'territory_grid'
                      ? `Petak ${room.boardProgress}/25`
                      : `Soal ${Math.min(room.currentQuestion + 1, room.questionCount)}/${room.questionCount}`}</span>
                  </div>
                  <div className="teacher-active-session-actions">
                    <button type="button" className="teacher-copy-code" onClick={() => onCopyRoomCode(room.code)}>
                      Kode <strong>{room.code}</strong><span aria-hidden="true">▢</span>
                    </button>
                    <button type="button" className="teacher-open-session" onClick={() => onOpenSession(room.code)}>Buka sesi</button>
                  </div>
                </article>
              ))
            ) : (
              <div className="teacher-side-empty">
                <span>◉</span><p>Belum ada sesi yang berjalan. Buat sesi lalu bagikan kodenya ke murid.</p>
                <button type="button" onClick={onStartSession}>Buat sesi pertama →</button>
              </div>
            )}
          </section>

          <section className="teacher-notification-card">
            <div className="teacher-rail-heading"><h2>Kelas & murid</h2><button type="button" onClick={() => onNavigate('classes')}>Kelola</button></div>
            {largestClasses.length > 0 ? (
              <div className="teacher-overview-class-list">
                {largestClasses.map((classItem) => (
                  <div className="teacher-overview-class" key={classItem.id}>
                    <span className="teacher-overview-class-icon">♙</span>
                    <span><strong>{classItem.name}</strong><small>{classItem.studentCount} murid · Kode {classItem.classCode}</small></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="teacher-side-empty">
                <span>♙</span><p>Buat kelas untuk membagikan kode undangan kepada murid.</p>
                <button type="button" onClick={() => onNavigate('classes')}>Buat kelas →</button>
              </div>
            )}
          </section>

          <section className="teacher-tip-card">
            <div className="teacher-rail-heading"><h2>Tips hari ini</h2><span>✦</span></div>
            <div className="teacher-tip-feature">
              <span className="teacher-tip-play" aria-hidden="true">▶</span>
              <div><strong>Campur level Bloom</strong><p>Soal HOTS bikin belajar jadi lebih menantang. Coba selipkan soal C4–C6 supaya siswa tetap aktif!</p></div>
            </div>
          </section>

          <section className="teacher-share-card">
            <div className="teacher-rail-heading"><h2>Akses cepat</h2><span>✦</span></div>
            <ShareInvite initials="KL" name="Kelola kelas" message="Buat kelas dan bagikan kode undangan." tone="pink" action="Buka kelas" onClick={() => onNavigate('classes')} />
            <ShareInvite initials="BS" name="Bank soal" message="Tambah, edit, dan susun soal game." tone="mint" action="Buka bank soal" onClick={() => onNavigate('questions')} />
          </section>
        </aside>
      </div>
    </>
  )
}

function GameCard({ initials, name, description, tone, action, disabled = false, onClick }) {
  return (
    <article className="teacher-game-card">
      <span className={`teacher-game-icon ${tone}`}>{initials}</span>
      <div><strong>{name}</strong><small>{description}</small></div>
      <button type="button" onClick={onClick} disabled={disabled}>{action}</button>
    </article>
  )
}

function ShareInvite({ initials, name, message, tone, action, onClick }) {
  return (
    <article className="teacher-share-invite">
      <span className={`teacher-share-avatar ${tone}`}>{initials}</span>
      <div><strong>{name}</strong><small>{message}</small><button type="button" onClick={onClick}>{action}</button></div>
    </article>
  )
}

function StatCard({ label, value, detail, icon, tone }) {
  return (
    <article className="teacher-stat-card">
      <span className={`teacher-stat-icon ${tone}`}>{icon}</span>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  )
}

function QuestionsPage({ questions, onAdd, onEdit, onDelete }) {
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [chapterFilter, setChapterFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const [bloomFilter, setBloomFilter] = useState('')
  const subjects = [...new Set(questions.map((question) => question.subject))].sort()
  const chapters = [...new Set(questions.map((question) => question.chapter))].sort()
  const filteredQuestions = questions.filter((question) => {
    const searchValue = search.trim().toLocaleLowerCase()
    return (!searchValue || question.prompt.toLocaleLowerCase().includes(searchValue))
      && (!subjectFilter || question.subject === subjectFilter)
      && (!chapterFilter || question.chapter === chapterFilter)
      && (!difficultyFilter || question.difficulty === difficultyFilter)
      && (!bloomFilter || question.bloomLevel === bloomFilter)
  })

  return (
    <>
      <PageHeading
        eyebrow="MATERI PEMBELAJARAN"
        title="Bank Soal"
        description="Susun dan kelola soal yang akan digunakan untuk aktivitas belajar."
      >
        <button className="teacher-primary-button" type="button" onClick={onAdd}><span>＋</span> Tambah soal</button>
      </PageHeading>
      <section className="teacher-panel">
        <div className="teacher-panel-heading">
          <div><h2>Semua soal</h2><p>{filteredQuestions.length} dari {questions.length} soal</p></div>
          <span className="teacher-filter-label">Filter bank soal</span>
        </div>
        <div className="teacher-question-filters">
          <label className="teacher-question-search" htmlFor="teacher-question-search">
            <span aria-hidden="true">⌕</span>
            <input id="teacher-question-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari isi pertanyaan..." />
          </label>
          <label><span className="sr-only">Mata pelajaran</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">Semua mapel</option>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
          <label><span className="sr-only">Bab</span><select value={chapterFilter} onChange={(event) => setChapterFilter(event.target.value)}><option value="">Semua bab</option>{chapters.map((chapter) => <option key={chapter}>{chapter}</option>)}</select></label>
          <label><span className="sr-only">Kesulitan</span><select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}><option value="">Semua tingkat</option><option>Mudah</option><option>Sedang</option><option>Sulit</option></select></label>
          <label><span className="sr-only">Level kognitif</span><select value={bloomFilter} onChange={(event) => setBloomFilter(event.target.value)}><option value="">Semua level</option>{['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map((level) => <option key={level}>{level}</option>)}</select></label>
        </div>
        {questions.length === 0 ? (
          <div className="teacher-empty-state">
            <span className="teacher-empty-icon">▦</span>
            <h3>Belum ada soal</h3>
            <p>Tambahkan soal pilihan ganda pertama untuk mulai membangun bank soalmu.</p>
            <button className="teacher-primary-button" type="button" onClick={onAdd}><span>＋</span> Tambah soal</button>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="teacher-empty-state compact">
            <h3>Tidak ada soal yang cocok</h3>
            <p>Coba ubah kata pencarian atau filter yang dipilih.</p>
            <button type="button" className="teacher-outline-button" onClick={() => {
              setSearch('')
              setSubjectFilter('')
              setChapterFilter('')
              setDifficultyFilter('')
              setBloomFilter('')
            }}>Hapus filter</button>
          </div>
        ) : (
          <div className="teacher-question-list">
            {filteredQuestions.map((question, index) => (
              <article className="teacher-question-card" key={question.id}>
                <span className="teacher-question-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="teacher-question-copy">
                  <div className="teacher-question-tags">
                    <span>{question.subject}</span><span>{question.chapter}</span><span>{question.bloomLevel}</span><span>{question.difficulty}</span>
                  </div>
                  <h3>{question.prompt}</h3>
                  <p>{question.options.map((option) => `${option.id}. ${option.text}`).join('  ·  ')}</p>
                  <small>{question.durationSeconds} detik <span>·</span> Jawaban benar: {question.correctOption} <span>·</span> {question.reviewStatus}</small>
                </div>
                <div className="teacher-question-actions">
                  <button type="button" onClick={() => onEdit(question)}>Edit</button>
                  <button className="danger" type="button" onClick={() => onDelete(question)}>Hapus</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function SessionsPage({ rooms, onCreate, onOpen }) {
  return (
    <>
      <PageHeading
        eyebrow="BELAJAR BERSAMA"
        title="Sesi Game"
        description="Buat arena baru dan bagikan kode sesi kepada murid di kelas."
      >
        <button className="teacher-primary-button" type="button" onClick={onCreate}><span>＋</span> Buat sesi game</button>
      </PageHeading>
      <section className="teacher-panel">
        <div className="teacher-panel-heading">
          <div><h2>Sesi yang sedang berlangsung</h2><p>Buka kembali arena aktif untuk melanjutkan permainan.</p></div>
          <span className="teacher-session-count"><i /> {rooms.length} aktif</span>
        </div>
        {rooms.length === 0 ? (
          <div className="teacher-empty-state">
            <span className="teacher-empty-icon">◉</span>
            <h3>Belum ada sesi aktif</h3>
            <p>Mulai sesi game, lalu bagikan kode enam digit ke muridmu.</p>
            <button className="teacher-primary-button" type="button" onClick={onCreate}><span>＋</span> Buat sesi pertama</button>
          </div>
        ) : (
          <div className="teacher-session-list">
            {rooms.map((room) => (
              <article className="teacher-session-card" key={room.code}>
                  <span className="teacher-session-game">{room.gameType === 'territory_grid' ? 'TG' : 'SC'}</span>
                  <div><strong>{room.title}</strong><small>{room.playerCount} murid sudah bergabung <span>·</span> {room.gameType === 'territory_grid'
                    ? `Petak ${room.boardProgress}/25`
                    : `Soal ${Math.min(room.currentQuestion + 1, room.questionCount)} dari ${room.questionCount}`}</small></div>
                <span className="teacher-session-code">Kode <b>{room.code}</b></span>
                <button className="teacher-outline-button" type="button" onClick={() => onOpen(room.code)}>Buka sesi</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function ClassesPage({ classes, className, setClassName, saving, onCreate }) {
  return (
    <>
      <PageHeading
        eyebrow="KOMUNITAS KELAS"
        title="Kelas & Siswa"
        description="Buat kelas, bagikan kode, dan lihat murid yang sudah bergabung."
      />
      <section className="teacher-panel teacher-class-create">
        <div><span className="teacher-eyebrow">BUAT KELAS BARU</span><h2>Mulai kelompok belajar</h2><p>Setiap kelas memiliki kode unik yang dimasukkan murid saat membuat akun.</p></div>
        <form onSubmit={onCreate}>
          <label htmlFor="teacher-class-name">Nama kelas</label>
          <div><input id="teacher-class-name" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Contoh: Matematika 8A" maxLength={80} required /><button className="teacher-primary-button" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : '＋ Buat kelas'}</button></div>
        </form>
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-heading"><div><h2>Kelas saya</h2><p>{classes.length} kelas dibuat</p></div></div>
        {classes.length === 0 ? (
          <div className="teacher-empty-state compact"><span className="teacher-empty-icon">♙</span><h3>Belum ada kelas</h3><p>Buat kelas untuk mendapatkan kode undangan bagi murid.</p></div>
        ) : (
          <div className="teacher-class-list">
            {classes.map((classItem) => (
              <article className="teacher-class-card" key={classItem.id}>
                <div className="teacher-class-card-heading"><span className="teacher-class-icon">♙</span><div><h3>{classItem.name}</h3><p>{classItem.studentCount} murid bergabung</p></div><span className="teacher-class-code">KODE <b>{classItem.classCode}</b></span></div>
                {classItem.students.length === 0 ? (
                  <p className="teacher-no-students">Belum ada murid. Bagikan kode kelas <strong>{classItem.classCode}</strong> saat mereka mendaftar.</p>
                ) : (
                  <div className="teacher-student-list">
                    {classItem.students.map((student) => <div key={student.id}><span className="teacher-avatar small">{student.name.slice(0, 1).toUpperCase()}</span><strong>{student.name}</strong><small>{student.email}</small></div>)}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function ReportsPage({ reports, onExport }) {
  const summary = reports?.summary || { completedSessions: 0, activeSessions: 0, studentsPlayed: 0 }
  const classPerformance = reports?.classPerformance || []
  const studentPerformance = reports?.studentPerformance || []
  const questionAnalytics = reports?.questionAnalytics || []
  return (
    <>
      <PageHeading
        eyebrow="RINGKASAN AKTIVITAS"
        title="Laporan"
        description="Lihat sesi game yang sudah selesai dan partisipasi murid."
      >
        <button className="teacher-outline-button" type="button" onClick={onExport}>Ekspor CSV <span aria-hidden="true">↓</span></button>
      </PageHeading>
      <section className="teacher-stat-grid report-stats">
        <StatCard label="Sesi selesai" value={summary.completedSessions} detail="Sesi game tuntas" icon="✓" tone="green" />
        <StatCard label="Sesi aktif" value={summary.activeSessions} detail="Sedang berlangsung" icon="◉" tone="blue" />
        <StatCard label="Partisipasi murid" value={summary.studentsPlayed} detail="Total keikutsertaan" icon="♙" tone="orange" />
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-heading"><div><h2>Ringkasan kelas</h2><p>Partisipasi murid pada sesi yang sudah selesai.</p></div></div>
        {classPerformance.length === 0 ? (
          <div className="teacher-empty-state compact"><span className="teacher-empty-icon">♙</span><h3>Belum ada data kelas</h3><p>Buat kelas dan jalankan sesi game untuk melihat ringkasannya.</p></div>
        ) : (
          <div className="teacher-report-class-list">
            {classPerformance.map((classItem) => (
              <article className="teacher-report-class" key={classItem.id}>
                <div><strong>{classItem.name}</strong><small>Kode {classItem.classCode} · {classItem.studentsPlayed}/{classItem.studentCount} murid pernah bermain</small></div>
                <span>{classItem.participations} partisipasi</span>
                <strong>{classItem.averageScore} rata-rata poin</strong>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-heading"><div><h2>Perkembangan murid</h2><p>Skor dan jumlah sesi selesai pada arena yang kamu buat.</p></div></div>
        {studentPerformance.length === 0 ? (
          <div className="teacher-empty-state compact"><span className="teacher-empty-icon">♙</span><h3>Belum ada murid</h3><p>Murid yang bergabung ke kelasmu akan muncul di sini.</p></div>
        ) : (
          <div className="teacher-report-student-list">
            {studentPerformance.map((student, index) => (
              <article className="teacher-report-student" key={student.studentId}>
                <span className="teacher-report-rank">{index + 1}</span>
                <div><strong>{student.studentName}</strong><small>{student.className} · {student.completedSessions} sesi selesai</small></div>
                <span>{student.totalPoints} total poin</span>
                <strong>Terbaik {student.bestScore}</strong>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-heading"><div><h2>Analisis soal</h2><p>Soal dengan akurasi terendah ditampilkan lebih dulu.</p></div></div>
        {questionAnalytics.length === 0 ? (
          <div className="teacher-empty-state compact"><span className="teacher-empty-icon">▦</span><h3>Belum ada jawaban untuk dianalisis</h3><p>Analisis muncul setelah murid menjawab soal di sesi game.</p></div>
        ) : (
          <div className="teacher-question-analytics">
            {questionAnalytics.map((question, index) => (
              <article className="teacher-question-insight" key={`${question.subject}-${question.chapter}-${question.question}`}>
                <span className="teacher-insight-rank">{String(index + 1).padStart(2, '0')}</span>
                <div className="teacher-insight-copy">
                  <strong>{question.question}</strong>
                  <small>{question.subject} · {question.chapter} · {question.correctCount} benar · {question.incorrectCount} salah · {question.skippedCount} dilewati</small>
                  <div className="teacher-insight-progress" role="progressbar" aria-label={`Akurasi jawaban ${question.accuracyPercent}%`} aria-valuenow={question.accuracyPercent} aria-valuemin="0" aria-valuemax="100">
                    <span style={{ width: `${question.accuracyPercent}%` }} />
                  </div>
                </div>
                <strong className="teacher-insight-percent">{question.accuracyPercent}%</strong>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-heading"><div><h2>Riwayat sesi selesai</h2><p>Skor tertinggi dan jumlah murid di setiap sesi.</p></div></div>
        {!reports?.completedRooms?.length ? (
          <div className="teacher-empty-state compact"><span className="teacher-empty-icon">▤</span><h3>Belum ada laporan</h3><p>Laporan akan muncul setelah sesi game selesai.</p></div>
        ) : (
          <div className="teacher-report-list">
            {reports.completedRooms.map((room) => (
              <article className="teacher-report-row" key={room.code}>
                <span className="teacher-session-game">{room.gameType === 'territory_grid' ? 'TG' : 'SC'}</span>
                <div><strong>{room.gameType === 'territory_grid' ? 'Territory Grid' : 'Speed Clash'}</strong><small>Kode {room.code} <span>·</span> {new Date(`${room.createdAt}Z`).toLocaleDateString('id-ID')}</small></div>
                <span>{room.studentCount} murid</span><strong>{room.highestScore} poin</strong>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function SettingsPage({ user }) {
  return (
    <>
      <PageHeading
        eyebrow="AKUN PENGAJAR"
        title="Pengaturan"
        description="Informasi akun guru yang sedang digunakan."
      />
      <section className="teacher-panel teacher-settings-panel">
        <span className="teacher-avatar large">{user.name.slice(0, 1).toUpperCase()}</span>
        <div><span className="teacher-eyebrow">PROFIL GURU</span><h2>{user.name}</h2><p>{user.email}</p></div>
        <dl><div><dt>Peran</dt><dd>Guru</dd></div><div><dt>Sekolah</dt><dd>{user.school || 'Belum diisi'}</dd></div></dl>
        <p className="teacher-settings-note">Pengubahan profil belum tersedia. Informasi ini berasal dari data pendaftaran akun.</p>
      </section>
    </>
  )
}

function SessionSetupPage({ questions, selectedGame, onSelectGame, onCreate, onAddQuestion, onCancel }) {
  const approvedQuestions = questions.filter((question) => question.reviewStatus === 'Disetujui')
  const subjects = [...new Set(approvedQuestions.map((question) => question.subject))]
  const [selectedSubject, setSelectedSubject] = useState(subjects[0] || 'Matematika')
  const [selectedChapter, setSelectedChapter] = useState('')
  const chapters = [...new Set(
    approvedQuestions
      .filter((question) => question.subject === selectedSubject)
      .map((question) => question.chapter),
  )]
  const matchingQuestions = approvedQuestions.filter((question) => (
    question.subject === selectedSubject
    && (!selectedChapter || question.chapter === selectedChapter)
  ))
  const questionLimit = approvedQuestions.length ? matchingQuestions.length : 3
  const [questionCount, setQuestionCount] = useState(Math.min(3, questionLimit))
  const numericQuestionCount = questionCount === '' ? 0 : Number(questionCount)
  const selectedQuestionCount = Number.isInteger(numericQuestionCount) && numericQuestionCount > 0
    ? Math.min(numericQuestionCount, questionLimit)
    : 0
  const isTerritoryGrid = selectedGame === 'territory_grid'

  function createConfiguredSession() {
    onCreate({
      subject: selectedSubject,
      chapter: selectedChapter,
      questionCount: selectedQuestionCount,
    })
  }

  return (
    <>
      <button className="teacher-back-link" type="button" onClick={onCancel}>← Kembali ke sesi game</button>
      <PageHeading
        eyebrow="SIAPKAN PERMAINAN"
        title="Buat sesi game"
        description="Pilih materi dan mode bermain, lalu bagikan kode sesi kepada murid."
      />
      <div className="teacher-setup-layout">
        <section className="teacher-setup-main">
          <div className="teacher-setup-step">
            <div className="teacher-setup-step-title"><span>1</span><div><h2>Atur materi & jumlah soal</h2><p>Pilih soal yang sudah disetujui dari bank soalmu.</p></div></div>
            <div className="teacher-setup-fields">
              <label>
                <small>Mapel</small>
                <select
                  value={selectedSubject}
                  onChange={(event) => {
                    setSelectedSubject(event.target.value)
                    setSelectedChapter('')
                  }}
                >
                  {(subjects.length ? subjects : ['Matematika']).map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </label>
              <label>
                <small>Bab / materi</small>
                <select value={selectedChapter} onChange={(event) => setSelectedChapter(event.target.value)}>
                  <option value="">{approvedQuestions.length ? 'Semua bab' : 'Soal bawaan Speed Clash'}</option>
                  {chapters.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
                </select>
              </label>
              <label>
                <small>Jumlah soal</small>
                <input
                  aria-label="Jumlah soal"
                  type="number"
                  min="1"
                  max={questionLimit}
                  value={selectedQuestionCount || ''}
                  disabled={!questionLimit}
                  onChange={(event) => setQuestionCount(event.target.value)}
                />
              </label>
            </div>
            <div className="teacher-setup-question-tools">
              <p className="teacher-setup-question-help">
                {approvedQuestions.length
                  ? `${matchingQuestions.length} soal tersedia untuk pilihan materi ini.`
                  : 'Belum ada soal disetujui; kamu bisa buat soal sendiri atau pakai soal bawaan.'}
              </p>
              <button type="button" className="teacher-setup-add-question" onClick={onAddQuestion}>
                + Buat soal sendiri
              </button>
            </div>
          </div>
          <div className="teacher-setup-step">
            <div className="teacher-setup-step-title"><span>2</span><div><h2>Pilih template game</h2><p>Pilih cara belajar yang paling cocok untuk kelasmu.</p></div></div>
            <div className="teacher-template-grid">
              <button
                className={`teacher-template-card${!isTerritoryGrid ? ' selected' : ''}`}
                type="button"
                aria-pressed={!isTerritoryGrid}
                onClick={() => onSelectGame('speed_clash')}
              >
                <span className="teacher-template-badge">SIAP DIMAINKAN</span>
                <span className="teacher-game-icon orange">SC</span>
                <h3>Speed Clash</h3>
                <p>Jawab cepat dan kumpulkan poin sebanyak-banyaknya.</p>
                <small>1–30 murid · Individu</small>
              </button>
              <button
                className={`teacher-template-card${isTerritoryGrid ? ' selected' : ''}`}
                type="button"
                aria-pressed={isTerritoryGrid}
                onClick={() => onSelectGame('territory_grid')}
              >
                <span className="teacher-template-badge">SIAP DIMAINKAN</span>
                <span className="teacher-game-icon blue">TG</span>
                <h3>Territory Grid</h3>
                <p>Setiap murid bergiliran memilih petak dan menjawab soal.</p>
                <small>Individu · Papan 5×5</small>
              </button>
            </div>
          </div>
          <div className="teacher-setup-step">
            <div className="teacher-setup-step-title"><span>3</span><div><h2>Mode permainan</h2><p>{isTerritoryGrid ? 'Giliran berpindah setelah murid menjawab atau guru melewati giliran.' : 'Semua murid menjawab setiap soal sebelum guru melanjutkan.'}</p></div></div>
            <div className="teacher-mode-options">
              <span className="teacher-mode-option selected">{isTerritoryGrid ? 'Individu · bergiliran' : 'Latihan · semua murid bermain'}</span>
              {isTerritoryGrid && <span className="teacher-mode-option">Mayoritas petak menang saat papan penuh</span>}
            </div>
          </div>
          <div className="teacher-setup-summary">
            Siap: {isTerritoryGrid ? 'Territory Grid · papan 5×5' : 'Speed Clash · mode latihan'}
            <span>·</span> {selectedSubject}
            <span>·</span> {selectedChapter || (approvedQuestions.length ? 'Semua bab' : 'Soal bawaan')}
            <span>·</span> {selectedQuestionCount || 'Pilih jumlah'} soal {isTerritoryGrid && 'dipakai bergiliran sampai papan penuh'}
          </div>
          <div className="teacher-setup-actions">
            <button type="button" className="teacher-outline-button" onClick={onCancel}>Batal</button>
            <button
              type="button"
              className="teacher-primary-button"
              onClick={createConfiguredSession}
              disabled={!selectedQuestionCount}
            >
              Buat sesi game <span>→</span>
            </button>
          </div>
        </section>
        <aside className="teacher-setup-aside">
          <span className="teacher-setup-aside-icon">✦</span>
          <strong>Siap bermain?</strong>
          <p>Bagikan kode sesi yang muncul kepada murid agar mereka bisa bergabung dari perangkat masing-masing.</p>
        </aside>
      </div>
    </>
  )
}

function QuestionForm({ form, isEditing, isSaving, onChange, onOptionChange, onClose, onSubmit, inline = false }) {
  return (
    <div className={inline ? 'teacher-question-page' : 'teacher-modal-backdrop'} role={inline ? undefined : 'presentation'} onMouseDown={(event) => {
      if (!inline && event.target === event.currentTarget && !isSaving) onClose()
    }}>
      <section className={`teacher-question-modal${inline ? ' is-inline' : ''}`} role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : 'true'} aria-labelledby="question-form-title">
        <button className="teacher-back-link" type="button" onClick={onClose} disabled={isSaving}>← Kembali ke bank soal</button>
        <header className="teacher-modal-header">
          <div><span className="teacher-eyebrow">BANK SOAL</span><h2 id="question-form-title">{isEditing ? 'Edit soal' : 'Tambah soal baru'}</h2><p>Lengkapi detail soal untuk kelasmu.</p></div>
          <button type="button" className="teacher-modal-close" onClick={onClose} aria-label="Tutup form" disabled={isSaving}>×</button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="teacher-form-grid">
            <label>Mata pelajaran
              <input
                value={form.subject}
                onChange={(event) => onChange((current) => ({ ...current, subject: event.target.value }))}
                placeholder="Contoh: Matematika"
                maxLength={80}
                required
                list="teacher-subject-suggestions"
              />
              <datalist id="teacher-subject-suggestions">
                <option value="Matematika" />
                <option value="IPA" />
                <option value="Bahasa Indonesia" />
                <option value="Bahasa Inggris" />
              </datalist>
            </label>
            <label>Bab / materi
              <input value={form.chapter} onChange={(event) => onChange((current) => ({ ...current, chapter: event.target.value }))} placeholder="Contoh: Barisan dan deret" maxLength={120} required />
            </label>
            <label>Jenis soal
              <select value={form.questionType} onChange={(event) => onChange((current) => ({ ...current, questionType: event.target.value }))}>
                <option>Pilihan ganda</option>
              </select>
            </label>
            <label>Level kognitif
              <select value={form.bloomLevel} onChange={(event) => onChange((current) => ({ ...current, bloomLevel: event.target.value }))}>
                <option value="C1">C1 · Mengingat</option><option value="C2">C2 · Memahami</option><option value="C3">C3 · Menerapkan</option><option value="C4">C4 · Menganalisis</option><option value="C5">C5 · Mengevaluasi</option><option value="C6">C6 · Mencipta</option>
              </select>
            </label>
            <label>Tingkat kesulitan
              <select value={form.difficulty} onChange={(event) => onChange((current) => ({ ...current, difficulty: event.target.value }))}>
                <option>Mudah</option><option>Sedang</option><option>Sulit</option>
              </select>
            </label>
            <label>Waktu menjawab (detik)
              <input type="number" min="10" max="120" value={form.durationSeconds} onChange={(event) => onChange((current) => ({ ...current, durationSeconds: event.target.value }))} required />
            </label>
          </div>
          <label className="teacher-form-full">Pertanyaan
            <textarea value={form.prompt} onChange={(event) => onChange((current) => ({ ...current, prompt: event.target.value }))} placeholder="Tulis pertanyaan dengan jelas..." maxLength={2000} rows={3} required />
          </label>
          <fieldset className="teacher-options-fieldset">
            <legend>Pilihan jawaban <span>Pilih jawaban yang benar</span></legend>
            <div className="teacher-option-grid">
              {form.options.map((option, index) => {
                const id = String.fromCharCode(65 + index)
                return (
                  <label className={`teacher-option-input${form.correctOption === id ? ' is-correct' : ''}`} key={id}>
                    <input type="radio" name="correctOption" value={id} checked={form.correctOption === id} onChange={() => onChange((current) => ({ ...current, correctOption: id }))} aria-label={`Tandai pilihan ${id} sebagai jawaban benar`} />
                    <span>{id}</span>
                    <input value={option} onChange={(event) => onOptionChange(index, event.target.value)} placeholder={`Pilihan ${id}`} maxLength={240} required aria-label={`Teks pilihan ${id}`} />
                  </label>
                )
              })}
            </div>
          </fieldset>
          <label className="teacher-form-full">Pembahasan <span className="teacher-optional">(opsional)</span>
            <textarea value={form.explanation} onChange={(event) => onChange((current) => ({ ...current, explanation: event.target.value }))} placeholder="Tambahkan penjelasan jawaban..." maxLength={1000} rows={2} />
          </label>
          <footer className="teacher-modal-actions">
            <button className="teacher-outline-button" type="button" onClick={onClose} disabled={isSaving}>Batal</button>
            <button className="teacher-primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Menyimpan...' : isEditing ? 'Simpan perubahan' : 'Simpan soal'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
