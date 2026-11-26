import { createServer } from 'node:http'
import process from 'node:process'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { initializeDatabase } from './database.js'
import { handleAuthRoute } from './routes/auth.js'
import { handleRoomRoute } from './routes/rooms.js'
import { handleTeacherRoute } from './routes/teacher.js'
import { sendJson } from './lib/http.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontendDir = path.join(rootDir, 'frontend')
const dataDir = path.resolve(process.env.RUANGKELAS_DATA_DIR || path.join(rootDir, 'backend', 'data'))
const isProduction = process.argv.includes('--production')
const port = Number(process.env.PORT) || 5173
const host = process.env.HOST || '127.0.0.1'

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

async function serveProductionFile(response, pathname) {
  const distDir = path.join(frontendDir, 'dist')
  const requestedPath = decodeURIComponent(pathname)
  const candidate = path.resolve(distDir, `.${requestedPath}`)
  const filePath = candidate.startsWith(`${distDir}${path.sep}`)
    ? candidate
    : path.join(distDir, 'index.html')

  let resolvedPath = filePath
  try {
    const fileInfo = await stat(resolvedPath)
    if (!fileInfo.isFile()) resolvedPath = path.join(distDir, 'index.html')
  } catch {
    resolvedPath = path.join(distDir, 'index.html')
  }

  const contents = await readFile(resolvedPath)
  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(resolvedPath)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(contents)
}

async function startServer() {
  const database = await initializeDatabase(dataDir)
  const vite = isProduction
    ? null
    : await createViteServer({
        configFile: path.join(frontendDir, 'vite.config.js'),
        root: frontendDir,
        server: { middlewareMode: true },
      })

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
      const { pathname } = url

      if (await handleAuthRoute(request, response, pathname, database, isProduction)) return
      if (await handleTeacherRoute(request, response, pathname, database)) return
      if (await handleRoomRoute(request, response, pathname, database)) return
      if (pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'Endpoint tidak ditemukan.' })
        return
      }

      if (vite) {
        vite.middlewares(request, response)
        return
      }

      await serveProductionFile(response, pathname)
    } catch (error) {
      console.error('Request failed:', error)
      if (!response.headersSent) {
        sendJson(response, error.status || 500, {
          error: error.status ? error.message : 'Terjadi kesalahan pada server.',
        })
      } else {
        response.destroy(error)
      }
    }
  })

  server.listen(port, host, () => {
    console.log(`GameEdu ${isProduction ? 'server' : 'dev server'} running at http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error('Server failed to start:', error)
  process.exitCode = 1
})
