import type { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import type { EmployeeRole } from '@/types/auth'

// Place after authenticate: router.use(authenticate, authorize('cashier', 'admin'))
const authorize =
  (...roles: EmployeeRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.staff) throw new AppError(StatusCodes.UNAUTHORIZED, 'Please sign in', 'UNAUTHENTICATED')
    if (!roles.includes(req.staff.role)) {
      throw new AppError(StatusCodes.FORBIDDEN, 'You do not have access to this area', 'FORBIDDEN')
    }
    next()
  }

export default authorize
