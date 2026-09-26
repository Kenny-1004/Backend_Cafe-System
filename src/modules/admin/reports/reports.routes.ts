import { Router, type Request, type Response } from 'express'
import { query } from 'express-validator'
import validate from '@/middlewares/validate'
import reportsService from '@/modules/admin/reports/reports.service'

const dateQuery = (field: string) =>
  query(field).optional().isISO8601({ strict: true }).withMessage(`${field} must be YYYY-MM-DD`).bail()
    .isLength({ min: 10, max: 10 }).withMessage(`${field} must be YYYY-MM-DD`)

const rangeRules = [dateQuery('from'), dateQuery('to')]
const bestSellerRules = [...rangeRules, query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1 to 50').toInt()]

const range = (req: Request) => [req.query.from as string | undefined, req.query.to as string | undefined] as const

const reportsRoutes = Router()

reportsRoutes.get('/dashboard', async (_req: Request, res: Response) => {
  res.success(await reportsService.dashboard(), 'Dashboard retrieved')
})
reportsRoutes.get('/reports/daily-sales', rangeRules, validate, async (req: Request, res: Response) => {
  res.success(await reportsService.dailySales(...range(req)), 'Daily sales retrieved')
})
reportsRoutes.get('/reports/best-sellers', bestSellerRules, validate, async (req: Request, res: Response) => {
  res.success(await reportsService.bestSellers(...range(req), Number(req.query.limit ?? 10)), 'Best sellers retrieved')
})
reportsRoutes.get('/reports/summary', rangeRules, validate, async (req: Request, res: Response) => {
  res.success(await reportsService.summary(...range(req)), 'Sales summary retrieved')
})

export default reportsRoutes
