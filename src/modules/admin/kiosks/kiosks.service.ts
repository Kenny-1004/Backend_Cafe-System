import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import { hashToken } from '@/modules/auth/auth.tokens'
import { PAIRING_TTL_MINUTES, newPairingCode, normalizePairingCode } from '@/modules/kiosk/kioskDevice.tokens'
import kiosksRepository from '@/modules/admin/kiosks/kiosks.repository'

const notFound = () => new AppError(StatusCodes.NOT_FOUND, 'Kiosk not found', 'NOT_FOUND')
const expiry = () => new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000)

const list = () => kiosksRepository.list()

// The plain code is returned once, to show on the manager's screen; only its hash is stored
const create = async (name: string, employeeId: number) => {
  const pairingCode = newPairingCode()
  const id = await kiosksRepository.create(name, hashToken(normalizePairingCode(pairingCode)), expiry(), employeeId)
  return { kiosk: (await kiosksRepository.findById(id))!, pairingCode }
}

const issueCode = async (id: number) => {
  const pairingCode = newPairingCode()
  if (!(await kiosksRepository.issueCode(id, hashToken(normalizePairingCode(pairingCode)), expiry()))) throw notFound()
  return { kiosk: (await kiosksRepository.findById(id))!, pairingCode }
}

const update = async (id: number, fields: { name?: string; isActive?: boolean }) => {
  if (!(await kiosksRepository.update(id, fields))) throw notFound()
  return (await kiosksRepository.findById(id))!
}

export default { list, create, issueCode, update }
