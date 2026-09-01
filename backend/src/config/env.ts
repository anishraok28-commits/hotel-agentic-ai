/**
 * Backend environment configuration.
 *
 * Reads Make.com webhook URLs from process.env.
 * Validates all required variables exist at startup.
 * No secrets are ever logged or exposed to the Frontend.
 *
 * Source of truth: docs/api-contract.md Section 6.2
 */

export interface EnvConfig {
  readonly port: number
  readonly nodeEnv: 'local' | 'staging' | 'production'
  readonly serviceToken: string
  readonly rateLimitWindowSeconds: number
  readonly rateLimitMax: number
  readonly allowedOrigins: readonly string[]
  readonly makeBookingWebhookUrl: string
  readonly makeRoomServiceWebhookUrl: string
  readonly makeLateCheckoutWebhookUrl: string
  readonly qrTokenSecret: string
  readonly sessionTtlHours: number
  readonly dbPath: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        'Set this in your .env file or environment. ' +
        'See docs/api-contract.md Section 6.2 for details.',
    )
  }
  return value
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

function optionalIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173']

function allowedOriginsEnv(): readonly string[] {
  const raw = process.env.ALLOWED_ORIGINS
  if (raw === undefined || raw === '') return DEFAULT_ALLOWED_ORIGINS
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

export function loadEnv(): EnvConfig {
  const nodeEnvRaw = optionalEnv('ENV', 'local')
  const nodeEnv: EnvConfig['nodeEnv'] =
    nodeEnvRaw === 'staging' || nodeEnvRaw === 'production' ? nodeEnvRaw : 'local'

  return {
    port: Number(optionalEnv('PORT', '3000')),
    nodeEnv,
    serviceToken: requireEnv('SERVICE_TOKEN'),
    rateLimitWindowSeconds: optionalIntEnv('RATE_LIMIT_WINDOW', 60),
    rateLimitMax: optionalIntEnv('RATE_LIMIT_MAX', 30),
    allowedOrigins: allowedOriginsEnv(),
    makeBookingWebhookUrl: requireEnv('MAKE_BOOKING_WEBHOOK_URL'),
    makeRoomServiceWebhookUrl: requireEnv('MAKE_ROOM_SERVICE_WEBHOOK_URL'),
    makeLateCheckoutWebhookUrl: requireEnv('MAKE_LATE_CHECKOUT_WEBHOOK_URL'),
    qrTokenSecret: optionalEnv('QR_TOKEN_SECRET', 'dev-qr-secret-do-not-use-in-production'),
    sessionTtlHours: optionalIntEnv('SESSION_TTL_HOURS', 24),
    dbPath: optionalEnv('DB_PATH', ':memory:'),
  }
}
