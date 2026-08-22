/**
 * Payload validation for each POST route.
 *
 * Source of truth: docs/api-contract.md Sections 4.2-4.4
 */

import { findMenuItem } from '../config/menuCatalog.js'

export interface ValidationError {
  readonly field: string
  readonly message: string
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: ValidationError[] }

export interface SanitizedRoomServiceItem {
  readonly itemId: string
  readonly name: string
  readonly quantity: number
  readonly unitPrice: number
}

export type RoomServiceValidationResult =
  | { readonly ok: true; readonly items: SanitizedRoomServiceItem[] }
  | { readonly ok: false; readonly errors: ValidationError[] }

function addError(errors: ValidationError[], field: string, message: string): void {
  errors.push({ field, message })
}

/** True when value is a non-empty string that is not only whitespace. */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

/** True when value is an ISO-8601 UTC timestamp that is strictly in the future. */
function isValidFutureIsoUtc(value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false

  // Require an explicit UTC designator so the value is unambiguous.
  if (!value.endsWith('Z') && !value.endsWith('+00:00')) return false

  return parsed.getTime() > Date.now()
}

export function validateConciergePayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] }
  }

  const p = payload as Record<string, unknown>
  const errors: ValidationError[] = []

  if (!isNonEmptyString(p.guestId)) {
    addError(errors, 'guestId', 'Required string')
  }
  if (!isNonEmptyString(p.sessionId)) {
    addError(errors, 'sessionId', 'Required string')
  }
  if (
    typeof p.roomNumber !== 'number' ||
    !Number.isInteger(p.roomNumber) ||
    p.roomNumber < 1 ||
    p.roomNumber > 9999
  ) {
    addError(errors, 'roomNumber', 'Required integer between 1 and 9999')
  }
  if (!isNonEmptyString(p.request)) {
    addError(errors, 'request', 'Required string')
  }
  if (typeof p.request === 'string' && p.request.trim().length > 2000) {
    addError(errors, 'request', 'Max 2000 characters')
  }
  if (p.mode !== 'AI_CONCIERGE') {
    addError(errors, 'mode', 'Must be "AI_CONCIERGE"')
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

export function validateRoomServicePayload(payload: unknown): RoomServiceValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] }
  }

  const p = payload as Record<string, unknown>
  const errors: ValidationError[] = []

  if (!isNonEmptyString(p.guestId)) {
    addError(errors, 'guestId', 'Required string')
  }
  if (!isNonEmptyString(p.sessionId)) {
    addError(errors, 'sessionId', 'Required string')
  }
  if (
    typeof p.roomNumber !== 'number' ||
    !Number.isInteger(p.roomNumber) ||
    p.roomNumber < 1 ||
    p.roomNumber > 9999
  ) {
    addError(errors, 'roomNumber', 'Required integer between 1 and 9999')
  }
  if (!Array.isArray(p.items) || p.items.length === 0 || p.items.length > 50) {
    addError(errors, 'items', 'Required array of 1..50 items')
  }
  if (typeof p.notes === 'string' && p.notes.trim().length > 500) {
    addError(errors, 'notes', 'Max 500 characters')
  }
  if (p.mode !== 'QR_ROOM_SERVICE') {
    addError(errors, 'mode', 'Must be "QR_ROOM_SERVICE"')
  }

  const items: SanitizedRoomServiceItem[] = []
  if (Array.isArray(p.items)) {
    for (let i = 0; i < p.items.length; i++) {
      const item = p.items[i]
      if (!item || typeof item !== 'object') {
        addError(errors, `items[${i}]`, 'Item must be an object')
        continue
      }
      const candidate = item as Record<string, unknown>

      const catalog = findMenuItem(candidate.itemId)
      if (!catalog) {
        addError(errors, `items[${i}].itemId`, 'Unknown menu item')
        continue
      }
      if (!isNonEmptyString(candidate.name)) {
        addError(errors, `items[${i}].name`, 'Required non-empty string')
      }
      if (
        typeof candidate.quantity !== 'number' ||
        !Number.isInteger(candidate.quantity) ||
        candidate.quantity < 1 ||
        candidate.quantity > 99
      ) {
        addError(errors, `items[${i}].quantity`, 'Integer between 1 and 99')
      }
      if (
        typeof candidate.unitPrice !== 'number' ||
        !Number.isInteger(candidate.unitPrice) ||
        candidate.unitPrice <= 0
      ) {
        addError(errors, `items[${i}].unitPrice`, 'Required positive integer')
      }

      if (errors.some((e) => e.field.startsWith('items[') && e.field.includes(`[${i}]`))) {
        continue
      }

      items.push({
        itemId: catalog.itemId,
        name: catalog.name,
        quantity: candidate.quantity as number,
        unitPrice: catalog.unitPrice,
      })
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, items }
}

export function validateLateCheckoutPayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] }
  }

  const p = payload as Record<string, unknown>
  const errors: ValidationError[] = []

  if (!isNonEmptyString(p.guestId)) {
    addError(errors, 'guestId', 'Required string')
  }
  if (!isNonEmptyString(p.sessionId)) {
    addError(errors, 'sessionId', 'Required string')
  }
  if (
    typeof p.roomNumber !== 'number' ||
    !Number.isInteger(p.roomNumber) ||
    p.roomNumber < 1 ||
    p.roomNumber > 9999
  ) {
    addError(errors, 'roomNumber', 'Required integer between 1 and 9999')
  }
  if (!isValidFutureIsoUtc(p.requestedTime)) {
    addError(errors, 'requestedTime', 'Required valid future ISO-8601 UTC string')
  }
  if (p.mode !== 'LATE_CHECKOUT') {
    addError(errors, 'mode', 'Must be "LATE_CHECKOUT"')
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
