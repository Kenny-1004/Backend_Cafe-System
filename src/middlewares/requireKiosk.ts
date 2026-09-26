import type { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import { hashToken } from '@/modules/auth/auth.tokens'
import kioskDeviceRepository from '@/modules/kiosk/kioskDevice.repository'
import { KIOSK_COOKIE } from '@/modules/kiosk/kioskDevice.tokens'
import { resolveStaff } from '@/middlewares/authenticate'

// Kiosk endpoints: a paired tablet (device cookie), or a signed-in manager previewing the kiosk.
export async function resolveKiosk(req: Request) {
  const token = req.cookies?.[KIOSK_COOKIE]
  if (typeof token === 'string' && token) {
    const device = await kioskDeviceRepository.findByTokenHash(hashToken(token))
    if (device) {
      void kioskDeviceRepository.touch(device.id).catch(() => undefined)
      return { id: device.id, name: device.name, preview: false }
    }
  }
  const staff = await resolveStaff(req)
  if (staff?.role === 'admin') return { id: 0, name: 'Manager preview', preview: true }
  return null
}

const requireKiosk = async (req: Request, _res: Response, next: NextFunction) => {
  const kiosk = await resolveKiosk(req)
  if (!kiosk) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'This kiosk is not paired. Ask a manager for a pairing code.', 'KIOSK_NOT_PAIRED')
  }
  req.kiosk = kiosk
  next()
}

export default requireKiosk
