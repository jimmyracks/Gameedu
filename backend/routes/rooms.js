import { randomInt } from 'node:crypto'
import { questions, quizTitle } from '../../shared/game-data.js'
import { sendJson, readJson } from '../lib/http.js'
import { getAuthenticatedUser } from '../lib/session.js'

function emptyTerritoryState() {
  return {
    board: Array(25).fill(null),
    turnOrder: [],
    currentPlayerId: null,
    turnIndex: 0,
    lastTurn: null,
  }
}

function loadRoom(database, code) {
  const roomRow = database.prepare(`
    SELECT rooms.*, users.name AS host_name
    FROM rooms
    JOIN users ON users.id = rooms.host_user_id
    WHERE rooms.code = ?
  `).get(code)
  if (!roomRow) return undefined

  const playerRows = database.prepare(`
    SELECT users.id, users.name, room_players.score,
      room_players.answer_question, room_players.answer_choice, room_players.joined_question
    FROM room_players
    JOIN users ON users.id = room_players.user_id
    WHERE room_players.room_code = ?
    ORDER BY room_players.score DESC, users.name COLLATE NOCASE
  `).all(code)

  return {
    code: roomRow.code,
    hostId: roomRow.host_user_id,
    hostName: roomRow.host_name,
    gameType: roomRow.game_type || 'speed_clash',
    questions: roomRow.questions_json
      ? JSON.parse(roomRow.questions_json)
      : questions.map((question) => ({ ...question, subject: 'Matematika', chapter: 'Bab 3' })),
    players: Object.fromEntries(playerRows.map((player) => [
      player.id,
      {
        id: player.id,
        name: player.name,
        score: player.score,
        answerQuestion: player.answer_question,
        answerChoice: player.answer_choice,
        joinedQuestion: player.joined_question,
      },
    ])),
    currentQuestion: roomRow.current_question,
    questionStartedAt: roomRow.question_started_at,
    finished: Boolean(roomRow.finished),
    territoryState: roomRow.game_type === 'territory_grid'
      ? roomRow.territory_state_json
        ? JSON.parse(roomRow.territory_state_json)
        : emptyTerritoryState()
      : null,
  }
}

function roomSummary(room, user) {
  const firstQuestion = room.questions[0]
  const territoryState = room.territoryState
  return {
    code: room.code,
    title: room.gameType === 'territory_grid' ? 'Territory Grid' : quizTitle,
    gameType: room.gameType,
    hostName: room.hostName,
    ownedByMe: room.hostId === user.id,
    subject: firstQuestion?.subject || 'Matematika',
    chapter: firstQuestion?.chapter || 'Bab 3',
    playerCount: Object.keys(room.players).length,
    questionCount: room.questions.length,
    currentQuestion: room.currentQuestion,
    finished: room.finished,
    joined: Boolean(room.players[user.id]),
    boardProgress: territoryState
      ? territoryState.board.filter(Boolean).length
      : null,
  }
}

function answerReview(database, room, viewerId) {
  if (!room.finished) return []

  const rows = database.prepare(`
    SELECT question_index AS questionIndex, turn_index AS turnIndex,
      selected_choice AS selectedChoice, is_correct AS isCorrect,
      is_answered AS isAnswered, answered_at AS answeredAt
    FROM room_answers
    WHERE room_code = ? AND user_id = ?
    ORDER BY turn_index
  `).all(room.code, viewerId)

  return rows.map((row) => {
    const question = room.questions[row.questionIndex]
    const correctChoice = question?.answer || ''
    return {
      ...row,
      questionNumber: row.questionIndex + 1,
      prompt: question?.prompt || 'Soal tidak tersedia.',
      subject: question?.subject || 'Matematika',
      chapter: question?.chapter || 'Bab 3',
      selectedLabel: question?.options.find((option) => option.id === row.selectedChoice)?.label || '',
      correctChoice,
      correctLabel: question?.options.find((option) => option.id === correctChoice)?.label || '',
      explanation: question?.explanation || '',
      isCorrect: Boolean(row.isCorrect),
      isAnswered: Boolean(row.isAnswered),
    }
  })
}

function roomDetails(database, room, viewerId) {
  const territoryState = room.territoryState
  const firstQuestion = room.questions[0]
  const canViewCurrentQuestion = room.gameType !== 'territory_grid'
    || room.hostId === viewerId
    || territoryState?.currentPlayerId === viewerId
  const question = canViewCurrentQuestion ? room.questions[room.currentQuestion] : null
  const players = Object.values(room.players)
    .map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      answered: player.answerQuestion === room.currentQuestion,
      capturedTiles: room.gameType === 'territory_grid' ? Math.floor(player.score / 100) : null,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  return {
    code: room.code,
    title: room.gameType === 'territory_grid' ? 'Territory Grid' : quizTitle,
    gameType: room.gameType,
    hostName: room.hostName,
    subject: firstQuestion?.subject || 'Matematika',
    chapter: firstQuestion?.chapter || 'Bab 3',
    currentQuestion: room.currentQuestion,
    questionCount: room.questions.length,
    durationSeconds: question?.durationSeconds || 30,
    question: question
      ? {
          prompt: question.prompt,
          subject: question.subject || 'Matematika',
          chapter: question.chapter || 'Bab 3',
          options: question.options,
        }
      : null,
    questionStartedAt: room.questionStartedAt,
    finished: room.finished,
    players,
    yourAnswer: room.players[viewerId]?.answerQuestion === room.currentQuestion
      ? room.players[viewerId].answerChoice
      : null,
    answerReview: answerReview(database, room, viewerId),
    territory: territoryState
      ? {
          board: territoryState.board,
          boardSize: 5,
          turnIndex: territoryState.turnIndex,
          turnCount: territoryState.turnOrder.length,
          currentPlayerId: territoryState.currentPlayerId,
          currentPlayerName: room.players[territoryState.currentPlayerId]?.name || null,
          lastTurn: territoryState.lastTurn,
          filledCount: territoryState.board.filter(Boolean).length,
          capturedCount: territoryState.board.filter((cell) => cell && cell !== 'neutral').length,
        }
      : null,
  }
}

function hasRoomAccess(room, user) {
  if (user.role === 'Guru' && room.hostId === user.id) return true
  return user.role === 'Murid' && Boolean(room.players[user.id])
}

function listRooms(response, database, user) {
  const activeRooms = database.prepare(
    'SELECT code FROM rooms WHERE finished = 0 ORDER BY created_at DESC',
  ).all()
  const progress = database.prepare(`
    SELECT COUNT(*) AS completedSessions,
      COALESCE(SUM(room_players.score), 0) AS totalPoints,
      COALESCE(MAX(room_players.score), 0) AS bestScore
    FROM room_players
    JOIN rooms ON rooms.code = room_players.room_code
    WHERE room_players.user_id = ? AND rooms.finished = 1
  `).get(user.id)
  sendJson(response, 200, {
    rooms: activeRooms.map(({ code }) => roomSummary(loadRoom(database, code), user)),
    progress,
  })
}

function listStudentHistory(response, database, user) {
  if (user.role !== 'Murid') {
    sendJson(response, 403, { error: 'Riwayat permainan hanya tersedia untuk akun murid.' })
    return
  }

  const rows = database.prepare(`
    SELECT rooms.code, rooms.created_at AS createdAt, room_players.score
    FROM rooms
    JOIN room_players ON room_players.room_code = rooms.code
    WHERE room_players.user_id = ? AND rooms.finished = 1
    ORDER BY rooms.created_at DESC
    LIMIT 20
  `).all(user.id)
  const history = rows.map((row) => {
    const room = loadRoom(database, row.code)
    const firstQuestion = room.questions[0]
    return {
      code: room.code,
      title: room.gameType === 'territory_grid' ? 'Territory Grid' : quizTitle,
      gameType: room.gameType,
      hostName: room.hostName,
      createdAt: row.createdAt,
      score: row.score,
      questionCount: room.questions.length,
      subject: firstQuestion?.subject || 'Matematika',
      chapter: firstQuestion?.chapter || 'Bab 3',
      answerReview: answerReview(database, room, user.id),
    }
  })

  const leaderboard = user.class_code
    ? database.prepare(`
        SELECT students.id, students.name,
          COALESCE(SUM(room_players.score), 0) AS totalPoints,
          COUNT(DISTINCT room_players.room_code) AS completedSessions
        FROM users AS students
        JOIN classes ON classes.class_code = students.class_code
        LEFT JOIN rooms
          ON rooms.host_user_id = classes.teacher_user_id AND rooms.finished = 1
        LEFT JOIN room_players
          ON room_players.room_code = rooms.code AND room_players.user_id = students.id
        WHERE students.role = 'Murid' AND students.class_code = ?
        GROUP BY students.id
        ORDER BY totalPoints DESC, students.name COLLATE NOCASE
        LIMIT 10
      `).all(user.class_code)
    : []

  sendJson(response, 200, { history, leaderboard })
}

async function createRoom(request, response, database, user) {
  if (user.role !== 'Guru') {
    sendJson(response, 403, { error: 'Hanya akun guru yang dapat membuat arena.' })
    return
  }

  const body = await readJson(request)
  const gameType = typeof body.gameType === 'string' ? body.gameType : 'speed_clash'
  if (!['speed_clash', 'territory_grid'].includes(gameType)) {
    sendJson(response, 400, { error: 'Pilih jenis permainan yang tersedia.' })
    return
  }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const chapter = typeof body.chapter === 'string' ? body.chapter.trim() : ''
  const requestedQuestionCount = body.questionCount === undefined
    ? null
    : Number(body.questionCount)
  if (
    (body.subject !== undefined && (typeof body.subject !== 'string' || subject.length > 80))
    || (body.chapter !== undefined && (typeof body.chapter !== 'string' || chapter.length > 120))
  ) {
    sendJson(response, 400, { error: 'Pilih mapel dan bab yang valid.' })
    return
  }
  if (
    requestedQuestionCount !== null
    && (!Number.isInteger(requestedQuestionCount) || requestedQuestionCount < 1)
  ) {
    sendJson(response, 400, { error: 'Jumlah soal minimal 1.' })
    return
  }

  let code
  do {
    code = String(randomInt(100000, 1_000_000))
  } while (database.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code))

  const approvedQuestions = database.prepare(`
    SELECT id, subject, chapter, prompt, options_json, correct_option, duration_seconds, explanation
    FROM questions
    WHERE teacher_user_id = ? AND review_status = 'Disetujui'
    ORDER BY created_at, rowid
  `).all(user.id)
  const teacherQuestions = approvedQuestions.filter((question) => (
    (!subject || question.subject === subject)
    && (!chapter || question.chapter === chapter)
  ))
  if (approvedQuestions.length && !teacherQuestions.length) {
    sendJson(response, 400, { error: 'Tidak ada soal disetujui untuk mapel dan bab yang dipilih.' })
    return
  }

  const isUsingBuiltInQuestions = approvedQuestions.length === 0
  const availableQuestions = isUsingBuiltInQuestions ? questions : teacherQuestions
  if (isUsingBuiltInQuestions && ((subject && subject !== 'Matematika') || (chapter && chapter !== 'Bab 3'))) {
    sendJson(response, 400, { error: 'Tambahkan dan setujui soal untuk mapel atau bab pilihanmu terlebih dahulu.' })
    return
  }
  if (requestedQuestionCount !== null && requestedQuestionCount > availableQuestions.length) {
    sendJson(response, 400, { error: `Jumlah soal melebihi soal yang tersedia (${availableQuestions.length}).` })
    return
  }

  const selectedQuestions = availableQuestions.slice(0, requestedQuestionCount || availableQuestions.length)
  const roomQuestions = isUsingBuiltInQuestions
    ? selectedQuestions.map((question) => ({ ...question, subject: 'Matematika', chapter: 'Bab 3' }))
    : selectedQuestions.map((question) => ({
        questionId: question.id,
        prompt: question.prompt,
        subject: question.subject,
        chapter: question.chapter,
        options: JSON.parse(question.options_json).map((option) => ({
          id: option.id,
          label: option.text,
        })),
        answer: question.correct_option,
        durationSeconds: question.duration_seconds,
        explanation: question.explanation,
      }))

  database.prepare(`
    INSERT INTO rooms (
      code, host_user_id, current_question, question_started_at, questions_json,
      game_type, territory_state_json
    )
    VALUES (?, ?, 0, ?, ?, ?, ?)
  `).run(
    code,
    user.id,
    Date.now(),
    JSON.stringify(roomQuestions),
    gameType,
    gameType === 'territory_grid' ? JSON.stringify(emptyTerritoryState()) : null,
  )

  sendJson(response, 201, { room: roomDetails(database, loadRoom(database, code), user.id) })
}

async function joinRoom(request, response, database, user) {
  if (user.role !== 'Murid') {
    sendJson(response, 403, { error: 'Hanya akun murid yang dapat bergabung ke arena.' })
    return
  }

  const body = await readJson(request)
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  let room = loadRoom(database, code)
  if (!room || room.finished) {
    sendJson(response, 404, { error: 'Kode arena tidak ditemukan atau permainan sudah selesai.' })
    return
  }

  if (!room.players[user.id]) {
    const firstPlayer = Object.keys(room.players).length === 0
    database.prepare(`
      INSERT INTO room_players (room_code, user_id, score, answer_question, joined_question)
      VALUES (?, ?, 0, -1, ?)
    `).run(room.code, user.id, room.currentQuestion)
    if (firstPlayer) {
      database.prepare('UPDATE rooms SET question_started_at = ? WHERE code = ?')
        .run(Date.now(), room.code)
    }
    if (room.gameType === 'territory_grid') {
      const state = room.territoryState
      state.turnOrder.push(user.id)
      if (!state.currentPlayerId) state.currentPlayerId = user.id
      database.prepare('UPDATE rooms SET territory_state_json = ? WHERE code = ?')
        .run(JSON.stringify(state), room.code)
    }
    room = loadRoom(database, code)
  }

  sendJson(response, 200, { room: roomDetails(database, room, user.id) })
}

async function answerQuestion(request, response, database, room, user) {
  if (user.role !== 'Murid' || room.finished || room.gameType !== 'speed_clash') {
    sendJson(response, 403, { error: 'Aksi ini hanya tersedia untuk murid saat permainan berlangsung.' })
    return
  }

  const body = await readJson(request)
  const question = room.questions[room.currentQuestion]
  const player = room.players[user.id]
  if (!question || !question.options.some((option) => option.id === body.answer)) {
    sendJson(response, 400, { error: 'Pilih jawaban yang tersedia.' })
    return
  }
  if (player.answerQuestion === room.currentQuestion) {
    sendJson(response, 409, { error: 'Jawaban untuk soal ini sudah dikirim.' })
    return
  }
  if (Date.now() - room.questionStartedAt > (question.durationSeconds || 30) * 1000) {
    sendJson(response, 409, { error: 'Waktu menjawab soal ini sudah habis.' })
    return
  }

  const nextScore = player.score + (body.answer === question.answer ? 100 : 0)
  const result = database.prepare(`
    UPDATE room_players
    SET score = ?, answer_question = ?, answer_choice = ?
    WHERE room_code = ? AND user_id = ? AND answer_question != ?
  `).run(nextScore, room.currentQuestion, body.answer, room.code, user.id, room.currentQuestion)
  if (result.changes === 0) {
    sendJson(response, 409, { error: 'Jawaban untuk soal ini sudah dikirim.' })
    return
  }

  database.prepare(`
    INSERT INTO room_answers (
      room_code, user_id, question_index, turn_index, selected_choice, is_correct, is_answered
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    room.code,
    user.id,
    room.currentQuestion,
    room.currentQuestion,
    body.answer,
    body.answer === question.answer ? 1 : 0,
  )

  sendJson(response, 200, {
    room: roomDetails(database, loadRoom(database, room.code), user.id),
  })
}

function recordMissingAnswers(database, room) {
  const insertAnswer = database.prepare(`
    INSERT INTO room_answers (
      room_code, user_id, question_index, turn_index, selected_choice, is_correct, is_answered
    ) VALUES (?, ?, ?, ?, NULL, 0, 0)
    ON CONFLICT(room_code, user_id, turn_index) DO NOTHING
  `)

  for (const player of Object.values(room.players)) {
    if (
      player.joinedQuestion <= room.currentQuestion
      && player.answerQuestion !== room.currentQuestion
    ) {
      insertAnswer.run(room.code, player.id, room.currentQuestion, room.currentQuestion)
    }
  }
}

function skipTerritoryTurn(response, database, room, user) {
  const state = room.territoryState
  const currentPlayer = state.currentPlayerId && room.players[state.currentPlayerId]
  if (!currentPlayer) {
    sendJson(response, 409, { error: 'Belum ada murid yang bergabung ke giliran ini.' })
    return
  }

  database.prepare(`
    INSERT INTO room_answers (
      room_code, user_id, question_index, turn_index, selected_choice, is_correct, is_answered
    ) VALUES (?, ?, ?, ?, NULL, 0, 0)
    ON CONFLICT(room_code, user_id, turn_index) DO NOTHING
  `).run(room.code, currentPlayer.id, room.currentQuestion, state.turnIndex)

  state.lastTurn = {
    playerId: currentPlayer.id,
    playerName: currentPlayer.name,
    cell: null,
    correct: false,
    skipped: true,
  }
  const currentOrderIndex = state.turnOrder.indexOf(state.currentPlayerId)
  state.turnIndex += 1
  state.currentPlayerId = state.turnOrder[(currentOrderIndex + 1) % state.turnOrder.length]
  const nextQuestion = (room.currentQuestion + 1) % room.questions.length
  database.prepare(`
    UPDATE rooms
    SET territory_state_json = ?, current_question = ?, question_started_at = ?
    WHERE code = ?
  `).run(JSON.stringify(state), nextQuestion, Date.now(), room.code)

  sendJson(response, 200, {
    room: roomDetails(database, loadRoom(database, room.code), user.id),
  })
}

async function claimTerritoryCell(request, response, database, room, user) {
  if (user.role !== 'Murid' || room.finished || room.gameType !== 'territory_grid') {
    sendJson(response, 403, { error: 'Aksi ini hanya tersedia untuk murid saat Territory Grid berlangsung.' })
    return
  }

  const body = await readJson(request)
  room = loadRoom(database, room.code)
  if (!room || room.finished || room.gameType !== 'territory_grid') {
    sendJson(response, 409, { error: 'Giliran ini sudah selesai. Muat ulang arena untuk melanjutkan.' })
    return
  }
  const cell = Number(body.cell)
  const turnIndex = Number(body.turnIndex)
  const state = room.territoryState
  const question = room.questions[room.currentQuestion]
  if (!Number.isInteger(turnIndex) || turnIndex !== state.turnIndex) {
    sendJson(response, 409, { error: 'Giliran sudah berubah. Pilih petak pada giliran yang sedang berlangsung.' })
    return
  }
  if (state.currentPlayerId !== user.id) {
    sendJson(response, 409, { error: 'Belum giliranmu untuk memilih petak.' })
    return
  }
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.board.length || state.board[cell] !== null) {
    sendJson(response, 400, { error: 'Pilih petak yang masih tersedia.' })
    return
  }
  if (!question || !question.options.some((option) => option.id === body.answer)) {
    sendJson(response, 400, { error: 'Pilih jawaban yang tersedia.' })
    return
  }
  if (Date.now() - room.questionStartedAt > (question.durationSeconds || 30) * 1000) {
    sendJson(response, 409, { error: 'Waktu menjawab soal ini sudah habis. Minta guru melanjutkan giliran.' })
    return
  }

  const correct = body.answer === question.answer
  const player = room.players[user.id]
  state.board[cell] = correct ? user.id : 'neutral'
  state.lastTurn = {
    playerId: user.id,
    playerName: player.name,
    cell,
    correct,
    skipped: false,
  }
  database.prepare(`
    INSERT INTO room_answers (
      room_code, user_id, question_index, turn_index, selected_choice, is_correct, is_answered
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(room.code, user.id, room.currentQuestion, state.turnIndex, body.answer, correct ? 1 : 0)
  if (correct) {
    database.prepare('UPDATE room_players SET score = score + 100 WHERE room_code = ? AND user_id = ?')
      .run(room.code, user.id)
  }

  const boardIsFull = state.board.every(Boolean)
  if (boardIsFull) {
    database.prepare('UPDATE rooms SET territory_state_json = ?, finished = 1 WHERE code = ?')
      .run(JSON.stringify(state), room.code)
  } else {
    const currentOrderIndex = state.turnOrder.indexOf(state.currentPlayerId)
    state.turnIndex += 1
    state.currentPlayerId = state.turnOrder[(currentOrderIndex + 1) % state.turnOrder.length]
    const nextQuestion = (room.currentQuestion + 1) % room.questions.length
    database.prepare(`
      UPDATE rooms
      SET territory_state_json = ?, current_question = ?, question_started_at = ?
      WHERE code = ?
    `).run(JSON.stringify(state), nextQuestion, Date.now(), room.code)
  }

  sendJson(response, 200, {
    room: roomDetails(database, loadRoom(database, room.code), user.id),
  })
}

function advanceQuestion(response, database, room, user) {
  if (user.role !== 'Guru' || room.hostId !== user.id) {
    sendJson(response, 403, { error: 'Hanya guru pembuat arena yang dapat mengganti soal.' })
    return
  }
  if (room.finished) {
    sendJson(response, 409, { error: 'Permainan ini sudah selesai.' })
    return
  }

  if (room.gameType === 'territory_grid') {
    skipTerritoryTurn(response, database, room, user)
    return
  }

  recordMissingAnswers(database, room)
  if (room.currentQuestion + 1 >= room.questions.length) {
    database.prepare('UPDATE rooms SET finished = 1 WHERE code = ?').run(room.code)
  } else {
    database.prepare(`
      UPDATE rooms
      SET current_question = current_question + 1, question_started_at = ?
      WHERE code = ?
    `).run(Date.now(), room.code)
  }

  sendJson(response, 200, {
    room: roomDetails(database, loadRoom(database, room.code), user.id),
  })
}

export async function handleRoomRoute(request, response, pathname, database) {
  if (!pathname.startsWith('/api/rooms')) return false

  const user = getAuthenticatedUser(request, database)
  if (!user) {
    sendJson(response, 401, { error: 'Silakan masuk untuk melanjutkan.' })
    return true
  }

  if (request.method === 'GET' && pathname === '/api/rooms') {
    listRooms(response, database, user)
    return true
  }

  if (request.method === 'GET' && pathname === '/api/rooms/history') {
    listStudentHistory(response, database, user)
    return true
  }

  if (request.method === 'POST' && pathname === '/api/rooms') {
    await createRoom(request, response, database, user)
    return true
  }

  if (request.method === 'POST' && pathname === '/api/rooms/join') {
    await joinRoom(request, response, database, user)
    return true
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/(\d{6})(?:\/(answer|next|claim))?$/)
  if (!roomMatch) {
    sendJson(response, 404, { error: 'Endpoint arena tidak ditemukan.' })
    return true
  }

  const [, code, action] = roomMatch
  const room = loadRoom(database, code)
  if (!room) {
    sendJson(response, 404, { error: 'Arena tidak ditemukan.' })
    return true
  }
  if (!hasRoomAccess(room, user)) {
    sendJson(response, 403, { error: 'Kamu tidak tergabung di arena ini.' })
    return true
  }

  if (request.method === 'GET' && !action) {
    sendJson(response, 200, { room: roomDetails(database, room, user.id) })
    return true
  }

  if (request.method === 'POST' && action === 'answer') {
    await answerQuestion(request, response, database, room, user)
    return true
  }

  if (request.method === 'POST' && action === 'claim') {
    await claimTerritoryCell(request, response, database, room, user)
    return true
  }

  if (request.method === 'POST' && action === 'next') {
    advanceQuestion(response, database, room, user)
    return true
  }

  sendJson(response, 404, { error: 'Endpoint arena tidak ditemukan.' })
  return true
}
