import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import { withTransaction } from '@/db/pool'
import { hashPassword } from '@/modules/auth/auth.password'
import staffRepository from '@/modules/admin/staff/staff.repository'
import type { EmployeeRole } from '@/types/auth'

const notFound = () => new AppError(StatusCodes.NOT_FOUND, 'Employee not found', 'NOT_FOUND')

const list = () => staffRepository.list()

const get = async (id: number) => {
  const employee = await staffRepository.findById(id)
  if (!employee) throw notFound()
  return employee
}

const create = async (fields: { username: string; fullName: string; role: EmployeeRole; password: string }) => {
  const id = await staffRepository.create({
    username: fields.username,
    fullName: fields.fullName,
    role: fields.role,
    passwordHash: await hashPassword(fields.password),
  })
  return get(id)
}

// An admin cannot lock themselves out: no self-deactivation or self-demotion
const update = async (
  id: number,
  fields: { fullName?: string; role?: EmployeeRole; isActive?: boolean; password?: string },
  actingEmployeeId: number,
) => {
  if (id === actingEmployeeId && (fields.isActive === false || (fields.role && fields.role !== 'admin'))) {
    throw new AppError(StatusCodes.CONFLICT, 'You cannot deactivate or demote your own account', 'INVALID_STATE')
  }

  const passwordHash = fields.password ? await hashPassword(fields.password) : undefined
  await withTransaction(async (client) => {
    const updated = await staffRepository.update(client, id, {
      fullName: fields.fullName,
      role: fields.role,
      isActive: fields.isActive,
      passwordHash,
    })
    if (!updated) throw notFound()
    if (fields.isActive === false || passwordHash) await staffRepository.revokeSessions(client, id)
  })
  return get(id)
}

export default { list, get, create, update }
