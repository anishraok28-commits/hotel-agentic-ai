/**
 * QR Management admin page.
 *
 * Allows authorized staff to:
 * - View all rooms with their QR tokens and status
 * - Create new rooms (generates unique QR token + URL)
 * - Toggle room active/inactive status
 * - Display QR codes for printing
 */

import { useState, useEffect, useCallback } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import QRCode from 'qrcode'
import { listRooms, createRoom, updateRoom, deleteRoom, type RoomData } from '@/api/mockTransport'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Icon } from '@/components/icon/Icon'
import { LoadingState } from '@/components/state/LoadingState'
import { ErrorState } from '@/components/state/ErrorState'

export function QRManagementView() {
  const [rooms, setRooms] = useState<RoomData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newRoomNumber, setNewRoomNumber] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [qrImages, setQrImages] = useState<Record<number, string>>({})
  const [expandedRoom, setExpandedRoom] = useState<number | null>(null)

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

  // Generate QR code images for expanded room
  useEffect(() => {
    if (expandedRoom === null) return
    const room = rooms.find((r) => r.roomNumber === expandedRoom)
    if (!room || qrImages[room.roomNumber]) return

    const frontendUrl = window.location.origin
    const qrUrl = `${frontendUrl}/?token=${encodeURIComponent(room.qrToken)}&room=${room.roomNumber}`

    void QRCode.toDataURL(qrUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).then((dataUrl) => {
      setQrImages((prev) => ({ ...prev, [room.roomNumber]: dataUrl }))
    })
  }, [expandedRoom, rooms, qrImages])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
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

  function downloadQr(roomNumber: number) {
    const dataUrl = qrImages[roomNumber]
    if (!dataUrl) return
    const link = document.createElement('a')
    link.download = `room-${roomNumber}-qr.png`
    link.href = dataUrl
    link.click()
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker="Staff"
        title="Room QR Management"
        subtitle="Create rooms and generate QR codes for guest access."
      />

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

      {!loading && !error ? (
        <>
          <Card title="Add a room">
            <form onSubmit={handleCreate} className="form">
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
                  {creating ? 'Creating...' : 'Create room'}
                </Button>
              </div>
              {createError ? (
                <p className="muted" style={{ color: '#dc3545', marginTop: '0.5rem' }}>
                  {createError}
                </p>
              ) : null}
            </form>
          </Card>

          <Card title={`${rooms.length} room${rooms.length !== 1 ? 's' : ''} configured`}>
            {rooms.length === 0 ? (
              <p className="muted">No rooms configured yet. Create one above.</p>
            ) : (
              <div className="room-list">
                {rooms.map((room) => (
                  <div
                    key={room.roomNumber}
                    className={`room-card ${room.active ? '' : 'room-card--inactive'}`}
                  >
                    <div className="room-card__header">
                      <div className="room-card__info">
                        <span className="room-card__number">Room {room.roomNumber}</span>
                        <span
                          className={`room-card__status ${room.active ? 'room-card__status--active' : 'room-card__status--inactive'}`}
                        >
                          {room.active ? 'Active' : 'Inactive'}
                        </span>
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
                              {window.location.origin}/?token={room.qrToken}&amp;room={room.roomNumber}
                            </p>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => downloadQr(room.roomNumber)}
                            >
                              <Icon name="sparkles" size={14} />
                              <span>Download QR</span>
                            </Button>
                          </>
                        ) : (
                          <p className="muted">Generating QR code...</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </section>
  )
}
