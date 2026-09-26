import { Router, type Request, type Response } from 'express'
import { body, checkExact } from 'express-validator'
import { StatusCodes } from 'http-status-codes'
import validate from '@/middlewares/validate'
import { idParam } from '@/utils/validators'
import kiosksService from '@/modules/admin/kiosks/kiosks.service'

const name = (optional: boolean) =>
  (optional ? body('name').optional() : body('name'))
    .isString().withMessage('name is required').bail().trim()
    .isLength({ min: 1, max: 60 }).withMessage('name must be 1 to 60 characters')

const kiosksRoutes = Router()

kiosksRoutes.get('/kiosks', async (_req: Request, res: Response) => {
  res.success(await kiosksService.list(), 'Kiosks retrieved')
})

kiosksRoutes.post('/kiosks', [checkExact([name(false)], { locations: ['body'] })], validate, async (req: Request, res: Response) => {
  res.success(await kiosksService.create(req.body.name, req.staff!.id), 'Kiosk registered. Enter the code on the tablet.', StatusCodes.CREATED)
})

kiosksRoutes.post('/kiosks/:id/pairing-code', [idParam()], validate, async (req: Request, res: Response) => {
  res.success(await kiosksService.issueCode(Number(req.params.id)), 'New pairing code issued. The tablet must pair again.')
})

kiosksRoutes.patch(
  '/kiosks/:id',
  [idParam(), checkExact([name(true), body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false')], { locations: ['body'] })],
  validate,
  async (req: Request, res: Response) => {
    res.success(await kiosksService.update(Number(req.params.id), req.body), 'Kiosk updated')
  },
)

export default kiosksRoutes
