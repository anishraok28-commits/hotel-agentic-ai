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
  readonly makeBookingWebhookUrl: string
  readonly makeRoomServiceWebhookUrl: string
  readonly makeLateCheckoutWebhookUrl: string
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

export function loadEnv(): EnvConfig {
  const nodeEnvRaw = optionalEnv('ENV', 'local')
  const nodeEnv: EnvConfig['nodeEnv'] =
    nodeEnvRaw === 'staging' || nodeEnvRaw === 'production' ? nodeEnvRaw : 'local'

  return {
    port: Number(optionalEnv('PORT', '3000')),
    nodeEnv,
    makeBookingWebhookUrl: requireEnv('MAKE_BOOKING_WEBHOOK_URL'),
    makeRoomServiceWebhookUrl: requireEnv('MAKE_ROOM_SERVICE_WEBHOOK_URL'),
    makeLateCheckoutWebhookUrl: requireEnv('MAKE_LATE_CHECKOUT_WEBHOOK_URL'),
  }
}
