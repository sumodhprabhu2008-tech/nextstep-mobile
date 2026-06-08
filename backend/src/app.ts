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

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/grades', gradesRoutes)
app.use('/api/assignments', assignmentsRouter)
app.use('/api/students', studentsRouter)
app.use('/api/roadmap', roadmapRouter)
app.use('/api/ai', aiRouter)

app.use('/api/integrations/grades', requireAuth, gradesIntegrationRouter)

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

export default app
