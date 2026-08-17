/**
 * Payload validation for each POST route.
 *
 * Source of truth: docs/api-contract.md Sections 4.2-4.4
 */

export interface ValidationError {
  readonly field: string
  readonly message: string
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: ValidationError[] }

function addError(errors: ValidationError[], field: string, message: string): void {
  errors.push({ field, message })
}

export function validateConciergePayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] }
  }

  const p = payload as Record<string, unknown>
  const errors: ValidationError[] = []

  if (typeof p.guestId !== 'string' || p.guestId === '') {
    addError(errors, 'guestId', 'Required string')
  }
  if (typeof p.sessionId !== 'string' || p.sessionId === '') {
    addError(errors, 'sessionId', 'Required string')
  }
  if (typeof p.roomNumber !== 'number' || !Number.isInteger(p.roomNumber) || p.roomNumber < 1) {
    addError(errors, 'roomNumber', 'Required positive integer')
  }
  if (typeof p.request !== 'string' || p.request === '') {
    addError(errors, 'request', 'Required string')
  }
  if (typeof p.request === 'string' && p.request.length > 2000) {
    addError(errors, 'request', 'Max 2000 characters')
  }
  if (p.mode !== 'AI_CONCIERGE') {
    addError(errors, 'mode', 'Must be "AI_CONCIERGE"')
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

export function validateRoomServicePayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] }
  }

  const p = payload as Record<string, unknown>
  const errors: ValidationError[] = []

  if (typeof p.guestId !== 'string' || p.guestId === '') {
    addError(errors, 'guestId', 'Required string')
  }
  if (typeof p.sessionId !== 'string' || p.sessionId === '') {
    addError(errors, 'sessionId', 'Required string')
  }
  if (typeof p.roomNumber !== 'number' || !Number.isInteger(p.roomNumber) || p.roomNumber < 1) {
    addError(errors, 'roomNumber', 'Required positive integer')
  }
  if (!Array.isArray(p.items) || p.items.length === 0 || p.items.length > 50) {
    addError(errors, 'items', 'Required array of 1..50 items')
  }
  if (typeof p.notes === 'string' && p.notes.length > 500) {
    addError(errors, 'notes', 'Max 500 characters')
  }
  if (p.mode !== 'QR_ROOM_SERVICE') {
    addError(errors, 'mode', 'Must be "QR_ROOM_SERVICE"')
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

export function validateLateCheckoutPayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] }
  }

  const p = payload as Record<string, unknown>
  const errors: ValidationError[] = []

  if (typeof p.guestId !== 'string' || p.guestId === '') {
    addError(errors, 'guestId', 'Required string')
  }
  if (typeof p.sessionId !== 'string' || p.sessionId === '') {
    addError(errors, 'sessionId', 'Required string')
  }
  if (typeof p.roomNumber !== 'number' || !Number.isInteger(p.roomNumber) || p.roomNumber < 1) {
    addError(errors, 'roomNumber', 'Required positive integer')
  }
  if (typeof p.requestedTime !== 'string' || p.requestedTime === '') {
    addError(errors, 'requestedTime', 'Required ISO 8601 UTC string')
  }
  if (p.mode !== 'LATE_CHECKOUT') {
    addError(errors, 'mode', 'Must be "LATE_CHECKOUT"')
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
