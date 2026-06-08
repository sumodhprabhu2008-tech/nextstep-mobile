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
app.use('/api/assignments', assignmentsRouter)
app.use('/api/students', studentsRouter)
app.use('/api/roadmap', roadmapRouter)
app.use('/api/ai', aiRouter)

/**
 * TEMPORARY LOCAL DEV ONLY:
 * If your mobile app is not passing a JWT token yet, this bypass lets you test
 * the HAC/PowerSchool integration route.
 *
 * Before production, replace this whole block with:
 * app.use('/api/integrations/grades', requireAuth, gradesIntegrationRouter)
 */
const ENABLE_DEV_INTEGRATION_AUTH_BYPASS =
  process.env.ENABLE_DEV_INTEGRATION_AUTH_BYPASS === 'true'

if (ENABLE_DEV_INTEGRATION_AUTH_BYPASS) {
  app.use('/api/integrations/grades', (req, _res, next) => {
    console.log('[DEV AUTH BYPASS] Using fake user id 1 for grade integration testing')
    ;(req as any).userId = 1
    ;(req as any).user = { id: 1 }
    next()
  }, gradesIntegrationRouter)
} else {
  app.use('/api/integrations/grades', requireAuth, gradesIntegrationRouter)
}

export default app