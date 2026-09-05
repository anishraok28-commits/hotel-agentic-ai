import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, it, expect, beforeEach } from 'vitest'
import { handleCreateFeedback, handleListFeedback } from './handler.js'
import { clearFeedback } from '../feedback/feedbackStore.js'

interface CapturedResponse {
  status: number
  headers: Record<string, string>
  body: string
}

function makeRequest(body: unknown): IncomingMessage {
  const raw = Buffer.from(JSON.stringify(body))
  const req = new EventEmitter() as unknown as IncomingMessage
  req.destroy = () => req
  req.pause = () => req
  req.headers = { 'content-type': 'application/json' }
  queueMicrotask(() => {
    req.emit('data', raw)
    req.emit('end')
  })
  return req
}

function makeResponse(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' }
  const res = new EventEmitter() as unknown as ServerResponse
  res.writeHead = ((status: number, headers?: unknown) => {
    captured.status = status
    captured.headers = (headers as Record<string, string> | undefined) ?? {}
    return res
  }) as ServerResponse['writeHead']
  res.end = ((chunk?: unknown) => {
    captured.body = String(chunk ?? '')
    return res
  }) as ServerResponse['end']
  return { res, captured }
}

describe('Feedback handlers', () => {
  beforeEach(() => {
    clearFeedback()
  })

  describe('handleCreateFeedback', () => {
    it('creates a feedback entry with valid data', async () => {
      const { res, captured } = makeResponse()
      const req = makeRequest({
        hotelName: 'Demo Hotel',
        contactName: 'Front Desk Manager',
        whatWorked: 'QR code scanning was seamless',
        whatFrustrated: 'Nothing significant',
        whatMissing: 'Room upgrade options',
        whatWouldPayFor: 'Multi-language support',
      })

      await handleCreateFeedback(req, res)

      expect(captured.status).toBe(201)
      const body = JSON.parse(captured.body)
      expect(body.status).toBe('ok')
      expect(body.data.feedback.hotelName).toBe('Demo Hotel')
      expect(body.data.feedback.contactName).toBe('Front Desk Manager')
      expect(body.data.feedback.whatWorked).toBe('QR code scanning was seamless')
    })

    it('rejects missing hotelName', async () => {
      const { res, captured } = makeResponse()
      const req = makeRequest({ contactName: 'Manager' })

      await handleCreateFeedback(req, res)

      expect(captured.status).toBe(400)
      const body = JSON.parse(captured.body)
      expect(body.code).toBe('MISSING_FIELD')
    })

    it('rejects missing contactName', async () => {
      const { res, captured } = makeResponse()
      const req = makeRequest({ hotelName: 'Demo Hotel' })

      await handleCreateFeedback(req, res)

      expect(captured.status).toBe(400)
      const body = JSON.parse(captured.body)
      expect(body.code).toBe('MISSING_FIELD')
    })

    it('creates entry with empty optional fields', async () => {
      const { res, captured } = makeResponse()
      const req = makeRequest({ hotelName: 'Test Hotel', contactName: 'Test Contact' })

      await handleCreateFeedback(req, res)

      expect(captured.status).toBe(201)
      const body = JSON.parse(captured.body)
      expect(body.data.feedback.whatWorked).toBe('')
      expect(body.data.feedback.whatFrustrated).toBe('')
    })
  })

  describe('handleListFeedback', () => {
    it('returns empty list when no feedback', () => {
      const { res, captured } = makeResponse()
      const req = new EventEmitter() as unknown as IncomingMessage
      req.headers = {}

      handleListFeedback(req, res)

      const body = JSON.parse(captured.body)
      expect(body.status).toBe('ok')
      expect(body.data.feedback).toEqual([])
    })

    it('returns all feedback entries in reverse chronological order', async () => {
      const { res: res1 } = makeResponse()
      const req1 = makeRequest({ hotelName: 'First Hotel', contactName: 'First' })
      await handleCreateFeedback(req1, res1)

      const { res: res2 } = makeResponse()
      const req2 = makeRequest({ hotelName: 'Second Hotel', contactName: 'Second' })
      await handleCreateFeedback(req2, res2)

      const { res, captured } = makeResponse()
      const req = new EventEmitter() as unknown as IncomingMessage
      req.headers = {}

      handleListFeedback(req, res)

      const body = JSON.parse(captured.body)
      expect(body.data.feedback).toHaveLength(2)
      expect(body.data.feedback[0].hotelName).toBe('Second Hotel')
      expect(body.data.feedback[1].hotelName).toBe('First Hotel')
    })
  })
})
