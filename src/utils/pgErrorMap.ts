import { StatusCodes } from 'http-status-codes'

type MappedPgError = {
  statusCode: number
  code: string
  message?: string // shown instead of the database message when that is not written for users
  exposeMessage: boolean // true = message was written for users (our CFxxx codes)
}

// SQLSTATE codes raised by the database functions (db/migrations/002_panels_and_rules.sql)
// plus the standard PostgreSQL codes the API can trigger.
const pgErrorMap: Record<string, MappedPgError> = {
  CF001: { statusCode: StatusCodes.NOT_FOUND, code: 'NOT_FOUND', exposeMessage: true },
  CF002: { statusCode: StatusCodes.CONFLICT, code: 'INVALID_STATE', exposeMessage: true },
  CF003: { statusCode: StatusCodes.CONFLICT, code: 'OUT_OF_STOCK', exposeMessage: true },
  CF004: { statusCode: StatusCodes.UNPROCESSABLE_ENTITY, code: 'INSUFFICIENT_CASH', exposeMessage: true },
  CF005: { statusCode: StatusCodes.UNPROCESSABLE_ENTITY, code: 'VALIDATION_FAILED', exposeMessage: true },
  CF006: { statusCode: StatusCodes.CONFLICT, code: 'PRODUCT_UNAVAILABLE', exposeMessage: true },
  '23505': { statusCode: StatusCodes.CONFLICT, code: 'CONFLICT', message: 'That name is already in use', exposeMessage: false },
  '23503': { statusCode: StatusCodes.UNPROCESSABLE_ENTITY, code: 'INVALID_REFERENCE', message: 'A referenced record does not exist', exposeMessage: false },
  '23514': { statusCode: StatusCodes.UNPROCESSABLE_ENTITY, code: 'VALIDATION_FAILED', message: 'A value is outside the allowed range', exposeMessage: false },
  '40P01': { statusCode: StatusCodes.SERVICE_UNAVAILABLE, code: 'RETRY_LATER', message: 'The server is busy, please retry', exposeMessage: false },
  '40001': { statusCode: StatusCodes.SERVICE_UNAVAILABLE, code: 'RETRY_LATER', message: 'The server is busy, please retry', exposeMessage: false },
}

export default pgErrorMap
