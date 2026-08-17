/**
 * Build-time configuration.
 *
 * Source of truth: docs/api-contract.md - Environment Variables.
 *
 * VITE_* variables are the ONLY environment variables read by the frontend.
 * No secrets ever live here - the Backend owns all secrets.
 */

export interface AppConfig {
  /** Base URL of the single Backend (future connection, not used yet). */
  readonly apiBaseUrl: string
  /** Runtime environment: local | staging | production. */
  readonly env: 'local' | 'staging' | 'production'
}

function parseEnv(): AppConfig {
  const rawEnv = import.meta.env.VITE_ENV
  const env: AppConfig['env'] =
    rawEnv === 'staging' || rawEnv === 'production' ? rawEnv : 'local'

  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://api.example.com',
    env,
  }
}

/** True while making placeholder/mock calls instead of the real Backend. */
export const MOCK_API_ENABLED = true

export const appConfig: AppConfig = parseEnv()