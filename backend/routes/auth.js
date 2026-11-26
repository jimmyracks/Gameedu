import { Buffer } from 'node:buffer'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { sendJson, parseCookies, readJson } from '../lib/http.js'
import {
  createSession,
  deleteSession,
  getAuthenticatedUser,
  safeUser,
  setSessionCookie,
} from '../lib/session.js'

const scrypt = promisify(scryptCallback)
const roles = new Set(['Murid', 'Guru'])

async function register(request, response, database) {
  const body = await readJson(request)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = body.role
  const school = typeof body.school === 'string' ? body.school.trim() : ''
  const classCode = typeof body.classCode === 'string' ? body.classCode.trim() : ''

  if (name.length < 2 || name.length > 80) {
    sendJson(response, 400, { error: 'Nama harus terdiri dari 2 sampai 80 karakter.' })
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    sendJson(response, 400, { error: 'Masukkan alamat email yang valid.' })
    return
  }
  if (password.length < 8 || password.length > 128) {
    sendJson(response, 400, { error: 'Kata sandi harus terdiri dari 8 sampai 128 karakter.' })
    return
  }
  if (!roles.has(role)) {
    sendJson(response, 400, { error: 'Pilih peran guru atau murid.' })
    return
  }
  if (body.termsAccepted !== true) {
    sendJson(response, 400, { error: 'Persetujuan ketentuan layanan diperlukan.' })
    return
  }
  if (role === 'Guru' && (school.length < 2 || school.length > 120)) {
    sendJson(response, 400, { error: 'Nama sekolah wajib diisi (2 sampai 120 karakter).' })
    return
  }
  if (role === 'Murid' && classCode.length > 32) {
    sendJson(response, 400, { error: 'Kode kelas maksimal 32 karakter.' })
    return
  }
  if (role === 'Murid' && classCode && !database.prepare(
    'SELECT 1 FROM classes WHERE class_code = ?',
  ).get(classCode.toUpperCase())) {
    sendJson(response, 400, { error: 'Kode kelas tidak ditemukan. Minta kode yang benar dari guru.' })
    return
  }
  if (database.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    sendJson(response, 409, { error: 'Email ini sudah terdaftar. Silakan masuk.' })
    return
  }

  const salt = randomBytes(16)
  const passwordHash = await scrypt(password, salt, 64)
  const user = {
    id: randomBytes(16).toString('hex'),
    name,
    email,
    role,
    school: role === 'Guru' ? school : '',
    class_code: role === 'Murid' ? classCode.toUpperCase() : '',
    password_salt: salt.toString('hex'),
    password_hash: passwordHash.toString('hex'),
  }

  try {
    database.prepare(`
      INSERT INTO users (id, name, email, role, school, class_code, password_salt, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.name,
      user.email,
      user.role,
      user.school,
      user.class_code,
      user.password_salt,
      user.password_hash,
    )
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed: users.email')) {
      sendJson(response, 409, { error: 'Email ini sudah terdaftar. Silakan masuk.' })
      return
    }
    throw error
  }

  sendJson(response, 201, { user: safeUser(user) })
}

async function login(request, response, database, isProduction) {
  const body = await readJson(request)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = body.role
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email)

  if (!user || !roles.has(role) || user.role !== role || password.length < 1 || password.length > 128) {
    sendJson(response, 401, { error: 'Email, kata sandi, atau jenis akun tidak sesuai.' })
    return
  }

  const candidateHash = await scrypt(password, Buffer.from(user.password_salt, 'hex'), 64)
  const storedHash = Buffer.from(user.password_hash, 'hex')
  if (candidateHash.length !== storedHash.length || !timingSafeEqual(candidateHash, storedHash)) {
    sendJson(response, 401, { error: 'Email, kata sandi, atau jenis akun tidak sesuai.' })
    return
  }

  const sessionId = createSession(database, user.id)
  sendJson(response, 200, { user: safeUser(user) }, {
    'Set-Cookie': setSessionCookie(sessionId, isProduction),
  })
}

export async function handleAuthRoute(request, response, pathname, database, isProduction) {
  if (!pathname.startsWith('/api/auth/')) return false

  if (request.method === 'POST' && pathname === '/api/auth/register') {
    await register(request, response, database)
    return true
  }

  if (request.method === 'POST' && pathname === '/api/auth/login') {
    await login(request, response, database, isProduction)
    return true
  }

  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    const sessionId = parseCookies(request).ruangkelas_session
    if (sessionId) deleteSession(database, sessionId)
    sendJson(response, 200, { ok: true }, {
      'Set-Cookie': 'ruangkelas_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    })
    return true
  }

  if (request.method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthenticatedUser(request, database)
    if (!user) {
      sendJson(response, 401, { error: 'Silakan masuk terlebih dahulu.' })
      return true
    }
    sendJson(response, 200, { user: safeUser(user) })
    return true
  }

  sendJson(response, 404, { error: 'Endpoint autentikasi tidak ditemukan.' })
  return true
}
