/**
 * Backend entry point.
 *
 * Reads Make.com webhook URLs from environment variables.
 * Validates configuration at startup before accepting traffic.
 * The Frontend never sees webhook URLs.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { loadEnv } from './config/env.js'
import { handleConcierge, handleRoomService, handleLateCheckout } from './routes/handler.js'
import { createRealTransport } from './webhook/realTransport.js'
import { isAuthorized } from './middleware/auth.js'
import { createRateLimiter, type RateLimiter } from './middleware/rateLimit.js'
import type { EnvConfig } from './config/env.js'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Backend healthy',
    data: {
      service: 'backend',
      databaseReachable: false,
    },
  })
}

function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

function handleUnauthorized(res: ServerResponse): void {
  sendJson(res, 401, {
    status: 'error',
    requestId: crypto.randomUUID(),
    message: 'Authentication required',
    code: 'AUTH_REQUIRED',
  })
}

/**
 * Applies allowlist CORS headers when the request Origin matches
 * ALLOWED_ORIGINS. Origins not on the allowlist receive no CORS headers.
 * Never uses a wildcard and never allows credentials.
 */
function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
): boolean {
  const origin = req.headers.origin
  if (origin === undefined || !env.allowedOrigins.includes(origin)) {
    return false
  }
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '600')
  return true
}

function handleRateLimited(res: ServerResponse): void {
  sendJson(res, 429, {
    status: 'error',
    requestId: crypto.randomUUID(),
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMITED',
  })
}

/** POST routes require a valid Bearer token and fit within the rate budget. */
function authorizePost(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
  limiter: RateLimiter,
): boolean {
  if (!isAuthorized(req, env)) {
    handleUnauthorized(res)
    return false
  }
  if (!limiter.consume(clientKey(req))) {
    handleRateLimited(res)
    return false
  }
  return true
}

function route(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
  limiter: RateLimiter,
): void {
  const { method, url } = req

  const corsApplied = applyCorsHeaders(req, res, env)

  if (method === 'OPTIONS' && corsApplied) {
    res.writeHead(204).end()
    return
  }

  if (method === 'GET' && url === '/api/health') {
    handleHealth(req, res)
    return
  }

  const transport = createRealTransport(env)

  if (method === 'POST' && url === '/api/concierge') {
    if (authorizePost(req, res, env, limiter)) {
      void handleConcierge(req, res, transport)
    }
    return
  }

  if (method === 'POST' && url === '/api/room-service') {
    if (authorizePost(req, res, env, limiter)) {
      void handleRoomService(req, res, transport)
    }
    return
  }

  if (method === 'POST' && url === '/api/late-checkout') {
    if (authorizePost(req, res, env, limiter)) {
      void handleLateCheckout(req, res, transport)
    }
    return
  }

  sendJson(res, 404, {
    status: 'error',
    requestId: crypto.randomUUID(),
    message: 'Route not found',
    code: 'NOT_FOUND',
  })
}

function main(): void {
  let env: EnvConfig
  try {
    env = loadEnv()
  } catch (err) {
    console.error('Startup failed:', (err as Error).message)
    process.exit(1)
  }

  const limiter = createRateLimiter(env.rateLimitWindowSeconds, env.rateLimitMax)
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    route(req, res, env, limiter)
  })

  server.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port} (env: ${env.nodeEnv})`)
  })
}

main()
