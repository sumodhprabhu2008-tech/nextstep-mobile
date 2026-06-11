import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import authRoutes from './routes/auth'
import gradesRoutes from './routes/grades'
import assignmentsRouter from './routes/assignments'
import studentsRouter from './routes/students'
import roadmapRouter from './routes/roadmap'
import aiRouter from './routes/ai'
import socialRouter from './routes/social'
import { requireAuth } from './middleware/auth'
import gradesIntegrationRouter from './integrations/grades/gradesRouter'

const app = express()

app.use(cors({
  origin: true,
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`)
  console.log('[REQ] content-type:', req.headers['content-type'])
  console.log('[REQ] auth header exists:', Boolean(req.headers.authorization))

  if (req.method !== 'GET') {
    console.log('[REQ] body:', {
      ...req.body,
      password: req.body?.password ? '[hidden]' : undefined,
    })
  }

  next()
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/health/connectivity', async (_req, res) => {
  const testUrl = 'https://homeaccess.katyisd.org/HomeAccess/Account/LogOn'

  try {
    const result = await axios.get<string>(testUrl, {
      timeout: 10_000,
      validateStatus: () => true,
    })

    res.json({
      status: 'reachable',
      hacStatusCode: result.status,
      url: testUrl,
      message: 'Backend can reach HAC portal',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const code = (err as { code?: string }).code

    res.json({
      status: 'unreachable',
      error: message,
      code,
      url: testUrl,
      message: 'Backend CANNOT reach HAC — this is the root cause of login failures',
    })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/grades', gradesRoutes)

/**
 * TEMPORARY LOCAL DEV ONLY:
 * When ENABLE_DEV_INTEGRATION_AUTH_BYPASS=true (set in .env), all protected
 * routes inject userId=1 so the app works without a JWT.  This lets you test
 * on-device via Expo Go without going through the full auth flow first.
 *
 * Before production, remove this block and restore the plain registrations.
 */
const ENABLE_DEV_INTEGRATION_AUTH_BYPASS =
  process.env.ENABLE_DEV_INTEGRATION_AUTH_BYPASS === 'true'

function devBypass(req: any, _res: any, next: any): void {
  req.userId = 1
  next()
}

if (ENABLE_DEV_INTEGRATION_AUTH_BYPASS) {
  console.log('[DEV] Auth bypass active — all routes use userId=1')
  app.use('/api/assignments', devBypass, assignmentsRouter)
  app.use('/api/students', devBypass, studentsRouter)
  app.use('/api/roadmap', devBypass, roadmapRouter)
  app.use('/api/ai', devBypass, aiRouter)
  app.use('/api/integrations/grades', devBypass, gradesIntegrationRouter)
  app.use('/api/social', devBypass, socialRouter)
} else {
  app.use('/api/assignments', assignmentsRouter)
  app.use('/api/students', studentsRouter)
  app.use('/api/roadmap', roadmapRouter)
  app.use('/api/ai', aiRouter)
  app.use('/api/integrations/grades', requireAuth, gradesIntegrationRouter)
  app.use('/api/social', socialRouter)
}

export default app