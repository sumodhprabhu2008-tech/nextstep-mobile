import app from './app'
import { logger } from './common/logger'

const PORT = process.env.PORT ?? '3001'

app.listen(Number(PORT), () => {
  logger.info('NextStep API started', { port: PORT })
})
