/**
 * Build-time configuration.
 *
 * Source of truth: docs/api-contract.md - Environment Variables.
 *
 * VITE_* variables are the ONLY environment variables read by the frontend.
 * No secrets ever live here - the Backend owns all secrets.
 */

export interface AppConfig {
  /** Base URL of the Backend. Empty string means same-origin "/api" routing. */
  readonly apiBaseUrl: string
  /** Runtime environment: local | staging | production. */
  readonly env: 'local' | 'staging' | 'production'
  /** Bearer token for staff/admin API calls. Empty string when unset. */
  readonly serviceToken: string
}

function parseEnv(): AppConfig {
  const rawEnv = import.meta.env.VITE_ENV
  const env: AppConfig['env'] =
    rawEnv === 'staging' || rawEnv === 'production' ? rawEnv : 'local'

  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    env,
    serviceToken: import.meta.env.VITE_SERVICE_TOKEN ?? '',
  }
}

/**
 * True while making placeholder/mock calls instead of the real Backend.
 * Controlled by VITE_MOCK_API_ENABLED; mock mode is the default unless the
 * variable is explicitly set to "false".
 */
export const MOCK_API_ENABLED: boolean = import.meta.env.VITE_MOCK_API_ENABLED !== 'false'

export const appConfig: AppConfig = parseEnv()