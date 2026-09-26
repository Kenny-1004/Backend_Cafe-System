import type { Request, Response } from 'express'
import cashierService from '@/modules/cashier/cashier.service'
import type { OrderStatus } from '@/modules/kiosk/kiosk.types'
import { stream } from '@/realtime/sse'

const list = async (req: Request, res: Response) => {
  const status = (req.query.status as OrderStatus | undefined) ?? 'unpaid'
  res.success(await cashierService.listToday(status), 'Orders retrieved')
}

const byNumber = async (req: Request, res: Response) => {
  res.success(await cashierService.getByNumber(Number(req.params.number)), 'Order retrieved')
}

const byId = async (req: Request, res: Response) => {
  res.success(await cashierService.getById(Number(req.params.id)), 'Order retrieved')
}

const pay = async (req: Request, res: Response) => {
  const result = await cashierService.pay(Number(req.params.id), req.body.customerName, req.body.cashTendered, req.staff!.id)
  res.success(result, `Paid. Give ₱${result.change} change.`)
}

const cancel = async (req: Request, res: Response) => {
  res.success(await cashierService.cancel(Number(req.params.id), req.staff!.id), 'Order cancelled')
}

const summary = async (req: Request, res: Response) => {
  res.success(await cashierService.summary(req.staff!.id), 'Today’s summary')
}

const events = (req: Request, res: Response) => stream(req, res, ['cashier'])

export default { list, byNumber, byId, pay, cancel, summary, events }
