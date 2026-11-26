import { createHash, randomBytes } from 'node:crypto'
import { parseCookies } from './http.js'

export function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    school: user.school || '',
    classCode: user.class_code || '',
  }
}

function hashSessionId(sessionId) {
  return createHash('sha256').update(sessionId).digest('hex')
}

export function createSession(database, userId) {
  const sessionId = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  database.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
  ).run(hashSessionId(sessionId), userId, expiresAt)
  return sessionId
}

export function deleteSession(database, sessionId) {
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionId(sessionId))
}

export function getAuthenticatedUser(request, database) {
  const sessionId = parseCookies(request).ruangkelas_session
  if (!sessionId) return undefined

  return database.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashSessionId(sessionId), Date.now())
}

export function setSessionCookie(sessionId, isProduction) {
  const secure = isProduction ? '; Secure' : ''
  return `ruangkelas_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`
}
