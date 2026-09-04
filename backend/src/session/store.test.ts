import { describe, it, expect, beforeEach } from 'vitest'
import { closeDatabase, getDatabase } from '../db/database.js'
import { checkIn, getSession, checkOut, verifySession, clearSessions } from './store.js'

describe('session store', () => {
  beforeEach(() => {
    closeDatabase()
    getDatabase(':memory:')
    clearSessions()
  })

  it('creates a session on check-in and retrieves it', () => {
    const session = checkIn(304, 'guest-1', 'session-1', 24 * 60 * 60 * 1000)
    expect(session.roomId).toBe(304)
    expect(session.guestId).toBe('guest-1')
    expect(session.sessionId).toBe('session-1')
    expect(session.expiresAt).toBeGreaterThan(Date.now())

    const retrieved = getSession(304)
    expect(retrieved).toBeDefined()
    expect(retrieved?.guestId).toBe('guest-1')
  })

  it('returns undefined for a room with no session', () => {
    expect(getSession(999)).toBeUndefined()
  })

  it('returns undefined for an expired session', () => {
    checkIn(304, 'guest-1', 'session-1', -1000)
    expect(getSession(304)).toBeUndefined()
  })

  it('replaces an existing session on re-check-in', () => {
    checkIn(304, 'guest-1', 'session-1', 24 * 60 * 60 * 1000)
    checkIn(304, 'guest-2', 'session-2', 24 * 60 * 60 * 1000)

    const session = getSession(304)
    expect(session?.guestId).toBe('guest-2')
  })

  it('checkOut removes the session', () => {
    checkIn(304, 'guest-1', 'session-1', 24 * 60 * 60 * 1000)
    expect(checkOut(304)).toBe(true)
    expect(getSession(304)).toBeUndefined()
  })

  it('checkOut returns false for a room with no session', () => {
    expect(checkOut(999)).toBe(false)
  })

  it('verifySession returns the session when all fields match', () => {
    checkIn(304, 'guest-1', 'session-1', 24 * 60 * 60 * 1000)
    const result = verifySession(304, 'guest-1', 'session-1')
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(304)
  })

  it('verifySession returns undefined when guestId does not match', () => {
    checkIn(304, 'guest-1', 'session-1', 24 * 60 * 60 * 1000)
    expect(verifySession(304, 'wrong-guest', 'session-1')).toBeUndefined()
  })

  it('verifySession returns undefined when sessionId does not match', () => {
    checkIn(304, 'guest-1', 'session-1', 24 * 60 * 60 * 1000)
    expect(verifySession(304, 'guest-1', 'wrong-session')).toBeUndefined()
  })

  it('verifySession returns undefined when room has no session', () => {
    expect(verifySession(304, 'guest-1', 'session-1')).toBeUndefined()
  })

  it('verifySession returns undefined when session is expired', () => {
    checkIn(304, 'guest-1', 'session-1', -1000)
    expect(verifySession(304, 'guest-1', 'session-1')).toBeUndefined()
  })
})
