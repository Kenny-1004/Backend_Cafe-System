import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pool from '@/db/pool'
import { api, pairKiosk, signIn, testServer, type Agent } from './helpers'

let manager: Agent

beforeAll(async () => {
  manager = await signIn('admin')
})
afterAll(() => pool.end())

const cookieNamed = (res: request.Response, name: string) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith(`${name}=`))

describe('kiosk pairing', () => {
  it('keeps the kiosk closed to unpaired devices', async () => {
    const menu = await api().get('/api/v1/menu')
    expect(menu.status).toBe(401)
    expect(menu.body.error.code).toBe('KIOSK_NOT_PAIRED')
    expect((await api().post('/api/v1/orders').set('Idempotency-Key', crypto.randomUUID()).send({ items: [{ productId: 1, quantity: 1 }] })).status).toBe(401)

    const session = await api().get('/api/v1/kiosk/session')
    expect(session.status).toBe(200)
    expect(session.body.data).toEqual({ kiosk: null, preview: false })
  })

  it('pairs a tablet once with a one-time code and sets an httpOnly device cookie', async () => {
    const created = await manager.post('/api/v1/admin/kiosks').send({ name: 'Entrance kiosk' })
    expect(created.status).toBe(201)
    expect(created.body.data.pairingCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(created.body.data.kiosk).toMatchObject({ name: 'Entrance kiosk', status: 'pairing', isActive: true })

    const tablet = request.agent(testServer())
    const code = created.body.data.pairingCode as string
    const paired = await tablet.post('/api/v1/kiosk/pair').send({ code: code.toLowerCase().replace('-', ' ') }) // typed loosely
    expect(paired.status).toBe(200)
    expect(paired.body.data.kiosk.name).toBe('Entrance kiosk')
    const cookie = cookieNamed(paired, 'cafe_kiosk')!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Strict/i)

    expect((await tablet.get('/api/v1/menu')).status).toBe(200)
    expect((await tablet.get('/api/v1/kiosk/session')).body.data).toEqual({ kiosk: { id: created.body.data.kiosk.id, name: 'Entrance kiosk' }, preview: false })

    // The code is single-use
    const reuse = await api().post('/api/v1/kiosk/pair').send({ code })
    expect(reuse.status).toBe(401)
    expect(reuse.body.error.code).toBe('INVALID_PAIRING_CODE')

    const list = await manager.get('/api/v1/admin/kiosks')
    const row = list.body.data.find((kiosk: { id: number }) => kiosk.id === created.body.data.kiosk.id)
    expect(row).toMatchObject({ status: 'paired', pairingExpiresAt: null })
    expect(row.lastSeenAt).not.toBeNull()
  })

  it('rejects wrong and expired codes', async () => {
    expect((await api().post('/api/v1/kiosk/pair').send({ code: 'ZZZZ-ZZZZ' })).status).toBe(401)
    expect((await api().post('/api/v1/kiosk/pair').send({ code: '12' })).status).toBe(400)

    const created = await manager.post('/api/v1/admin/kiosks').send({ name: 'Expired code kiosk' })
    const { adminPool, endAdminPool } = await import('./helpers') // the app role cannot back-date timestamps
    await adminPool().query("UPDATE kiosk_devices SET pairing_expires_at = now() - interval '1 minute' WHERE id = $1", [created.body.data.kiosk.id])
    await endAdminPool()
    const expired = await api().post('/api/v1/kiosk/pair').send({ code: created.body.data.pairingCode })
    expect(expired.status).toBe(401)
  })

  it('deactivating a kiosk locks it out at once; reactivating lets it back in', async () => {
    const { tablet, kiosk } = await pairKiosk(manager)
    expect((await tablet.get('/api/v1/menu')).status).toBe(200)

    await manager.patch(`/api/v1/admin/kiosks/${kiosk.id}`).send({ isActive: false }).expect(200)
    expect((await tablet.get('/api/v1/menu')).status).toBe(401)

    await manager.patch(`/api/v1/admin/kiosks/${kiosk.id}`).send({ isActive: true, name: 'Renamed kiosk' }).expect(200)
    expect((await tablet.get('/api/v1/menu')).status).toBe(200)
  })

  it('a new pairing code un-pairs the old tablet (replaced or lost device)', async () => {
    const { tablet, kiosk } = await pairKiosk(manager)
    const reissued = await manager.post(`/api/v1/admin/kiosks/${kiosk.id}/pairing-code`)
    expect(reissued.status).toBe(200)
    expect(reissued.body.data.kiosk.status).toBe('pairing')
    expect((await tablet.get('/api/v1/menu')).status).toBe(401)

    const replacement = request.agent(testServer())
    await replacement.post('/api/v1/kiosk/pair').send({ code: reissued.body.data.pairingCode }).expect(200)
    expect((await replacement.get('/api/v1/menu')).status).toBe(200)
  })

  it('lets a signed-in manager preview the kiosk, but not cashiers or baristas', async () => {
    expect((await manager.get('/api/v1/menu')).status).toBe(200)
    expect((await manager.get('/api/v1/kiosk/session')).body.data).toEqual({ kiosk: { id: 0, name: 'Manager preview' }, preview: true })
    const cashier = await signIn('cashier1')
    expect((await cashier.get('/api/v1/menu')).status).toBe(401)
  })

  it('only managers can register kiosks', async () => {
    const cashier = await signIn('cashier2')
    expect((await cashier.post('/api/v1/admin/kiosks').send({ name: 'Sneaky' })).status).toBe(403)
    expect((await manager.post('/api/v1/admin/kiosks').send({ name: '' })).status).toBe(400)
  })
})
