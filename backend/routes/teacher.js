import { randomBytes, randomInt } from 'node:crypto'
import { getAuthenticatedUser } from '../lib/session.js'
import { readJson, sendJson } from '../lib/http.js'

const optionIds = ['A', 'B', 'C', 'D']
const bloomLevels = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6'])
const difficulties = new Set(['Mudah', 'Sedang', 'Sulit'])

function readQuestion(body) {
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const chapter = typeof body.chapter === 'string' ? body.chapter.trim() : ''
  const questionType = typeof body.questionType === 'string' ? body.questionType : ''
  const bloomLevel = typeof body.bloomLevel === 'string' ? body.bloomLevel : ''
  const difficulty = typeof body.difficulty === 'string' ? body.difficulty : ''
  const durationSeconds = Number(body.durationSeconds)
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const explanation = typeof body.explanation === 'string' ? body.explanation.trim() : ''
  const correctOption = typeof body.correctOption === 'string' ? body.correctOption : ''
  const options = Array.isArray(body.options)
    ? body.options.map((option, index) => ({
        id: optionIds[index],
        text: typeof option?.text === 'string' ? option.text.trim() : '',
      }))
    : []

  if (!subject || subject.length > 80 || !chapter || chapter.length > 120) {
    return { error: 'Mata pelajaran dan bab wajib diisi.' }
  }
  if (questionType !== 'Pilihan ganda') {
    return { error: 'Jenis soal yang didukung saat ini adalah pilihan ganda.' }
  }
  if (!bloomLevels.has(bloomLevel) || !difficulties.has(difficulty)) {
    return { error: 'Pilih level kognitif dan tingkat kesulitan yang tersedia.' }
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 120) {
    return { error: 'Waktu menjawab harus antara 10 sampai 120 detik.' }
  }
  if (!prompt || prompt.length > 2000) {
    return { error: 'Pertanyaan wajib diisi dan maksimal 2.000 karakter.' }
  }
  if (options.length !== optionIds.length || options.some((option) => !option.text || option.text.length > 240)) {
    return { error: 'Isi keempat pilihan jawaban (maksimal 240 karakter per pilihan).' }
  }
  if (!optionIds.includes(correctOption)) {
    return { error: 'Pilih jawaban yang benar.' }
  }
  if (explanation.length > 1000) {
    return { error: 'Pembahasan maksimal 1.000 karakter.' }
  }

  return {
    question: {
      subject,
      chapter,
      questionType,
      bloomLevel,
      difficulty,
      durationSeconds,
      prompt,
      options,
      correctOption,
      explanation,
    },
  }
}

function questionFromRow(row) {
  return {
    id: row.id,
    subject: row.subject,
    chapter: row.chapter,
    questionType: row.question_type,
    bloomLevel: row.bloom_level,
    difficulty: row.difficulty,
    durationSeconds: row.duration_seconds,
    prompt: row.prompt,
    options: JSON.parse(row.options_json),
    correctOption: row.correct_option,
    explanation: row.explanation,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
  }
}

function listQuestions(response, database, user) {
  const rows = database.prepare(`
    SELECT * FROM questions
    WHERE teacher_user_id = ?
    ORDER BY created_at DESC, rowid DESC
  `).all(user.id)
  const questions = rows.map(questionFromRow)

  sendJson(response, 200, {
    questions,
    summary: {
      total: questions.length,
      reviewed: questions.filter((question) => question.reviewStatus === 'Disetujui').length,
      hots: questions.filter((question) => ['C4', 'C5', 'C6'].includes(question.bloomLevel)).length,
    },
  })
}

function saveQuestion(database, user, question, id = randomBytes(16).toString('hex')) {
  database.prepare(`
    INSERT INTO questions (
      id, teacher_user_id, subject, chapter, question_type, bloom_level, difficulty,
      duration_seconds, prompt, options_json, correct_option, explanation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject,
      chapter = excluded.chapter,
      question_type = excluded.question_type,
      bloom_level = excluded.bloom_level,
      difficulty = excluded.difficulty,
      duration_seconds = excluded.duration_seconds,
      prompt = excluded.prompt,
      options_json = excluded.options_json,
      correct_option = excluded.correct_option,
      explanation = excluded.explanation
    WHERE questions.teacher_user_id = excluded.teacher_user_id
  `).run(
    id,
    user.id,
    question.subject,
    question.chapter,
    question.questionType,
    question.bloomLevel,
    question.difficulty,
    question.durationSeconds,
    question.prompt,
    JSON.stringify(question.options),
    question.correctOption,
    question.explanation,
  )
}

function listClasses(response, database, user) {
  const classes = database.prepare(`
    SELECT classes.id, classes.name, classes.class_code AS classCode, classes.created_at AS createdAt,
      COUNT(users.id) AS studentCount
    FROM classes
    LEFT JOIN users ON users.class_code = classes.class_code AND users.role = 'Murid'
    WHERE classes.teacher_user_id = ?
    GROUP BY classes.id
    ORDER BY classes.created_at DESC
  `).all(user.id).map((classRow) => ({
    ...classRow,
    students: database.prepare(`
      SELECT id, name, email FROM users
      WHERE role = 'Murid' AND class_code = ?
      ORDER BY name COLLATE NOCASE
    `).all(classRow.classCode),
  }))

  sendJson(response, 200, { classes })
}

async function createClass(request, response, database, user) {
  const body = await readJson(request)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 2 || name.length > 80) {
    sendJson(response, 400, { error: 'Nama kelas harus terdiri dari 2 sampai 80 karakter.' })
    return
  }

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ234567'
  let classCode
  do {
    classCode = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
  } while (database.prepare('SELECT 1 FROM classes WHERE class_code = ?').get(classCode))

  const id = randomBytes(16).toString('hex')
  database.prepare(`
    INSERT INTO classes (id, teacher_user_id, name, class_code)
    VALUES (?, ?, ?, ?)
  `).run(id, user.id, name, classCode)

  sendJson(response, 201, {
    class: { id, name, classCode, studentCount: 0, students: [] },
  })
}

function listReports(response, database, user) {
  const completedRooms = database.prepare(`
    SELECT rooms.code, rooms.game_type AS gameType, rooms.created_at AS createdAt,
      COUNT(room_players.user_id) AS studentCount,
      COALESCE(MAX(room_players.score), 0) AS highestScore
    FROM rooms
    LEFT JOIN room_players ON room_players.room_code = rooms.code
    WHERE rooms.host_user_id = ? AND rooms.finished = 1
    GROUP BY rooms.code
    ORDER BY rooms.created_at DESC
    LIMIT 20
  `).all(user.id)
  const summary = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM rooms WHERE host_user_id = ? AND finished = 1) AS completedSessions,
      (SELECT COUNT(*) FROM rooms WHERE host_user_id = ? AND finished = 0) AS activeSessions,
      (SELECT COUNT(*) FROM room_players
        JOIN rooms ON rooms.code = room_players.room_code
        WHERE rooms.host_user_id = ? AND rooms.finished = 1) AS studentsPlayed
  `).get(user.id, user.id, user.id)
  const classPerformance = database.prepare(`
    SELECT classes.id, classes.name, classes.class_code AS classCode,
      COUNT(DISTINCT students.id) AS studentCount,
      COUNT(DISTINCT CASE WHEN room_players.user_id IS NOT NULL THEN students.id END) AS studentsPlayed,
      COUNT(room_players.room_code) AS participations,
      COALESCE(ROUND(AVG(room_players.score)), 0) AS averageScore,
      COALESCE(MAX(room_players.score), 0) AS highestScore
    FROM classes
    LEFT JOIN users AS students
      ON students.class_code = classes.class_code AND students.role = 'Murid'
    LEFT JOIN rooms
      ON rooms.host_user_id = classes.teacher_user_id AND rooms.finished = 1
    LEFT JOIN room_players
      ON room_players.room_code = rooms.code AND room_players.user_id = students.id
    WHERE classes.teacher_user_id = ?
    GROUP BY classes.id
    ORDER BY classes.name COLLATE NOCASE
  `).all(user.id)
  const studentPerformance = database.prepare(`
    SELECT classes.id AS classId, classes.name AS className,
      students.id AS studentId, students.name AS studentName,
      COUNT(room_players.room_code) AS completedSessions,
      COALESCE(SUM(room_players.score), 0) AS totalPoints,
      COALESCE(MAX(room_players.score), 0) AS bestScore
    FROM classes
    JOIN users AS students
      ON students.class_code = classes.class_code AND students.role = 'Murid'
    LEFT JOIN rooms
      ON rooms.host_user_id = classes.teacher_user_id AND rooms.finished = 1
    LEFT JOIN room_players
      ON room_players.room_code = rooms.code AND room_players.user_id = students.id
    WHERE classes.teacher_user_id = ?
    GROUP BY classes.id, students.id
    ORDER BY totalPoints DESC, students.name COLLATE NOCASE
    LIMIT 50
  `).all(user.id)

  const questionRows = database.prepare(`
    SELECT rooms.code, rooms.questions_json,
      room_answers.question_index AS questionIndex,
      COUNT(*) AS attempts,
      SUM(room_answers.is_correct) AS correctCount,
      SUM(CASE WHEN room_answers.is_answered = 0 THEN 1 ELSE 0 END) AS skippedCount
    FROM rooms
    JOIN room_answers ON room_answers.room_code = rooms.code
    WHERE rooms.host_user_id = ?
    GROUP BY rooms.code, room_answers.question_index
  `).all(user.id)
  const questionStats = new Map()
  for (const row of questionRows) {
    const question = JSON.parse(row.questions_json || '[]')[row.questionIndex]
    if (!question) continue
    const key = question.questionId
      || `${question.subject || ''}\u0000${question.chapter || ''}\u0000${question.prompt}`
    const stats = questionStats.get(key) || {
      question: question.prompt,
      subject: question.subject || 'Matematika',
      chapter: question.chapter || 'Bab 3',
      attempts: 0,
      correctCount: 0,
      skippedCount: 0,
    }
    stats.attempts += row.attempts
    stats.correctCount += row.correctCount
    stats.skippedCount += row.skippedCount
    questionStats.set(key, stats)
  }
  const questionAnalytics = [...questionStats.values()]
    .map((stats) => {
      const answeredCount = stats.attempts - stats.skippedCount
      return {
        ...stats,
        incorrectCount: stats.attempts - stats.correctCount - stats.skippedCount,
        accuracyPercent: answeredCount
          ? Math.round((stats.correctCount / answeredCount) * 100)
          : 0,
      }
    })
    .sort((first, second) => first.accuracyPercent - second.accuracyPercent || second.attempts - first.attempts)
    .slice(0, 20)

  sendJson(response, 200, {
    summary,
    completedRooms,
    classPerformance,
    studentPerformance,
    questionAnalytics,
  })
}

export async function handleTeacherRoute(request, response, pathname, database) {
  if (!pathname.startsWith('/api/teacher/')) return false

  const user = getAuthenticatedUser(request, database)
  if (!user) {
    sendJson(response, 401, { error: 'Silakan masuk terlebih dahulu.' })
    return true
  }
  if (user.role !== 'Guru') {
    sendJson(response, 403, { error: 'Fitur ini hanya tersedia untuk akun guru.' })
    return true
  }

  if (pathname === '/api/teacher/questions' && request.method === 'GET') {
    listQuestions(response, database, user)
    return true
  }
  if (pathname === '/api/teacher/questions' && request.method === 'POST') {
    const body = await readJson(request)
    const result = readQuestion(body)
    if (result.error) {
      sendJson(response, 400, { error: result.error })
      return true
    }

    const id = randomBytes(16).toString('hex')
    saveQuestion(database, user, result.question, id)
    const row = database.prepare('SELECT * FROM questions WHERE id = ?').get(id)
    sendJson(response, 201, { question: questionFromRow(row) })
    return true
  }

  const questionMatch = pathname.match(/^\/api\/teacher\/questions\/([a-f0-9]+)$/)
  if (questionMatch && request.method === 'PUT') {
    const body = await readJson(request)
    const result = readQuestion(body)
    if (result.error) {
      sendJson(response, 400, { error: result.error })
      return true
    }
    const existing = database.prepare(
      'SELECT id FROM questions WHERE id = ? AND teacher_user_id = ?',
    ).get(questionMatch[1], user.id)
    if (!existing) {
      sendJson(response, 404, { error: 'Soal tidak ditemukan.' })
      return true
    }

    saveQuestion(database, user, result.question, existing.id)
    const row = database.prepare('SELECT * FROM questions WHERE id = ?').get(existing.id)
    sendJson(response, 200, { question: questionFromRow(row) })
    return true
  }
  if (questionMatch && request.method === 'DELETE') {
    const result = database.prepare(
      'DELETE FROM questions WHERE id = ? AND teacher_user_id = ?',
    ).run(questionMatch[1], user.id)
    if (result.changes === 0) {
      sendJson(response, 404, { error: 'Soal tidak ditemukan.' })
      return true
    }
    sendJson(response, 200, { ok: true })
    return true
  }

  if (pathname === '/api/teacher/classes' && request.method === 'GET') {
    listClasses(response, database, user)
    return true
  }
  if (pathname === '/api/teacher/classes' && request.method === 'POST') {
    await createClass(request, response, database, user)
    return true
  }
  if (pathname === '/api/teacher/reports' && request.method === 'GET') {
    listReports(response, database, user)
    return true
  }

  sendJson(response, 404, { error: 'Endpoint dashboard guru tidak ditemukan.' })
  return true
}
