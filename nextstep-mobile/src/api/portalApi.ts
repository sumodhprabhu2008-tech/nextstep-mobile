/**
 * portalApi.ts
 * Mobile API client for the live school portal integration.
 * Maps to backend routes under /api/integrations/grades/
 *
 * SECURITY NOTE: This file never stores passwords. Passwords are passed
 * directly to connectHac / connectPowerSchool and discarded after the
 * single HTTP request. They are never written to AsyncStorage, state,
 * or any persistent location.
 */

import { apiFetch } from '../utils/api'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface NormalizedAssignment {
  name: string
  category: string
  score: number | null
  totalPoints: number | null
  percentage: string
  dateDue: string
}

export interface NormalizedCourse {
  id: string
  name: string
  teacher: string
  period: string
  average: number | null
  letterGrade: string | null
  assignments: NormalizedAssignment[]
}

export interface PortalStatus {
  connected: boolean
  systemType: 'HAC' | 'PowerSchool' | null
  districtUrl: string | null
  lastSynced: string | null   // ISO date string or null
  sessionExpiresIn: number    // seconds remaining, 0 if not connected
}

export interface ConnectResult {
  connected: boolean
  systemType: 'HAC' | 'PowerSchool'
}

export interface PortalGpa {
  gpa: number | null
  courseCount: number
  systemType: 'HAC' | 'PowerSchool'
}

// ── Portal connection ─────────────────────────────────────────────────────────

/**
 * Connect to a HAC (Home Access Center) school portal.
 *
 * @param baseUrl   Full URL to the district HAC portal, e.g. "https://hac.katyisd.org"
 * @param username  Student's HAC username
 * @param password  Student's HAC password — NOT stored after this call returns
 *
 * Calls: POST /api/integrations/grades/hac/login
 */
export async function connectHac(
  baseUrl: string,
  username: string,
  password: string
): Promise<ConnectResult> {
  const res = await apiFetch<{ data: { sessionToken: string; systemType: string } }>(
    '/integrations/grades/hac/login',
    {
      method: 'POST',
      body: JSON.stringify({ baseUrl, username, password }),
    }
  )
  return {
    connected: !!res.data.sessionToken,
    systemType: 'HAC',
  }
}

/**
 * Connect to a PowerSchool portal.
 *
 * @param baseUrl   Full URL to the district PowerSchool portal
 * @param username  Student's PowerSchool username
 * @param password  Student's PowerSchool password — NOT stored after this call returns
 *
 * Calls: POST /api/integrations/grades/powerschool/login
 */
export async function connectPowerSchool(
  baseUrl: string,
  username: string,
  password: string
): Promise<ConnectResult> {
  const res = await apiFetch<{ data: { sessionToken: string; systemType: string } }>(
    '/integrations/grades/powerschool/login',
    {
      method: 'POST',
      body: JSON.stringify({ baseUrl, username, password }),
    }
  )
  return {
    connected: !!res.data.sessionToken,
    systemType: 'PowerSchool',
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Check whether there is an active school portal session for this user.
 * Call this on app launch and when returning to the Grade Portal screen.
 *
 * Calls: GET /api/integrations/grades/status
 */
export async function getPortalStatus(): Promise<PortalStatus> {
  const res = await apiFetch<{ data: PortalStatus }>('/integrations/grades/status')
  return res.data
}

// ── Grade data ────────────────────────────────────────────────────────────────

/**
 * Fetch current normalized grades from the connected school portal.
 * Only call this after confirming getPortalStatus().connected === true.
 *
 * Calls: GET /api/integrations/grades/current
 * Returns: NormalizedCourse[] (same shape regardless of HAC or PowerSchool)
 */
export async function getCurrentPortalGrades(): Promise<NormalizedCourse[]> {
  const res = await apiFetch<{ data: { systemType: string; grades: NormalizedCourse[] } }>(
    '/integrations/grades/current'
  )
  return res.data.grades ?? []
}

/**
 * Fetch the computed GPA from the connected portal's current grades.
 * Only call after confirming getPortalStatus().connected === true.
 *
 * Calls: GET /api/integrations/grades/gpa
 */
export async function getPortalGpa(): Promise<PortalGpa> {
  const res = await apiFetch<{ data: PortalGpa }>('/integrations/grades/gpa')
  return res.data
}

// ── Disconnect ────────────────────────────────────────────────────────────────

/**
 * Disconnect from the school portal and clear the server-side session.
 * After calling this, getPortalStatus() will return connected: false.
 *
 * Calls: DELETE /api/integrations/grades/session
 */
export async function disconnectPortal(): Promise<{ disconnected: boolean }> {
  const res = await apiFetch<{ data: { disconnected: boolean } }>(
    '/integrations/grades/session',
    { method: 'DELETE' }
  )
  return res.data
}
