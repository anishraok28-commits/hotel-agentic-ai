/**
 * Request authentication.
 *
 * Every POST route requires `Authorization: Bearer <SERVICE_TOKEN>`.
 * Uses a constant-time comparison so token values are not revealed by
 * timing side-channels.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { EnvConfig } from '../config/env.js'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** True when the request carries a valid Bearer token matching SERVICE_TOKEN. */
export function isAuthorized(req: IncomingMessage, env: EnvConfig): boolean {
  const header = req.headers.authorization
  if (!header) return false

  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return false

  const expected = digest(env.serviceToken)
  const actual = digest(token)
  return timingSafeEqual(expected, actual)
}
