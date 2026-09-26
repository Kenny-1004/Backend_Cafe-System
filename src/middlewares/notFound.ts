import type { Request } from 'express'
import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'

const notFound = (req: Request) => {
  throw new AppError(StatusCodes.NOT_FOUND, `Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND')
}

export default notFound
