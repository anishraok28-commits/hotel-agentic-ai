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

function route(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
): void {
  const { method, url } = req

  if (method === 'GET' && url === '/api/health') {
    handleHealth(req, res)
    return
  }

  const transport = createRealTransport(env)

  if (method === 'POST' && url === '/api/concierge') {
    void handleConcierge(req, res, transport)
    return
  }

  if (method === 'POST' && url === '/api/room-service') {
    void handleRoomService(req, res, transport)
    return
  }

  if (method === 'POST' && url === '/api/late-checkout') {
    void handleLateCheckout(req, res, transport)
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

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    route(req, res, env)
  })

  server.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port} (env: ${env.nodeEnv})`)
  })
}

main()
