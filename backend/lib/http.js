import { Buffer } from 'node:buffer'

export function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

export function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || '')
      .split(';')
      .map((cookie) => cookie.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([name, value]) => name && value !== undefined),
  )
}

export async function readJson(request) {
  const chunks = []
  let length = 0

  for await (const chunk of request) {
    length += chunk.length
    if (length > 16_384) {
      const error = new Error('Ukuran data terlalu besar.')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Format data tidak valid.')
    error.status = 400
    throw error
  }
}
