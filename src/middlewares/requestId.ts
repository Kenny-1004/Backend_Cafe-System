import { randomUUID } from 'crypto'
import type { NextFunction, Request, Response } from 'express'

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/

// Every response carries X-Request-Id; the same id appears in the access log and error log.
// A well-formed incoming id (from a proxy) is kept so traces line up end to end.
const requestId = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.get('x-request-id')
  req.requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID()
  res.setHeader('X-Request-Id', req.requestId)
  next()
}

export default requestId
