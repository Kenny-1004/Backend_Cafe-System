import { body, checkExact } from 'express-validator'
import { idParam } from '@/utils/validators'
import { MIN_PASSWORD_LENGTH } from '@/modules/auth/auth.password'

const ROLES = ['cashier', 'kitchen', 'admin']

const fullName = (optional: boolean) =>
  (optional ? body('fullName').optional() : body('fullName'))
    .isString().withMessage('fullName is required').bail().trim()
    .isLength({ min: 1, max: 80 }).withMessage('fullName must be 1 to 80 characters')

const role = (optional: boolean) =>
  (optional ? body('role').optional() : body('role')).isIn(ROLES).withMessage('role must be cashier, kitchen or admin')

const password = (optional: boolean) =>
  (optional ? body('password').optional() : body('password'))
    .isString().withMessage('password is required').bail()
    .isLength({ min: MIN_PASSWORD_LENGTH, max: 200 }).withMessage(`password must be at least ${MIN_PASSWORD_LENGTH} characters`)

export const idRules = [idParam()]

export const createRules = [
  checkExact(
    [
      body('username')
        .isString().withMessage('username is required').bail()
        .trim().toLowerCase()
        .matches(/^[a-z0-9._-]{3,30}$/).withMessage('username must be 3 to 30 letters, digits, dots, dashes or underscores'),
      fullName(false),
      role(false),
      password(false),
    ],
    { locations: ['body'] },
  ),
]

export const updateRules = [
  idParam(),
  checkExact(
    [fullName(true), role(true), body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false'), password(true)],
    { locations: ['body'] },
  ),
]
