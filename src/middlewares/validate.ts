import type { NextFunction, Request, Response } from 'express'
import { validationResult } from 'express-validator'
import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'

// Place after express-validator rules: router.post('/', rules, validate, handler)
const validate = (req: Request, _res: Response, next: NextFunction) => {
  const result = validationResult(req)
  if (result.isEmpty()) return next()

  const details = result.array().flatMap((error) => {
    if (error.type === 'field') return [{ field: error.path, message: String(error.msg) }]
    if (error.type === 'unknown_fields') {
      return error.fields.map((field) => ({ field: field.path, message: 'Unknown field' }))
    }
    return [{ field: error.type, message: String(error.msg) }]
  })

  throw new AppError(StatusCodes.BAD_REQUEST, 'Validation failed', 'VALIDATION_FAILED', details)
}

export default validate
