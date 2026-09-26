import express from 'express'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import responseFormatter from '@/middlewares/responseFormatter'
import requestId from '@/middlewares/requestId'
import notFound from '@/middlewares/notFound'
import errorHandler from '@/middlewares/errorHandler'
import healthRoutes from '@/modules/health/health.routes'
import routes from '@/routes'
import { isProduction, isTest } from '@/config/env'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 'loopback') // behind the Vite dev proxy / Nginx on the same host

app.use(requestId)
morgan.token('id', (req) => (req as express.Request).requestId)
if (!isTest) {
  app.use(morgan(isProduction ? ':id :remote-addr ":method :url" :status :res[content-length] - :response-time ms' : ':id :method :url :status :response-time ms'))
}
app.use(responseFormatter) // before the parsers, so even body-parser errors get the standard shape
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})
app.use(express.json({ limit: '32kb' }))
app.use(cookieParser())

app.use(healthRoutes)
// API answers carry session state, names and money: never store them in browser or proxy caches
app.set('etag', false)
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use('/api/v1', routes)

app.use(notFound)
app.use(errorHandler)

export default app
