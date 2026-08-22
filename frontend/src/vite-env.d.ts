/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the single Backend.
   * Source of truth: docs/api-contract.md - Environment Variables.
   */
  readonly VITE_API_BASE_URL?: string
  /** Runtime environment: local | staging | production. */
  readonly VITE_ENV?: string
  /** "false" disables the in-memory mock and enables real Backend HTTP. */
  readonly VITE_MOCK_API_ENABLED?: string
  /**
   * Shared secret used to authenticate to the Backend (Bearer token).
   * Mirrors the Backend's SERVICE_TOKEN. Never shipped to guests in a
   * committed value; supply at build time via environment.
   */
  readonly VITE_SERVICE_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}