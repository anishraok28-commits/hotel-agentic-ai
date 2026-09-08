import { useState, useEffect, useCallback } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import QRCode from 'qrcode'
import { Link } from 'react-router-dom'
import { listRooms, createRoom, updateRoom, deleteRoom, reissueRoomQr, checkoutRoom, type RoomData } from '@/api/mockTransport'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Icon } from '@/components/icon/Icon'
import { LoadingState } from '@/components/state/LoadingState'
import { ErrorState } from '@/components/state/ErrorState'
import { EmptyState } from '@/components/state/EmptyState'

type QRState = 'Generated' | 'Not Generated' | 'Deactivated'

function getQRState(room: RoomData): QRState {
  if (!room.qrToken) return 'Not Generated'
  if (!room.active) return 'Deactivated'
  return 'Generated'
}

function QRStateBadge({ state }: { readonly state: QRState }) {
  const className = state === 'Generated'
    ? 'qr-state-badge qr-state-badge--generated'
    : state === 'Deactivated'
      ? 'qr-state-badge qr-state-badge--deactivated'
      : 'qr-state-badge qr-state-badge--not-generated'

  return <span className={className}>{state}</span>
}

interface BatchResult {
  readonly roomNumber: number
  readonly success: boolean
  readonly error?: string
}

export function StaffRoomsQRView() {
  const [rooms, setRooms] = useState<RoomData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newRoomNumber, setNewRoomNumber] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [qrImages, setQrImages] = useState<Record<number, string>>({})
  const [expandedRoom, setExpandedRoom] = useState<number | null>(null)
  const [batchStart, setBatchStart] = useState('')
  const [batchEnd, setBatchEnd] = useState('')
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchResults, setBatchResults] = useState<BatchResult[] | null>(null)
  const [reissuingRoom, setReissuingRoom] = useState<number | null>(null)
  const [checkingOutRoom, setCheckingOutRoom] = useState<number | null>(null)

  const loadRooms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listRooms()
      setRooms(result.rooms)
    } catch {
      setError('Failed to load rooms.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  useEffect(() => {
    if (expandedRoom === null) return
    const room = rooms.find((r) => r.roomNumber === expandedRoom)
    if (!room || qrImages[room.roomNumber]) return

    const frontendUrl = window.location.origin
    const qrUrl = `${frontendUrl}/?token=${encodeURIComponent(room.qrToken)}`

    void QRCode.toDataURL(qrUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).then((dataUrl) => {
      setQrImages((prev) => ({ ...prev, [room.roomNumber]: dataUrl }))
    })
  }, [expandedRoom, rooms, qrImages])

  async function handleCreateSingle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const roomNumber = Number(newRoomNumber)
    if (!Number.isInteger(roomNumber) || roomNumber < 1 || roomNumber > 9999) {
      setCreateError('Room number must be an integer between 1 and 9999.')
      return
    }

    if (rooms.some((r) => r.roomNumber === roomNumber)) {
      setCreateError(`Room ${roomNumber} already exists.`)
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      await createRoom(roomNumber)
      setNewRoomNumber('')
      await loadRooms()
    } catch {
      setCreateError('Failed to create room.')
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(roomNumber: number, currentActive: boolean) {
    try {
      if (currentActive) {
        await deleteRoom(roomNumber)
      } else {
        await updateRoom(roomNumber, true)
      }
      await loadRooms()
    } catch { /* ignore */ }
  }

  async function handleReissueQr(roomNumber: number) {
    if (!window.confirm(`Reissue QR token for Room ${roomNumber}? The old QR code will stop working.`)) {
      return
    }
    setReissuingRoom(roomNumber)
    try {
      const result = await reissueRoomQr(roomNumber)
      // Clear the cached QR image so it regenerates with the new token
      setQrImages((prev) => {
        const next = { ...prev }
        delete next[roomNumber]
        return next
      })
      // Show the expanded room with the new QR
      setExpandedRoom(roomNumber)
      // Regenerate QR image for the new token
      const frontendUrl = window.location.origin
      const qrUrl = `${frontendUrl}/?token=${encodeURIComponent(result.room.qrToken)}`
      const dataUrl = await QRCode.toDataURL(qrUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrImages((prev) => ({ ...prev, [roomNumber]: dataUrl }))
      await loadRooms()
    } catch { /* ignore */ }
    setReissuingRoom(null)
  }

  async function handleCheckout(roomNumber: number) {
    if (!window.confirm(`Check out Room ${roomNumber}? This will end the active session and stay.`)) {
      return
    }
    setCheckingOutRoom(roomNumber)
    try {
      await checkoutRoom(roomNumber)
      await loadRooms()
    } catch { /* ignore */ }
    setCheckingOutRoom(null)
  }

  async function handleBatchGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const start = Number(batchStart)
    const end = Number(batchEnd)

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 9999 || start > end) {
      setCreateError('Invalid range. Start must be ≤ end, both between 1 and 9999.')
      return
    }

    setBatchGenerating(true)
    setBatchResults(null)
    setCreateError(null)

    const results: BatchResult[] = []
    const existingRooms = rooms.map((r) => r.roomNumber)

    for (let roomNumber = start; roomNumber <= end; roomNumber++) {
      if (existingRooms.includes(roomNumber)) {
        results.push({ roomNumber, success: false, error: 'Room already exists' })
        continue
      }

      try {
        await createRoom(roomNumber)
        results.push({ roomNumber, success: true })
      } catch {
        results.push({ roomNumber, success: false, error: 'Failed to create room' })
      }
    }

    setBatchResults(results)
    setBatchGenerating(false)
    await loadRooms()
  }

  function downloadQr(roomNumber: number) {
    const dataUrl = qrImages[roomNumber]
    if (!dataUrl) return
    const link = document.createElement('a')
    link.download = `room-${roomNumber}-qr.png`
    link.href = dataUrl
    link.click()
  }

  function printQr(roomNumber: number) {
    const dataUrl = qrImages[roomNumber]
    if (!dataUrl) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <html>
        <head><title>QR Code - Room ${roomNumber}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui;">
          <h2>Room ${roomNumber}</h2>
          <img src="${dataUrl}" style="width:256px;height:256px;" />
          <p style="margin-top:1rem;color:#666;">Scan to access room services</p>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <>
      <Card title="Generate QR">
        <form onSubmit={handleCreateSingle} className="form">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <Input
              name="roomNumber"
              label="Room number"
              type="number"
              min={1}
              max={9999}
              required
              placeholder="e.g. 101"
              value={newRoomNumber}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewRoomNumber(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="submit" disabled={creating}>
              {creating ? 'Generating...' : 'Generate QR'}
            </Button>
          </div>
          {createError ? (
            <p className="muted" style={{ color: '#dc3545', marginTop: '0.5rem' }}>
              {createError}
            </p>
          ) : null}
        </form>
      </Card>

      <Card title="Batch Generate">
        <form onSubmit={handleBatchGenerate} className="form">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <Input
              name="batchStart"
              label="Start room"
              type="number"
              min={1}
              max={9999}
              required
              placeholder="e.g. 101"
              value={batchStart}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBatchStart(e.target.value)}
              style={{ flex: 1 }}
            />
            <Input
              name="batchEnd"
              label="End room"
              type="number"
              min={1}
              max={9999}
              required
              placeholder="e.g. 110"
              value={batchEnd}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBatchEnd(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="submit" disabled={batchGenerating}>
              {batchGenerating ? 'Generating...' : 'Generate Range'}
            </Button>
          </div>
        </form>

        {batchResults ? (
          <div className="batch-results" style={{ marginTop: '1rem' }}>
            <p className="muted" style={{ marginBottom: '0.5rem' }}>
              Generated {batchResults.filter((r) => r.success).length} of {batchResults.length} rooms
            </p>
            {batchResults.some((r) => !r.success) ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {batchResults.filter((r) => !r.success).map((r) => (
                  <li key={r.roomNumber} style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                    Room {r.roomNumber}: {r.error}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>

      {loading ? (
        <Card>
          <LoadingState label="Loading rooms..." />
        </Card>
      ) : null}

      {error ? (
        <Card>
          <ErrorState title="Error" message={error}>
            <div className="state__actions">
              <Button variant="secondary" onClick={loadRooms}>
                Retry
              </Button>
            </div>
          </ErrorState>
        </Card>
      ) : null}

      {!loading && !error && rooms.length === 0 ? (
        <Card>
          <EmptyState
            title="No rooms configured"
            message="Create a room above to generate its QR code."
          />
        </Card>
      ) : null}

      {!loading && !error && rooms.length > 0 ? (
        <Card title={`${rooms.length} room${rooms.length !== 1 ? 's' : ''} configured`}>
          <div className="room-list">
            {rooms.map((room) => {
              const qrState = getQRState(room)
              return (
                <div
                  key={room.roomNumber}
                  className={`room-card ${room.active ? '' : 'room-card--inactive'}`}
                >
                  <div className="room-card__header">
                    <div className="room-card__info">
                      <span className="room-card__number">Room {room.roomNumber}</span>
                      <QRStateBadge state={qrState} />
                    </div>
                    <div className="room-card__actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setExpandedRoom(
                          expandedRoom === room.roomNumber ? null : room.roomNumber,
                        )}
                      >
                        <Icon name="sparkles" size={14} />
                        <span>{expandedRoom === room.roomNumber ? 'Hide QR' : 'Show QR'}</span>
                      </Button>
                      {room.active && room.qrToken ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleReissueQr(room.roomNumber)}
                          disabled={reissuingRoom === room.roomNumber}
                        >
                          {reissuingRoom === room.roomNumber ? 'Reissuing...' : 'Reissue QR'}
                        </Button>
                      ) : null}
                      {room.active ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleCheckout(room.roomNumber)}
                          disabled={checkingOutRoom === room.roomNumber}
                        >
                          {checkingOutRoom === room.roomNumber ? 'Checking out...' : 'Checkout'}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant={room.active ? 'secondary' : 'primary'}
                        onClick={() => handleToggleActive(room.roomNumber, room.active)}
                      >
                        {room.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </div>

                  {expandedRoom === room.roomNumber ? (
                    <div className="room-card__qr">
                      {qrImages[room.roomNumber] ? (
                        <>
                          <img
                            src={qrImages[room.roomNumber]}
                            alt={`QR code for room ${room.roomNumber}`}
                            className="room-card__qr-image"
                          />
                          <p className="muted" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
                            {window.location.origin}/?token={room.qrToken}
                          </p>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => downloadQr(room.roomNumber)}
                            >
                              <Icon name="sparkles" size={14} />
                              <span>Download PNG</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => printQr(room.roomNumber)}
                            >
                              <Icon name="sparkles" size={14} />
                              <span>Print</span>
                            </Button>
                          </div>
                          <a
                            href={`${window.location.origin}/?token=${encodeURIComponent(room.qrToken)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="staff-rooms-qr__guest-link"
                          >
                            Open guest link in new tab
                          </a>
                        </>
                      ) : (
                        <p className="muted">Generating QR code...</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}

      <div className="staff-rooms-qr__back">
        <Link to="/staff/orders" className="staff-rooms-qr__back-link">
          <Icon name="chevronRight" size={14} />
          <span>Back to Orders</span>
        </Link>
      </div>
    </>
  )
}
