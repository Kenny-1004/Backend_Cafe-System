import { body, checkExact } from 'express-validator'

export const loginRules = checkExact(
  [
    body('username')
      .isString().withMessage('username is required')
      .bail()
      .trim()
      .isLength({ min: 1, max: 60 }).withMessage('username is required'),
    body('password')
      .isString().withMessage('password is required')
      .bail()
      .isLength({ min: 1, max: 200 }).withMessage('password is required'),
  ],
  { locations: ['body'] },
)
