import { randomUUID } from 'crypto'

const TTL_MS = 30 * 60 * 1000 // 30 minutes

export type SchoolSystemType = 'HAC' | 'PowerSchool'

export interface StoredSession {
  sessionData: string // Serialized cookie jar JSON
  systemType: SchoolSystemType
  baseUrl: string
  userId: number
  createdAt: number
  expiresAt: number
}

const store = new Map<string, StoredSession>()

// Purge expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store.entries()) {
    if (val.expiresAt < now) store.delete(key)
  }
}, 5 * 60 * 1000).unref()

export function saveSession(
  userId: number,
  systemType: SchoolSystemType,
  baseUrl: string,
  sessionData: string
): string {
  // One active session per user — overwrite any existing one
  for (const [key, val] of store.entries()) {
    if (val.userId === userId) store.delete(key)
  }
  const token = randomUUID()
  store.set(token, {
    sessionData,
    systemType,
    baseUrl,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  })
  return token
}

export function getSessionByToken(token: string): StoredSession | null {
  const s = store.get(token)
  if (!s) return null
  if (s.expiresAt < Date.now()) {
    store.delete(token)
    return null
  }
  return s
}

export function getSessionByUserId(userId: number): { token: string; session: StoredSession } | null {
  for (const [token, s] of store.entries()) {
    if (s.userId === userId) {
      if (s.expiresAt < Date.now()) {
        store.delete(token)
        return null
      }
      return { token, session: s }
    }
  }
  return null
}

export function deleteSessionByUserId(userId: number): void {
  for (const [key, val] of store.entries()) {
    if (val.userId === userId) store.delete(key)
  }
}
