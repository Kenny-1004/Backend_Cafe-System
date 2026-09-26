import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import kioskService from '@/modules/kiosk/kiosk.service'
import type { CreateOrderItem, ServiceType } from '@/modules/kiosk/kiosk.types'
import { stream } from '@/realtime/sse'
import AppError from '@/utils/AppError'
import { hashToken, newRefreshToken } from '@/modules/auth/auth.tokens'
import kioskDeviceRepository from '@/modules/kiosk/kioskDevice.repository'
import { normalizePairingCode, setKioskCookie } from '@/modules/kiosk/kioskDevice.tokens'
import { resolveKiosk } from '@/middlewares/requireKiosk'

// A tablet redeems the one-time code a manager created; it receives a long-lived
// httpOnly device cookie and never sees the token itself.
const pair = async (req: Request, res: Response) => {
  const token = newRefreshToken()
  const device = await kioskDeviceRepository.pair(hashToken(normalizePairingCode(req.body.code)), hashToken(token))
  if (!device) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'That code is not valid or has expired. Ask a manager for a new one.', 'INVALID_PAIRING_CODE')
  }
  setKioskCookie(res, token)
  res.success({ kiosk: device }, `Paired as ${device.name}`)
}

// For page loads: which kiosk this is, without a 401 when it is not paired
const session = async (req: Request, res: Response) => {
  const kiosk = await resolveKiosk(req)
  res.success({ kiosk: kiosk ? { id: kiosk.id, name: kiosk.name } : null, preview: kiosk?.preview ?? false }, kiosk ? 'Kiosk ready' : 'Not paired')
}

const getMenu = async (_req: Request, res: Response) => {
  const menu = await kioskService.getMenu()
  res.success(menu, 'Menu retrieved')
}

const placeOrder = async (req: Request, res: Response) => {
  const order = await kioskService.placeOrder({
    serviceType: (req.body.serviceType as ServiceType | undefined) ?? 'dine_in',
    items: req.body.items as CreateOrderItem[],
    idempotencyKey: req.get('idempotency-key') as string,
  })
  res.location(`/api/v1/orders/${order.publicId}`)
  res.success(order, 'Order placed', StatusCodes.CREATED)
}

const getOrder = async (req: Request<{ publicId: string }>, res: Response) => {
  const order = await kioskService.getOrder(req.params.publicId)
  res.success(order, 'Order retrieved')
}

// Live status for one order only; 404 first so a random id cannot open a stream
const orderEvents = async (req: Request<{ publicId: string }>, res: Response) => {
  await kioskService.getOrder(req.params.publicId)
  stream(req, res, [`order:${req.params.publicId}`])
}

// Stock changes, so kiosks refresh which items are sold out
const menuEvents = (req: Request, res: Response) => {
  stream(req, res, ['menu'])
}

export default { getMenu, placeOrder, getOrder, orderEvents, menuEvents, pair, session }
