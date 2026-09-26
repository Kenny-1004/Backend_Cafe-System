import type { NextFunction, Request, Response } from 'express'
import { DatabaseError } from 'pg'
import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import pgErrorMap from '@/utils/pgErrorMap'
import { isProduction } from '@/config/env'

type BodyParserError = Error & { type: string; status: number }

// express.json() errors (bad JSON, body over the 32 KB limit, bad charset) are client errors
const isBodyParserError = (error: unknown): error is BodyParserError =>
  error instanceof Error &&
  'type' in error && typeof error.type === 'string' &&
  'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500

// Must be registered last. Converts every thrown error into the standard response shape.
const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    // e.g. an SSE stream that already started; nothing sensible can be sent any more
    console.error(`[${req.requestId}]`, error)
    return res.end()
  }

  if (error instanceof AppError) {
    return res.fail(error.statusCode, error.message, error.code, error.details)
  }

  if (isBodyParserError(error)) {
    if (error.type === 'entity.parse.failed') {
      return res.fail(StatusCodes.BAD_REQUEST, 'Request body is not valid JSON', 'INVALID_JSON')
    }
    if (error.type === 'entity.too.large') {
      return res.fail(StatusCodes.REQUEST_TOO_LONG, 'Request body is larger than 32 KB', 'PAYLOAD_TOO_LARGE')
    }
    return res.fail(error.status, error.message, 'BAD_REQUEST')
  }

  if (error instanceof DatabaseError && error.code && pgErrorMap[error.code]) {
    const mapped = pgErrorMap[error.code]
    const message = mapped.exposeMessage ? error.message : (mapped.message ?? 'The request could not be completed')
    return res.fail(mapped.statusCode, message, mapped.code)
  }

  console.error(`[${req.requestId}] ${req.method} ${req.originalUrl}`, error)
  const message = !isProduction && error instanceof Error ? error.message : 'Something went wrong'
  return res.fail(StatusCodes.INTERNAL_SERVER_ERROR, message, 'INTERNAL_ERROR')
}

export default errorHandler
