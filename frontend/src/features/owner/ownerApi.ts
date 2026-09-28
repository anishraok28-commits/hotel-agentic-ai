/**
 * Owner dashboard API calls.
 *
 * Fetches read-only metrics for the owner dashboard.
 * Backend enforces MANAGER/OWNER role requirements.
 */

import { appConfig, MOCK_API_ENABLED } from '@/config/appConfig'
import { authFetch } from '@/api/authFetch'

export interface DashboardMetrics {
  roomServiceRevenue: number
  activeOrders: {
    NEW: number
    PREPARING: number
    READY: number
  }
  roomUtilization: {
    activeSessions: number
    activeRooms: number
  }
}

/**
 * Fetch dashboard metrics from the backend.
 * In mock mode, returns placeholder data.
 * In real mode, GETs /api/admin/dashboard with Bearer auth.
 */
export async function fetchDashboard(): Promise<DashboardMetrics> {
  if (MOCK_API_ENABLED) {
    return {
      roomServiceRevenue: 0,
      activeOrders: { NEW: 0, PREPARING: 0, READY: 0 },
      roomUtilization: { activeSessions: 0, activeRooms: 0 },
    }
  }

  const url = `${appConfig.apiBaseUrl}/api/admin/dashboard`

  let response: Response
  try {
    response = await authFetch(url, { method: 'GET' })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Dashboard request timed out')
    }
    throw err
  }

  // 401 handled centrally (redirect). 403 -> permission error.
  if (response.status === 403) {
    throw new Error('Access denied. You lack the required role.')
  }

  if (!response.ok) {
    throw new Error('Failed to fetch dashboard metrics')
  }

  const body = (await response.json()) as {
    data?: {
      roomServiceRevenue?: number
      activeOrders?: { NEW?: number; PREPARING?: number; READY?: number }
      roomUtilization?: { activeSessions?: number; activeRooms?: number }
    }
  }

  return {
    roomServiceRevenue: body.data?.roomServiceRevenue ?? 0,
    activeOrders: {
      NEW: body.data?.activeOrders?.NEW ?? 0,
      PREPARING: body.data?.activeOrders?.PREPARING ?? 0,
      READY: body.data?.activeOrders?.READY ?? 0,
    },
    roomUtilization: {
      activeSessions: body.data?.roomUtilization?.activeSessions ?? 0,
      activeRooms: body.data?.roomUtilization?.activeRooms ?? 0,
    },
  }
}
