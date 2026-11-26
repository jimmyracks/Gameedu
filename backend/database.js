import { DatabaseSync } from 'node:sqlite'
import { mkdir, readFile, rename, stat } from 'node:fs/promises'
import path from 'node:path'

async function migrateLegacyUsers(database, dataDir) {
  const legacyUsersFile = path.join(dataDir, 'users.json')

  let legacyUsers
  try {
    legacyUsers = JSON.parse(await readFile(legacyUsersFile, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  if (!Array.isArray(legacyUsers)) {
    throw new Error('Format file akun lama tidak valid.')
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    const insertLegacyUser = database.prepare(`
      INSERT OR IGNORE INTO users (
        id, name, email, role, school, class_code, password_salt, password_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const user of legacyUsers) {
      insertLegacyUser.run(
        user.id,
        user.name,
        user.email,
        user.role,
        user.school || '',
        user.classCode || '',
        user.salt,
        user.passwordHash,
        user.createdAt || new Date().toISOString(),
      )
    }

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  let backupFile = `${legacyUsersFile}.migrated`
  try {
    await stat(backupFile)
    backupFile = `${backupFile}-${Date.now()}`
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await rename(legacyUsersFile, backupFile)
}

export async function initializeDatabase(dataDir) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(path.join(dataDir, 'ruangkelas.sqlite'))
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('Murid', 'Guru')),
      school TEXT NOT NULL DEFAULT '',
      class_code TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY CHECK (length(code) = 6),
      host_user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      current_question INTEGER NOT NULL DEFAULT 0,
      question_started_at INTEGER NOT NULL,
      finished INTEGER NOT NULL DEFAULT 0 CHECK (finished IN (0, 1))
    );

    CREATE INDEX IF NOT EXISTS rooms_status_idx ON rooms(finished, created_at);

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      teacher_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      question_type TEXT NOT NULL,
      bloom_level TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_option TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      review_status TEXT NOT NULL DEFAULT 'Disetujui',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS questions_teacher_idx ON questions(teacher_user_id, created_at);

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      teacher_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      class_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes(teacher_user_id);

    CREATE TABLE IF NOT EXISTS room_players (
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      score INTEGER NOT NULL DEFAULT 0,
      answer_question INTEGER NOT NULL DEFAULT -1,
      answer_choice TEXT,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (room_code, user_id)
    );

    CREATE TABLE IF NOT EXISTS room_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      question_index INTEGER NOT NULL,
      turn_index INTEGER NOT NULL,
      selected_choice TEXT,
      is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
      is_answered INTEGER NOT NULL CHECK (is_answered IN (0, 1)),
      answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (room_code, user_id, turn_index)
    );

    CREATE INDEX IF NOT EXISTS room_answers_question_idx
      ON room_answers(room_code, question_index);
    CREATE INDEX IF NOT EXISTS room_answers_student_idx
      ON room_answers(user_id, answered_at);
  `)

  const roomColumns = database.prepare('PRAGMA table_info(rooms)').all()
  if (!roomColumns.some((column) => column.name === 'questions_json')) {
    database.exec('ALTER TABLE rooms ADD COLUMN questions_json TEXT')
  }
  if (!roomColumns.some((column) => column.name === 'game_type')) {
    database.exec("ALTER TABLE rooms ADD COLUMN game_type TEXT NOT NULL DEFAULT 'speed_clash'")
  }
  if (!roomColumns.some((column) => column.name === 'territory_state_json')) {
    database.exec('ALTER TABLE rooms ADD COLUMN territory_state_json TEXT')
  }

  const playerColumns = database.prepare('PRAGMA table_info(room_players)').all()
  if (!playerColumns.some((column) => column.name === 'joined_question')) {
    database.exec('ALTER TABLE room_players ADD COLUMN joined_question INTEGER NOT NULL DEFAULT 0')
  }

  await migrateLegacyUsers(database, dataDir)
  return database
}
