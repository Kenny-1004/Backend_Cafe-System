import type { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import type { ApiErrorDetail, ApiResponse } from '@/types/api'

// Adds res.success() and res.fail() so every endpoint returns the same shape:
// { success, message, data, error }
const responseFormatter = (_req: Request, res: Response, next: NextFunction) => {
  res.success = <T>(data: T, message = 'OK', statusCode: number = StatusCodes.OK) => {
    const body: ApiResponse<T> = { success: true, message, data, error: null }
    return res.status(statusCode).json(body)
  }

  res.fail = (statusCode: number, message: string, code: string, details: ApiErrorDetail[] | null = null) => {
    const body: ApiResponse<null> = { success: false, message, data: null, error: { code, details } }
    return res.status(statusCode).json(body)
  }

  next()
}

export default responseFormatter
