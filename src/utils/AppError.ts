import { StatusCodes } from 'http-status-codes'
import type { ApiErrorDetail } from '@/types/api'

class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details: ApiErrorDetail[] | null

  constructor(
    statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
    message: string,
    code: string = 'INTERNAL_ERROR',
    details: ApiErrorDetail[] | null = null,
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export default AppError
