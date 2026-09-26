import type { Request, Response } from 'express'
import boardService from '@/modules/board/board.service'
import { stream } from '@/realtime/sse'

const snapshot = async (_req: Request, res: Response) => {
  res.success(await boardService.snapshot(), 'Board retrieved')
}

const serve = async (req: Request, res: Response) => {
  await boardService.serve(Number(req.params.id), req.staff!.id)
  res.success({ orderId: Number(req.params.id), status: 'serving' }, 'Order is ready for pick-up')
}

const complete = async (req: Request, res: Response) => {
  const result = await boardService.complete(req.body.orderIds as number[], req.staff!.id)
  res.success(result, `${result.cleared} order(s) cleared`)
}

const events = (req: Request, res: Response) => stream(req, res, ['board'])

export default { snapshot, serve, complete, events }
