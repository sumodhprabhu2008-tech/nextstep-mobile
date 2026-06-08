import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../../middleware/auth'
import { loginHAC, getGrades as hacGrades, getTranscript as hacTranscript, getSchedule, getStudentInfo } from './hacClient'
import { loginPowerSchool, getGrades as psGrades, getTranscript as psTranscript } from './powerSchoolClient'
import { buildSessionWithCLCookie } from './classLinkHelper'
import { getSessionByUserId, deleteSessionByUserId } from './sessionStore'
import { prisma } from '../../lib/prisma'
import { normalizeHacGrades, normalizePsGrades } from './normalizeGrades'

const router = Router()

// ── Input schemas ──────────────────────────────────────────────────────────────

const hacLoginSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  username: z.string().min(1, 'username required'),
  password: z.string().min(1, 'password required'),
  clsessionCookie: z.string().optional(),
})

const psLoginSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  username: z.string().min(1, 'username required'),
  password: z.string().min(1, 'password required'),
})

// ── GPA calculator (weighted, standard 4.0 scale) ─────────────────────────────

const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0, A: 4.0, 'A-': 3.7,
  'B+': 3.3, B: 3.0, 'B-': 2.7,
  'C+': 2.3, C: 2.0, 'C-': 1.7,
  'D+': 1.3, D: 1.0, 'D-': 0.7,
  F: 0.0,
}

function letterToGPA(letter: string): number | null {
  return GRADE_POINTS[letter.trim()] ?? null
}

function computeGPA(grades: Array<{ average: string | null; grade?: string | null }>): number | null {
  const points: number[] = []
  for (const g of grades) {
    const raw = g.average ?? g.grade ?? null
    if (!raw) continue
    const letter = raw.trim().toUpperCase()
    const p = letterToGPA(letter)
    if (p !== null) { points.push(p); continue }
    // Numeric average → convert
    const num = parseFloat(raw)
    if (!isNaN(num)) {
      if (num >= 90) points.push(4.0)
      else if (num >= 80) points.push(3.0)
      else if (num >= 70) points.push(2.0)
      else if (num >= 60) points.push(1.0)
      else points.push(0.0)
    }
  }
  if (!points.length) return null
  return Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 100) / 100
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function requireSession(userId: number, res: Response): ReturnType<typeof getSessionByUserId> {
  const entry = getSessionByUserId(userId)
  if (!entry) {
    res.status(401).json({
      data: null,
      error: {
        code: 'NO_SCHOOL_SESSION',
        message: 'No active school session. Please log in to your school portal first.',
      },
    })
    return null
  }
  return entry
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/integrations/grades/hac/login
 * Connect to a Home Access Center district.
 */
router.post('/hac/login', async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = hacLoginSchema.safeParse(req.body)
  if (!parse.success) {
    res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parse.error.errors[0]?.message } })
    return
  }

  const { baseUrl, username, password, clsessionCookie } = parse.data
  const userId = req.userId!

  try {
    let resolvedBaseUrl = baseUrl
    if (clsessionCookie) {
      const cl = buildSessionWithCLCookie(clsessionCookie, baseUrl)
      resolvedBaseUrl = cl.districtUrl
    }

    const sessionToken = await loginHAC(resolvedBaseUrl, username, password, userId, clsessionCookie)

    // Persist connection metadata (not credentials) to the database
    await prisma.schoolConnection.upsert({
      where: { userId },
      update: { systemType: 'HAC', districtUrl: resolvedBaseUrl, lastSynced: new Date() },
      create: { userId, systemType: 'HAC', districtUrl: resolvedBaseUrl },
    })

    res.json({
      data: {
        sessionToken,
        systemType: 'HAC',
        districtUrl: resolvedBaseUrl,
        expiresIn: 1800, // 30 minutes in seconds
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed'
    const status = message.includes('Invalid credentials') ? 401 : message.includes('reach') ? 502 : 500
    res.status(status).json({ data: null, error: { code: 'LOGIN_FAILED', message } })
  }
})

/**
 * POST /api/integrations/grades/powerschool/login
 * Connect to a PowerSchool SIS district.
 */
router.post('/powerschool/login', async (req: AuthRequest, res: Response): Promise<void> => {
  const parse = psLoginSchema.safeParse(req.body)
  if (!parse.success) {
    res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: parse.error.errors[0]?.message } })
    return
  }

  const { baseUrl, username, password } = parse.data
  const userId = req.userId!

  try {
    const sessionToken = await loginPowerSchool(baseUrl, username, password, userId)

    await prisma.schoolConnection.upsert({
      where: { userId },
      update: { systemType: 'PowerSchool', districtUrl: baseUrl, lastSynced: new Date() },
      create: { userId, systemType: 'PowerSchool', districtUrl: baseUrl },
    })

    res.json({
      data: {
        sessionToken,
        systemType: 'PowerSchool',
        districtUrl: baseUrl,
        expiresIn: 1800,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed'
    const status = message.includes('Invalid credentials') ? 401 : message.includes('reach') ? 502 : 500
    res.status(status).json({ data: null, error: { code: 'LOGIN_FAILED', message } })
  }
})

/**
 * GET /api/integrations/grades/current
 * Returns current class grades for the logged-in user's active school session.
 */
router.get('/current', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  try {
    if (entry.session.systemType === 'HAC') {
      const rawHacGrades = await hacGrades(entry.token)
      const normalizedGrades = normalizeHacGrades(rawHacGrades)
      res.json({ data: { systemType: entry.session.systemType, grades: normalizedGrades } })
    } else {
      const rawPsGrades = await psGrades(entry.token)
      const normalizedGrades = normalizePsGrades(rawPsGrades)
      res.json({ data: { systemType: entry.session.systemType, grades: normalizedGrades } })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch grades'
    res.status(502).json({ data: null, error: { code: 'FETCH_ERROR', message } })
  }
})

/**
 * GET /api/integrations/grades/transcript
 * Returns historical transcript data.
 */
router.get('/transcript', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  try {
    let transcript: object
    if (entry.session.systemType === 'HAC') {
      transcript = await hacTranscript(entry.token)
    } else {
      transcript = await psTranscript(entry.token)
    }
    res.json({ data: { systemType: entry.session.systemType, transcript } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch transcript'
    res.status(502).json({ data: null, error: { code: 'FETCH_ERROR', message } })
  }
})

/**
 * GET /api/integrations/grades/schedule
 * Returns class schedule (HAC only).
 */
router.get('/schedule', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({ data: null, error: { code: 'UNSUPPORTED', message: 'Schedule is only available for HAC districts' } })
    return
  }

  try {
    const schedule = await getSchedule(entry.token)
    res.json({ data: { schedule } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch schedule'
    res.status(502).json({ data: null, error: { code: 'FETCH_ERROR', message } })
  }
})

/**
 * GET /api/integrations/grades/gpa
 * Computes GPA from current grades.
 */
router.get('/gpa', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  try {
    let rawGrades: Array<{ average: string | null; grade?: string | null }>
    if (entry.session.systemType === 'HAC') {
      rawGrades = await hacGrades(entry.token)
    } else {
      const ps = await psGrades(entry.token)
      rawGrades = ps.map(c => ({ average: c.grade }))
    }

    const gpa = computeGPA(rawGrades)
    res.json({
      data: {
        gpa,
        courseCount: rawGrades.length,
        systemType: entry.session.systemType,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute GPA'
    res.status(502).json({ data: null, error: { code: 'FETCH_ERROR', message } })
  }
})

/**
 * GET /api/integrations/grades/info
 * Returns student profile info from the school system (HAC only).
 */
router.get('/info', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = requireSession(req.userId!, res)
  if (!entry) return

  if (entry.session.systemType !== 'HAC') {
    res.status(400).json({ data: null, error: { code: 'UNSUPPORTED', message: 'Student info lookup is only available for HAC districts' } })
    return
  }

  try {
    const info = await getStudentInfo(entry.token)
    res.json({ data: info })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch student info'
    res.status(502).json({ data: null, error: { code: 'FETCH_ERROR', message } })
  }
})

/**
 * DELETE /api/integrations/grades/session
 * Disconnect from the school portal (clears in-memory session).
 */
router.delete('/session', (req: AuthRequest, res: Response): void => {
  deleteSessionByUserId(req.userId!)
  res.json({ data: { disconnected: true } })
})

/**
 * GET /api/integrations/grades/status
 * Returns whether there's an active school session for this user.
 */
router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = getSessionByUserId(req.userId!)
  const connection = await prisma.schoolConnection.findUnique({ where: { userId: req.userId! } })

  res.json({
    data: {
      connected: !!entry,
      systemType: entry?.session.systemType ?? connection?.systemType ?? null,
      districtUrl: entry?.session.baseUrl ?? connection?.districtUrl ?? null,
      lastSynced: connection?.lastSynced ?? null,
      sessionExpiresIn: entry
        ? Math.max(0, Math.floor((entry.session.expiresAt - Date.now()) / 1000))
        : 0,
    },
  })
})

export default router
