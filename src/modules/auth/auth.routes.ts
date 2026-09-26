import { Router } from 'express'
import validate from '@/middlewares/validate'
import authenticate from '@/middlewares/authenticate'
import { loginRateLimit } from '@/middlewares/rateLimit'
import authController from '@/modules/auth/auth.controller'
import { loginRules } from '@/modules/auth/auth.validator'

const authRoutes = Router()

authRoutes.post('/login', loginRateLimit, loginRules, validate, authController.login)
authRoutes.post('/refresh', authController.refresh)
authRoutes.post('/logout', authController.logout)
authRoutes.get('/session', authController.session)
authRoutes.get('/me', authenticate, authController.me)

export default authRoutes
