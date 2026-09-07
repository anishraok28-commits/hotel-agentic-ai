/**
 * Owner dashboard API calls.
 *
 * Fetches read-only metrics for the owner dashboard.
 * Backend enforces MANAGER/OWNER role requirements.
 */

import { appConfig } from '@/config/appConfig'

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
  if (appConfig.env === 'local' && !appConfig.serviceToken) {
    // Mock mode: return placeholder data
    return {
      roomServiceRevenue: 0,
      activeOrders: { NEW: 0, PREPARING: 0, READY: 0 },
      roomUtilization: { activeSessions: 0, activeRooms: 0 },
    }
  }

  const url = `${appConfig.apiBaseUrl}/api/admin/dashboard`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (appConfig.serviceToken) {
    headers['Authorization'] = `Bearer ${appConfig.serviceToken}`
  }

  const response = await fetch(url, { method: 'GET', headers })
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
