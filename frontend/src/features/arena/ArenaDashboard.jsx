import { useEffect, useState } from 'react'
import BrandMark from '../../components/BrandMark.jsx'
import { apiRequest } from '../../lib/api.js'
import './StudentDashboard.css'

function writeStudentHistory(route) {
  const currentState = window.history.state
  const baseState = currentState && typeof currentState === 'object' ? currentState : {}
  window.history.pushState(
    { ...baseState, asalinkStudent: route },
    '',
    window.location.href,
  )
}

export default function ArenaDashboard({ user, onLogout, initialRoom = null, onExit }) {
  const [rooms, setRooms] = useState([])
  const [progress, setProgress] = useState({ completedSessions: 0, totalPoints: 0, bestScore: 0 })
  const [history, setHistory] = useState([])
  const [classLeaderboard, setClassLeaderboard] = useState([])
  const [activeRoom, setActiveRoom] = useState(initialRoom)
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(30)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [joining, setJoining] = useState(false)
  const [selectedTerritoryCell, setSelectedTerritoryCell] = useState(null)
  const activeRoomCode = activeRoom?.code
  const selectedCell = activeRoom?.territory
    && selectedTerritoryCell?.roomCode === activeRoom.code
    && selectedTerritoryCell?.turnIndex === activeRoom.territory.turnIndex
    ? selectedTerritoryCell.cell
    : null

  useEffect(() => {
    if (user.role !== 'Murid') return undefined

    const savedRoute = window.history.state?.asalinkStudent
    if (savedRoute?.userId !== user.id) {
      const currentState = window.history.state
      const baseState = currentState && typeof currentState === 'object' ? currentState : {}
      window.history.replaceState(
        { ...baseState, asalinkStudent: { home: true, userId: user.id } },
        '',
        window.location.href,
      )
    } else if (savedRoute.roomCode) {
      apiRequest(`/api/rooms/${savedRoute.roomCode}`)
        .then(({ room }) => setActiveRoom(room))
        .catch((requestError) => setError(requestError.message))
    }

    function restoreStudentRoute(event) {
      const route = event.state?.asalinkStudent
      setSelectedTerritoryCell(null)
      if (route?.userId !== user.id || !route.roomCode) {
        setActiveRoom(null)
        return
      }

      apiRequest(`/api/rooms/${route.roomCode}`)
        .then(({ room }) => setActiveRoom(room))
        .catch((requestError) => setError(requestError.message))
    }

    window.addEventListener('popstate', restoreStudentRoute)
    return () => window.removeEventListener('popstate', restoreStudentRoute)
  }, [user.id, user.role])

  useEffect(() => {
    if (activeRoomCode) return undefined

    let active = true
    async function refreshRooms() {
      try {
        const data = await apiRequest('/api/rooms')
        if (active) {
          setRooms(data.rooms)
          setProgress(data.progress)
        }
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }

    refreshRooms()
    const intervalId = window.setInterval(refreshRooms, 2500)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [activeRoomCode])

  useEffect(() => {
    if (activeRoomCode) return undefined

    let active = true
    apiRequest('/api/rooms/history')
      .then((data) => {
        if (active) {
          setHistory(data.history)
          setClassLeaderboard(data.leaderboard)
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })

    return () => { active = false }
  }, [activeRoomCode])

  useEffect(() => {
    if (!activeRoomCode) return undefined

    let active = true
    async function refreshRoom() {
      try {
        const data = await apiRequest(`/api/rooms/${activeRoomCode}`)
        if (active) setActiveRoom(data.room)
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }

    refreshRoom()
    const intervalId = window.setInterval(refreshRoom, 1200)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [activeRoomCode])

  useEffect(() => {
    if (!activeRoom?.questionStartedAt || activeRoom.finished) return undefined

    const durationSeconds = activeRoom.durationSeconds || 30
    function updateClock() {
      const elapsed = Math.floor((Date.now() - activeRoom.questionStartedAt) / 1000)
      setSecondsLeft(Math.max(0, durationSeconds - elapsed))
    }
    updateClock()
    const intervalId = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(intervalId)
  }, [activeRoom?.questionStartedAt, activeRoom?.finished, activeRoom?.durationSeconds])

  async function joinArena(event) {
    event.preventDefault()
    await joinArenaWithCode(roomCode)
  }

  async function joinArenaWithCode(code) {
    setError('')
    setJoining(true)
    try {
      const data = await apiRequest('/api/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setRoomCode('')
      if (user.role === 'Murid') {
        writeStudentHistory({ roomCode: data.room.code, userId: user.id })
      }
      setActiveRoom(data.room)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setJoining(false)
    }
  }

  async function answerQuestion(answer) {
    setError('')
    try {
      const data = await apiRequest(`/api/rooms/${activeRoom.code}/answer`, {
        method: 'POST',
        body: JSON.stringify({ answer }),
      })
      setActiveRoom(data.room)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function claimTerritoryCell(answer) {
    if (selectedCell === null) {
      setError('Pilih petak yang masih tersedia terlebih dahulu.')
      return
    }

    setError('')
    try {
      const data = await apiRequest(`/api/rooms/${activeRoom.code}/claim`, {
        method: 'POST',
        body: JSON.stringify({
          cell: selectedCell,
          answer,
          turnIndex: activeRoom.territory.turnIndex,
        }),
      })
      setSelectedTerritoryCell(null)
      setActiveRoom(data.room)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function nextQuestion() {
    setError('')
    try {
      const data = await apiRequest(`/api/rooms/${activeRoom.code}/next`, { method: 'POST' })
      setActiveRoom(data.room)
    } catch (requestError) {
      setError(requestError.message)
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

  function returnToDashboard() {
    if (onExit) {
      onExit()
      return
    }
    if (
      user.role === 'Murid'
      && window.history.state?.asalinkStudent?.userId === user.id
      && window.history.state.asalinkStudent.roomCode
    ) {
      window.history.back()
      return
    }
    setActiveRoom(null)
  }

  if (activeRoom) {
    const isHost = user.role === 'Guru'
    const isTerritoryGrid = activeRoom.gameType === 'territory_grid'
    const territory = activeRoom.territory
    const isMyTerritoryTurn = territory?.currentPlayerId === user.id
    const answeredCount = activeRoom.players.filter((player) => player.answered).length
    const currentPlayer = activeRoom.players.find((player) => player.id === user.id)
    const highestScore = activeRoom.players[0]?.score || 0
    const territoryWinners = isTerritoryGrid
      ? activeRoom.players.filter((player) => player.score === highestScore)
      : []

    return (
      <main className="arena-app game-screen">
        <header className="arena-header">
          {onExit ? (
            <button className="arena-brand" type="button" onClick={returnToDashboard}>
              <span aria-hidden="true">←</span> <strong>Dashboard Guru</strong>
            </button>
          ) : (
            <button className="arena-brand" type="button" onClick={returnToDashboard}>
              <BrandMark /> <strong>GameEdu</strong>
            </button>
          )}
          <div className="game-header-meta">
            <span>{activeRoom.title} · {activeRoom.subject || activeRoom.question?.subject || 'Matematika'} · {activeRoom.chapter || activeRoom.question?.chapter || 'Bab 3'}</span>
            <span>{isTerritoryGrid
              ? `Petak ${territory?.filledCount || 0} / 25`
              : `Soal ${Math.min(activeRoom.currentQuestion + 1, activeRoom.questionCount)} / ${activeRoom.questionCount}`}</span>
            <span className="room-code-chip">Kode room <strong>{activeRoom.code}</strong></span>
            <button className="arena-logout" type="button" onClick={logout} disabled={logoutBusy}>
              {logoutBusy ? 'Keluar...' : 'Keluar'}
            </button>
          </div>
        </header>

        <div className="game-content">
          <section className="game-main">
            {activeRoom.finished ? (
              <div className="question-board finished-board">
                <span className="game-kicker">ARENA SELESAI</span>
                <h1>{isTerritoryGrid ? 'Papan sudah penuh!' : 'Permainan selesai!'}</h1>
                <p>{isTerritoryGrid ? 'Petak terbanyak menjadi pemenang. Ini hasil akhirnya:' : 'Terima kasih sudah ikut bermain. Ini hasil akhirnya:'}</p>
                {isTerritoryGrid && (
                  <>
                    <p className="territory-winner-label">
                      {territoryWinners.length > 1
                        ? `Seri! ${territoryWinners.map((player) => player.name).join(' dan ')} sama-sama menguasai ${highestScore / 100} petak.`
                        : `${territoryWinners[0]?.name || 'Pemenang'} menang dengan ${highestScore / 100} petak.`}
                    </p>
                    <TerritoryBoard board={territory.board} players={activeRoom.players} disabled />
                  </>
                )}
                <Leaderboard players={activeRoom.players} currentUserId={user.id} territory={isTerritoryGrid} />
                {!isHost && <AnswerReviewList answers={activeRoom.answerReview || []} />}
              </div>
            ) : isTerritoryGrid ? (
              <>
                <div className="question-board territory-question-board">
                  <span className="game-kicker">{isHost ? 'GILIRAN MURID' : isMyTerritoryTurn ? 'GILIRANMU' : 'TUNGGU GILIRAN'}</span>
                  <h1>{isHost || isMyTerritoryTurn ? activeRoom.question?.prompt : `Giliran ${territory?.currentPlayerName || 'murid berikutnya'}`}</h1>
                  <p>{isHost
                    ? `${territory?.currentPlayerName || 'Belum ada murid'} sedang memilih petak dan menjawab.`
                    : isMyTerritoryTurn
                      ? selectedCell === null ? 'Pilih satu petak kosong di papan, lalu jawab pertanyaan.' : `Petak ${selectedCell + 1} dipilih. Pilih jawabanmu!`
                      : 'Kamu bisa bermain saat giliranmu tiba.'}</p>
                  {territory?.lastTurn && (
                    <p className={`territory-turn-result${territory.lastTurn.correct ? ' is-correct' : ''}`}>
                      {territory.lastTurn.skipped
                        ? `Giliran ${territory.lastTurn.playerName} dilewati.`
                        : territory.lastTurn.correct
                          ? `${territory.lastTurn.playerName} berhasil merebut petak ${territory.lastTurn.cell + 1}!`
                          : `${territory.lastTurn.playerName} belum berhasil. Petak menjadi netral.`}
                    </p>
                  )}
                  {!isHost && isMyTerritoryTurn && secondsLeft === 0 && (
                    <p className="answer-confirmation">Waktu habis. Minta guru melewati giliran.</p>
                  )}
                </div>
                <TerritoryBoard
                  board={territory?.board || Array(25).fill(null)}
                  players={activeRoom.players}
                  selectedCell={selectedCell}
                  disabled={isHost || !isMyTerritoryTurn || secondsLeft === 0}
                  onSelectCell={(cell) => setSelectedTerritoryCell({
                    roomCode: activeRoom.code,
                    turnIndex: territory.turnIndex,
                    cell,
                  })}
                />
                {(isHost || isMyTerritoryTurn) && (
                  <div className="answer-grid">
                    {activeRoom.question?.options.map((option, index) => (
                      <button
                        className={`answer-option answer-color-${index}`}
                        key={option.id}
                        type="button"
                        disabled={isHost || !isMyTerritoryTurn || selectedCell === null || secondsLeft === 0}
                        onClick={() => claimTerritoryCell(option.id)}
                      >
                        <span>{option.id.toUpperCase()}</span>
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="question-board">
                  <span className="game-kicker">{isHost ? 'TAMPILAN GURU' : 'PILIH JAWABANMU'}</span>
                  <h1>{activeRoom.question?.prompt}</h1>
                  {isHost && <p className="host-hint">Tampilkan pertanyaan ini di layar kelasmu.</p>}
                  {!isHost && activeRoom.yourAnswer && (
                    <p className="answer-confirmation">Jawabanmu sudah terkirim. Tunggu soal berikutnya!</p>
                  )}
                  {!isHost && !activeRoom.yourAnswer && secondsLeft === 0 && (
                    <p className="answer-confirmation">Waktu menjawab habis. Tunggu soal berikutnya.</p>
                  )}
                </div>
                <div className="answer-grid">
                  {activeRoom.question?.options.map((option, index) => (
                    <button
                      className={`answer-option answer-color-${index}${activeRoom.yourAnswer === option.id ? ' answer-selected' : ''}`}
                      key={option.id}
                      type="button"
                      disabled={isHost || Boolean(activeRoom.yourAnswer) || secondsLeft === 0}
                      onClick={() => answerQuestion(option.id)}
                    >
                      <span>{option.id.toUpperCase()}</span>
                      <strong>{option.label}</strong>
                    </button>
                  ))}
                </div>
              </>
            )}
            {error && <p className="arena-error" role="alert">{error}</p>}
            <div className="game-actions">
              <button className="arena-secondary-button" type="button" onClick={returnToDashboard}>
                {onExit ? 'Kembali ke dashboard guru' : 'Kembali ke beranda'}
              </button>
              {isHost && !activeRoom.finished && (
                <button
                  className="arena-primary-button"
                  type="button"
                  onClick={nextQuestion}
                  disabled={isTerritoryGrid && !territory?.turnCount}
                >
                  {isTerritoryGrid
                    ? 'Lewati giliran'
                    : activeRoom.currentQuestion + 1 === activeRoom.questionCount ? 'Akhiri permainan' : 'Soal berikutnya'}
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </section>

          <aside className="game-sidebar">
            <section className="timer-card">
              <span>{isTerritoryGrid
                ? isMyTerritoryTurn && !isHost ? 'SISA WAKTU' : 'GILIRAN SEKARANG'
                : isHost ? 'PESERTA MENJAWAB' : 'SISA WAKTU'}</span>
              <strong className={secondsLeft <= 8 && !isHost && (!isTerritoryGrid || isMyTerritoryTurn) ? 'timer-urgent' : ''}>
                {isTerritoryGrid && !isMyTerritoryTurn
                  ? territory?.currentPlayerName || 'Menunggu'
                  : isHost ? `${answeredCount}/${activeRoom.players.length}` : secondsLeft}
              </strong>
              <small>{isTerritoryGrid && !isMyTerritoryTurn ? 'pemain' : isHost ? 'murid' : 'detik'}</small>
              <div className="timer-progress"><span style={{ width: `${isTerritoryGrid
                ? ((territory?.filledCount || 0) / 25) * 100
                : isHost ? (activeRoom.players.length ? (answeredCount / activeRoom.players.length) * 100 : 0)
                  : (secondsLeft / (activeRoom.durationSeconds || 30)) * 100}%` }} /></div>
              <p>{isTerritoryGrid
                ? `${territory?.filledCount || 0} dari 25 petak terisi`
                : isHost ? `${answeredCount} dari ${activeRoom.players.length} murid sudah menjawab`
                  : `Soal ${activeRoom.currentQuestion + 1} dari ${activeRoom.questionCount}`}</p>
            </section>
            <section className="leaderboard-card">
              <div className="sidebar-card-title"><span>Papan peringkat</span><span>{isTerritoryGrid ? 'PETAK' : 'SKOR'}</span></div>
              <Leaderboard players={activeRoom.players} currentUserId={user.id} territory={isTerritoryGrid} />
              {activeRoom.players.length === 0 && <p className="empty-players">Belum ada murid bergabung.</p>}
            </section>
            {!isHost && currentPlayer && (
              <p className="your-score">{isTerritoryGrid ? 'Petak kamu' : 'Skor kamu'} <strong>{isTerritoryGrid ? currentPlayer.capturedTiles : currentPlayer.score}</strong></p>
            )}
          </aside>
        </div>
        <p className="arena-footer">Masuk sebagai {user.role.toLowerCase()} · {user.name}</p>
      </main>
    )
  }

  const openRooms = rooms
  const joinedRoom = openRooms.find((room) => room.joined)
  const progressCards = [
    { icon: '✓', label: 'Sesi selesai', value: progress.completedSessions, detail: 'arena yang kamu tuntaskan' },
    { icon: '★', label: 'Total poin', value: progress.totalPoints, detail: 'poin dari semua permainan' },
    { icon: '↗', label: 'Skor terbaik', value: progress.bestScore, detail: 'poin dalam satu arena' },
  ]
  const nextSessionGoal = (Math.floor(progress.completedSessions / 3) + 1) * 3
  const sessionGoalProgress = ((progress.completedSessions % 3) / 3) * 100
  const achievements = [
    { title: 'Mulai Berpetualang', detail: 'Selesaikan arena pertamamu', unlocked: progress.completedSessions >= 1 },
    { title: 'Murid Tekun', detail: 'Selesaikan 5 arena', unlocked: progress.completedSessions >= 5 },
    { title: 'Pengumpul Poin', detail: 'Kumpulkan 1.000 poin', unlocked: progress.totalPoints >= 1000 },
  ]

  return (
    <div className="arena-app student-dashboard">
      <aside className="student-sidebar">
        <a className="student-brand" href="#student-home">
          <BrandMark /> <span>GameEdu</span>
        </a>
        <span className="student-nav-label">MENU UTAMA</span>
        <nav className="student-nav" aria-label="Navigasi murid">
          <a className="student-nav-link is-active" href="#student-home"><span aria-hidden="true">⌂</span>Beranda</a>
          <a className="student-nav-link" href="#student-games"><span aria-hidden="true">▦</span>Game pilihan</a>
          <a className="student-nav-link" href="#student-join"><span aria-hidden="true">↗</span>Gabung arena</a>
          <a className="student-nav-link" href="#student-rooms"><span aria-hidden="true">◉</span>Arena tersedia</a>
          <a className="student-nav-link" href="#student-history"><span aria-hidden="true">▤</span>Riwayat</a>
        </nav>
        <div className="student-sidebar-bottom">
          <div className="student-class-card">
            <span aria-hidden="true">✎</span>
            <div><small>Kode kelas</small><strong>{user.classCode || 'Belum bergabung'}</strong></div>
          </div>
          <div className="student-profile">
            <span className="student-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="student-profile-info"><strong>{user.name}</strong><small>Murid</small></span>
          </div>
        </div>
      </aside>

      <div className="student-workspace">
        <header className="student-topbar">
          <div className="student-breadcrumb"><span>GameEdu</span><b>/</b><strong>Beranda</strong></div>
          <div className="student-topbar-actions">
            <span className="student-mode-pill"><i /> Mode Murid</span>
            <span className="student-topbar-name">{user.name}</span>
            <button className="student-logout" type="button" onClick={logout} disabled={logoutBusy}>
              {logoutBusy ? 'Keluar...' : 'Keluar'}
            </button>
          </div>
        </header>

        <main className="student-content">
          <section className="student-welcome" id="student-home">
            <div className="student-welcome-copy">
              <span className="student-eyebrow">RUANG BELAJAR INTERAKTIF</span>
              <h1>Selamat datang, {user.name.split(' ')[0]}!</h1>
              <p>Pilih game, ajak teman, dan kumpulkan poin sebanyak-banyaknya.</p>
              <div className="student-welcome-profile">
                <span className="student-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                <span><strong>{user.name}</strong><small>{user.classCode ? `Kode kelas ${user.classCode}` : 'Belum bergabung kelas'}</small></span>
              </div>
              <a className="student-welcome-button" href="#student-join">Gabung permainan <span aria-hidden="true">→</span></a>
            </div>
            <div className="student-welcome-art" aria-hidden="true">
              <span className="student-art-spark">✦</span>
              <span className="student-art-tile art-tile-one">A</span>
              <span className="student-art-tile art-tile-two">★</span>
              <span className="student-art-tile art-tile-three">B</span>
              <span className="student-art-tile art-tile-four">C</span>
              <span className="student-art-tile art-tile-five">D</span>
            </div>
          </section>

          {error && <p className="arena-error dashboard-error" role="alert">{error}</p>}
          <section className="student-progress-section" aria-label="Progres belajarmu">
            <div className="student-progress-heading">
              <div><span className="arena-eyebrow">LANGKAH KECIL, PRESTASI BESAR</span><h2>Progres belajarmu</h2></div>
              <span>Terus semangat!</span>
            </div>
            <div className="student-progress-grid">
              {progressCards.map((card) => (
                <article className="student-progress-card" key={card.label}>
                  <span className="student-progress-icon" aria-hidden="true">{card.icon}</span>
                  <div><small>{card.label}</small><strong>{card.value.toLocaleString('id-ID')}</strong><span>{card.detail}</span></div>
                </article>
              ))}
            </div>
            <div className="student-goal-card">
              <span className="student-goal-icon" aria-hidden="true">🎯</span>
              <div className="student-goal-copy">
                <strong>Target berikutnya: selesaikan {nextSessionGoal} arena</strong>
                <small>{progress.completedSessions % 3} dari 3 sesi menuju target</small>
                <div className="student-goal-progress" role="progressbar" aria-label="Progres target sesi" aria-valuenow={sessionGoalProgress} aria-valuemin="0" aria-valuemax="100">
                  <span style={{ width: `${sessionGoalProgress}%` }} />
                </div>
              </div>
              <div className="student-achievements">
                {achievements.map((achievement) => (
                  <div className={`student-achievement${achievement.unlocked ? ' is-unlocked' : ''}`} key={achievement.title}>
                    <span aria-hidden="true">{achievement.unlocked ? '★' : '☆'}</span>
                    <div><strong>{achievement.title}</strong><small>{achievement.detail}</small></div>
                    <span className="student-achievement-status">{achievement.unlocked ? 'Diraih' : 'Belum'}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className={`student-resume-card${joinedRoom ? ' has-joined-room' : ''}`} aria-label="Lanjutkan belajar">
            <span className="student-resume-icon" aria-hidden="true">{joinedRoom ? '▶' : '✦'}</span>
            <div className="student-resume-copy">
              <span className="student-resume-kicker">{joinedRoom ? 'PERMAINANMU MENUNGGU' : 'SIAP UNTUK MULAI?'}</span>
              <strong>{joinedRoom ? `Lanjutkan ${joinedRoom.title}` : 'Belum ada arena yang kamu ikuti'}</strong>
              <p>{joinedRoom
                ? `${joinedRoom.subject || 'Matematika'} · ${joinedRoom.chapter || 'Bab 3'} · ${joinedRoom.gameType === 'territory_grid'
                  ? `Petak ${joinedRoom.boardProgress}/25`
                  : `Soal ${Math.min(joinedRoom.currentQuestion + 1, joinedRoom.questionCount)} dari ${joinedRoom.questionCount}`}`
                : openRooms.length
                  ? 'Ada arena aktif yang bisa kamu ikuti. Pilih arena dan mulai bermain bersama teman.'
                  : 'Masukkan kode dari guru atau tunggu arena baru muncul di daftar.'}</p>
            </div>
            <button
              className="student-resume-button"
              type="button"
              onClick={() => joinedRoom
                ? joinArenaWithCode(joinedRoom.code)
                : document.getElementById(openRooms.length ? 'student-rooms' : 'student-join')?.scrollIntoView({ behavior: 'smooth' })}
              disabled={joining}
            >
              {joining ? 'Menghubungkan...' : joinedRoom ? 'Lanjutkan' : openRooms.length ? 'Lihat arena' : 'Gabung arena'}
              {!joining && <span aria-hidden="true">→</span>}
            </button>
          </section>

          <div className="arena-dashboard-grid student-dashboard-grid">
            <section className="games-section" id="student-games">
              <div className="section-heading">
                <div><span className="arena-eyebrow">PILIH PERMAINAN</span><h2>Game siap dimainkan</h2></div>
                <span className="games-count">2 game tersedia</span>
              </div>
              <article className="game-list-card">
                <div className="game-icon speed-icon" aria-hidden="true">SC</div>
                <div className="game-list-info">
                  <strong>Speed Clash</strong>
                  <span>Kuis cepat · Mode individu · Soal dari guru</span>
                </div>
                <a className="student-game-hint" href="#student-join">Masukkan kode arena</a>
              </article>
              <article className="game-list-card">
                <div className="game-icon territory-icon" aria-hidden="true">TG</div>
                <div className="game-list-info">
                  <strong>Territory Grid</strong>
                  <span>Individu · Bergiliran merebut petak di papan 5×5</span>
                </div>
                <a className="student-game-hint" href="#student-rooms">Cari arena</a>
              </article>

              <form className="join-arena-form" id="student-join" onSubmit={joinArena}>
                <div className="join-arena-heading">
                  <label htmlFor="room-code">Gabung ke arena</label>
                  <span>6 DIGIT</span>
                </div>
                <p>Masukkan kode enam digit dari guru untuk bergabung ke Speed Clash atau Territory Grid.</p>
                <div>
                  <input
                    id="room-code"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    placeholder="Masukkan 6 digit kode"
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                  />
                  <button className="game-launch-button" type="submit" disabled={roomCode.length !== 6 || joining}>
                    {joining ? 'Menghubungkan...' : 'Gabung'}
                    {!joining && <span aria-hidden="true">→</span>}
                  </button>
                </div>
              </form>
            </section>

            <aside className="rooms-sidebar">
              <section className="active-room-card">
                <div className="active-room-top"><span>SIAP BERMAIN?</span><span className="active-indicator" /></div>
                <strong>Ayo mulai bermain!</strong>
                <p>Minta kode arena dari guru untuk bergabung dengan teman sekelasmu.</p>
                <a className="student-join-link" href="#student-join">Masukkan kode <span aria-hidden="true">→</span></a>
              </section>
              <section className="room-history" id="student-rooms">
                <div className="history-heading"><span>Arena tersedia untukmu</span><span>{openRooms.length}</span></div>
                {openRooms.length === 0 ? (
                  <div className="student-empty-arenas">
                    <span aria-hidden="true">◉</span>
                    <strong>Belum ada arena aktif</strong>
                    <p>Saat guru membuat sesi, arenanya akan muncul di sini. Kamu juga bisa langsung memakai kode dari guru.</p>
                    <a href="#student-join">Masukkan kode arena <span aria-hidden="true">→</span></a>
                  </div>
                ) : (
                  <div className="room-list">
                    {openRooms.map((room) => (
                      <article className="room-list-item" key={room.code}>
                        <div className="room-list-info">
                          <strong>{room.title}</strong>
                          <span>{room.subject || 'Matematika'} · {room.chapter || 'Bab 3'}</span>
                          <small>Guru: {room.hostName} · {room.playerCount} murid · {room.gameType === 'territory_grid'
                            ? `Petak ${room.boardProgress}/25`
                            : `Soal ${Math.min(room.currentQuestion + 1, room.questionCount)}/${room.questionCount}`}</small>
                        </div>
                        <div className="room-list-actions">
                          <span className="room-code-mini">{room.code}</span>
                          <button type="button" disabled={joining} onClick={() => joinArenaWithCode(room.code)}>
                            {joining ? 'Menghubungkan...' : room.joined ? 'Lanjutkan' : 'Gabung'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>

          <section className="student-history-section" id="student-history">
            <div className="student-history-heading">
              <div><span className="arena-eyebrow">PERJALANAN BELAJARMU</span><h2>Riwayat permainan</h2></div>
              <span>{history.length} sesi terakhir</span>
            </div>
            {history.length === 0 ? (
              <div className="student-history-empty">
                <span aria-hidden="true">▤</span><strong>Belum ada permainan selesai</strong>
                <p>Setelah menyelesaikan arena, kamu bisa melihat skor dan pembahasannya di sini.</p>
              </div>
            ) : (
              <div className="student-history-list">
                {history.map((item) => (
                  <article className="student-history-card" key={item.code}>
                    <div className="student-history-summary">
                      <span className="student-history-game-icon">{item.gameType === 'territory_grid' ? 'TG' : 'SC'}</span>
                      <div><strong>{item.title}</strong><small>{item.subject} · {item.chapter} · Guru {item.hostName}</small><small>{new Date(`${item.createdAt}Z`).toLocaleDateString('id-ID')}</small></div>
                      <strong className="student-history-score">{item.score} poin</strong>
                    </div>
                    <details className="student-history-review">
                      <summary>Lihat pembahasan ({item.answerReview.length} soal)</summary>
                      <AnswerReviewList answers={item.answerReview} gameType={item.gameType} />
                    </details>
                  </article>
                ))}
              </div>
            )}
          </section>

          {classLeaderboard.length > 0 && (
            <details className="student-class-leaderboard">
              <summary>Peringkat kelas <span>Opsional · berdasarkan poin arena selesai</span></summary>
              <Leaderboard players={classLeaderboard.map((player) => ({ ...player, score: player.totalPoints }))} currentUserId={user.id} />
            </details>
          )}
          <footer className="arena-dashboard-footer">GameEdu · Belajar jadi lebih seru!</footer>
        </main>
      </div>
    </div>
  )
}

function TerritoryBoard({ board, players, selectedCell = null, disabled = true, onSelectCell }) {
  const playerById = new Map(players.map((player) => [player.id, player]))

  return (
    <div className="territory-board-wrap">
      <div className="territory-board" role="group" aria-label="Papan Territory Grid 5 kali 5">
        {board.map((ownerId, index) => {
          const owner = ownerId && ownerId !== 'neutral' ? playerById.get(ownerId) : null
          const ownerIndex = owner ? players.findIndex((player) => player.id === owner.id) : -1
          const stateClass = owner ? `is-owned territory-owner-${ownerIndex % 6}` : ownerId === 'neutral' ? 'is-neutral' : 'is-empty'
          const className = `territory-cell ${stateClass}${selectedCell === index ? ' is-selected' : ''}`
          const label = owner
            ? `Petak ${index + 1}, dikuasai ${owner.name}`
            : ownerId === 'neutral'
              ? `Petak ${index + 1}, netral`
              : `Petak ${index + 1}, tersedia`

          return (
            <button
              className={className}
              key={index}
              type="button"
              aria-label={label}
              aria-pressed={selectedCell === index}
              disabled={disabled || ownerId !== null}
              onClick={() => onSelectCell?.(index)}
            >
              <span>{owner ? owner.name.slice(0, 1).toUpperCase() : ownerId === 'neutral' ? '×' : index + 1}</span>
            </button>
          )
        })}
      </div>
      <div className="territory-board-legend" aria-label="Warna pemain">
        {players.map((player, index) => (
          <span key={player.id}><i className={`territory-legend-dot territory-owner-${index % 6}`} />{player.name}</span>
        ))}
        {board.some((cell) => cell === 'neutral') && <span><i className="territory-legend-dot is-neutral" />Netral</span>}
      </div>
    </div>
  )
}

function AnswerReviewList({ answers, gameType }) {
  if (!answers.length) {
    return <p className="answer-review-empty">Pembahasan untuk permainan ini belum tersedia.</p>
  }

  return (
    <div className="answer-review-list">
      {answers.map((answer, index) => (
        <article className={`answer-review-item${answer.isCorrect ? ' is-correct' : ''}`} key={`${answer.turnIndex}-${index}`}>
          <div className="answer-review-heading">
            <strong>{gameType === 'territory_grid' ? `Giliran ${answer.turnIndex + 1}` : `Soal ${answer.questionNumber}`}</strong>
            <span>{answer.isCorrect ? 'Benar' : answer.isAnswered ? 'Belum tepat' : 'Tidak dijawab'}</span>
          </div>
          <p>{answer.prompt}</p>
          {answer.isAnswered && <small>Jawabanmu: {answer.selectedLabel || answer.selectedChoice}</small>}
          <small>Jawaban benar: {answer.correctLabel || answer.correctChoice || 'Tidak tersedia'}</small>
          <p className="answer-review-explanation">{answer.explanation || 'Pembahasan belum ditambahkan oleh guru.'}</p>
        </article>
      ))}
    </div>
  )
}

function Leaderboard({ players, currentUserId, territory = false }) {
  if (players.length === 0) return null

  return (
    <ol className="leaderboard-list">
      {players.slice(0, 5).map((player, index) => (
        <li className={player.id === currentUserId ? 'leaderboard-me' : ''} key={player.id}>
          <span className="leader-rank">{index + 1}</span>
          <span className="leader-name">{player.name}{player.id === currentUserId ? ' (kamu)' : ''}</span>
          <strong>{territory ? player.capturedTiles : player.score}</strong>
        </li>
      ))}
    </ol>
  )
}
