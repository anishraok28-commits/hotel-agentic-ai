/**
 * Audit trail logging.
 *
 * Records all significant actions performed by staff users.
 * Uses SQLite for persistence. Query via getAuditLog().
 */

import { getDatabase } from '../db/database.js'

export interface AuditEvent {
  readonly id: string
  readonly userId: string | null
  readonly userName: string | null
  readonly userRole: string | null
  readonly action: string
  readonly entityType: string
  readonly entityId: string | null
  readonly details: string | null
  readonly ipAddress: string | null
  readonly createdAt: number
}

/** Record an audit event. */
export function recordAuditEvent(params: {
  userId?: string
  userName?: string
  userRole?: string
  action: string
  entityType: string
  entityId?: string
  details?: string
  ipAddress?: string
}): void {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = Date.now()

  db.prepare(
    `INSERT INTO audit_log (id, user_id, user_name, user_role, action, entity_type, entity_id, details, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.userId ?? null,
    params.userName ?? null,
    params.userRole ?? null,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.details ?? null,
    params.ipAddress ?? null,
    now,
  )
}

/** Query audit log entries with optional filters. */
export function getAuditLog(options: {
  limit?: number
  offset?: number
  userId?: string
  entityType?: string
  action?: string
  since?: number
} = {}): { events: AuditEvent[]; total: number } {
  const db = getDatabase()
  const conditions: string[] = []
  const params: unknown[] = []

  if (options.userId) {
    conditions.push('user_id = ?')
    params.push(options.userId)
  }
  if (options.entityType) {
    conditions.push('entity_type = ?')
    params.push(options.entityType)
  }
  if (options.action) {
    conditions.push('action = ?')
    params.push(options.action)
  }
  if (options.since) {
    conditions.push('created_at >= ?')
    params.push(options.since)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = db.prepare(
    `SELECT COUNT(*) as count FROM audit_log ${whereClause}`,
  ).get(...params) as { count: number }

  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  const rows = db.prepare(
    `SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).all(...params, limit, offset) as Array<{
    id: string
    user_id: string | null
    user_name: string | null
    user_role: string | null
    action: string
    entity_type: string
    entity_id: string | null
    details: string | null
    ip_address: string | null
    created_at: number
  }>

  const events: AuditEvent[] = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }))

  return { events, total: countRow.count }
}
