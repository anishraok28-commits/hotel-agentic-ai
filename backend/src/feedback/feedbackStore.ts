/**
 * Internal feedback store.
 *
 * Captures hotel owner/staff feedback after pilot conversations.
 * Internal/admin-facing only — not exposed to guests.
 */

import { getDatabase } from '../db/database.js'

export interface FeedbackEntry {
  readonly id: string
  readonly hotelName: string
  readonly contactName: string
  readonly whatWorked: string
  readonly whatFrustrated: string
  readonly whatMissing: string
  readonly whatWouldPayFor: string
  readonly createdAt: number
}

export interface CreateFeedbackParams {
  readonly hotelName: string
  readonly contactName: string
  readonly whatWorked?: string
  readonly whatFrustrated?: string
  readonly whatMissing?: string
  readonly whatWouldPayFor?: string
}

export function createFeedback(params: CreateFeedbackParams): FeedbackEntry {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = Date.now()

  db.prepare(`
    INSERT INTO feedback (id, hotel_name, contact_name, what_worked, what_frustrated, what_missing, what_would_pay_for, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.hotelName,
    params.contactName,
    params.whatWorked ?? '',
    params.whatFrustrated ?? '',
    params.whatMissing ?? '',
    params.whatWouldPayFor ?? '',
    now,
  )

  return {
    id,
    hotelName: params.hotelName,
    contactName: params.contactName,
    whatWorked: params.whatWorked ?? '',
    whatFrustrated: params.whatFrustrated ?? '',
    whatMissing: params.whatMissing ?? '',
    whatWouldPayFor: params.whatWouldPayFor ?? '',
    createdAt: now,
  }
}

export function listFeedback(): FeedbackEntry[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC, rowid DESC').all() as Array<{
    id: string
    hotel_name: string
    contact_name: string
    what_worked: string
    what_frustrated: string
    what_missing: string
    what_would_pay_for: string
    created_at: number
  }>

  return rows.map((row) => ({
    id: row.id,
    hotelName: row.hotel_name,
    contactName: row.contact_name,
    whatWorked: row.what_worked,
    whatFrustrated: row.what_frustrated,
    whatMissing: row.what_missing,
    whatWouldPayFor: row.what_would_pay_for,
    createdAt: row.created_at,
  }))
}

export function clearFeedback(): void {
  const db = getDatabase()
  db.prepare('DELETE FROM feedback').run()
}
