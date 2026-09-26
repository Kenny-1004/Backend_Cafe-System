import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import pool from '@/db/pool'
import { api, signIn } from './helpers'

afterAll(() => pool.end())

const cookieNamed = (res: request.Response, name: string) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith(`${name}=`))

describe('staff sign-in', () => {
  it('signs in with valid credentials and sets httpOnly, SameSite=Strict cookies', async () => {
    const res = await api().post('/api/v1/auth/login').send({ username: 'cashier1', password: 'cafe12345' })
    expect(res.status).toBe(200)
    expect(res.body.data.staff).toMatchObject({ username: 'cashier1', role: 'cashier', fullName: 'Cashier One' })
    expect(res.body.data.staff.passwordHash).toBeUndefined()

    const access = cookieNamed(res, 'cafe_access')!
    const refresh = cookieNamed(res, 'cafe_refresh')!
    expect(access).toMatch(/HttpOnly/i)
    expect(access).toMatch(/SameSite=Strict/i)
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/)
  })

  it('accepts the username case-insensitively', async () => {
    const res = await api().post('/api/v1/auth/login').send({ username: '  CASHIER1 ', password: 'cafe12345' })
    expect(res.status).toBe(200)
  })

  it('rejects a wrong password and an unknown user with the same generic message', async () => {
    const wrong = await api().post('/api/v1/auth/login').send({ username: 'cashier2', password: 'nope-nope' })
    const unknown = await api().post('/api/v1/auth/login').send({ username: 'ghost', password: 'nope-nope' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(wrong.body.message).toBe(unknown.body.message)
  })

  it('validates the body', async () => {
    const res = await api().post('/api/v1/auth/login').send({ username: 'admin' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('locks out an IP + username after 5 failed attempts in a minute', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await api().post('/api/v1/auth/login').send({ username: 'barista2', password: 'wrong-password' })
      expect(res.status).toBe(401)
    }
    const blocked = await api().post('/api/v1/auth/login').send({ username: 'barista2', password: 'cafe12345' })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('RATE_LIMITED')
  })
})

describe('sessions', () => {
  it('returns the current staff member from /auth/me', async () => {
    const agent = await signIn('admin')
    const res = await agent.get('/api/v1/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.data.staff).toMatchObject({ username: 'admin', role: 'admin' })
  })

  it('reports the session on page load without a 401, renewing an expired access token', async () => {
    const anonymous = await api().get('/api/v1/auth/session')
    expect(anonymous.status).toBe(200)
    expect(anonymous.body.data.staff).toBeNull()

    const login = await api().post('/api/v1/auth/login').send({ username: 'cashier1', password: 'cafe12345' })
    const refreshOnly = cookieNamed(login, 'cafe_refresh')!.split(';')[0] // as if the 15-minute access cookie expired
    const renewed = await api().get('/api/v1/auth/session').set('Cookie', refreshOnly)
    expect(renewed.status).toBe(200)
    expect(renewed.body.data.staff).toMatchObject({ username: 'cashier1' })
    expect(cookieNamed(renewed, 'cafe_access')).toBeDefined()

    const reused = await api().get('/api/v1/auth/session').set('Cookie', refreshOnly) // rotated: the old one is dead
    expect(reused.body.data.staff).toBeNull()
  })

  it('requires a session for /auth/me', async () => {
    const res = await api().get('/api/v1/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects a tampered access token', async () => {
    const res = await api().get('/api/v1/auth/me').set('Cookie', 'cafe_access=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.bad')
    expect(res.status).toBe(401)
  })

  it('rotates the refresh token so an old one cannot be reused', async () => {
    const login = await api().post('/api/v1/auth/login').send({ username: 'cashier2', password: 'cafe12345' })
    const oldRefresh = cookieNamed(login, 'cafe_refresh')!.split(';')[0]

    const first = await api().post('/api/v1/auth/refresh').set('Cookie', oldRefresh)
    expect(first.status).toBe(200)
    const newRefresh = cookieNamed(first, 'cafe_refresh')!.split(';')[0]
    expect(newRefresh).not.toBe(oldRefresh)

    const replay = await api().post('/api/v1/auth/refresh').set('Cookie', oldRefresh)
    expect(replay.status).toBe(401)
    expect(replay.body.error.code).toBe('SESSION_EXPIRED')

    const again = await api().post('/api/v1/auth/refresh').set('Cookie', newRefresh)
    expect(again.status).toBe(200)
  })

  it('signs out: the session stops working immediately', async () => {
    const agent = await signIn('barista1')
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200)
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(200)
    const after = await api().get('/api/v1/auth/me')
    expect(after.status).toBe(401)
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401)
  })
})

describe('role-based access', () => {
  it('keeps each role inside its own panels', async () => {
    const kitchen = await signIn('barista1')
    const cashier = await signIn('cashier1')
    const admin = await signIn('admin')

    expect((await kitchen.get('/api/v1/board')).status).toBe(200)
    expect((await kitchen.get('/api/v1/cashier/orders')).status).toBe(403)
    expect((await kitchen.get('/api/v1/admin/products')).status).toBe(403)

    expect((await cashier.get('/api/v1/cashier/orders')).status).toBe(200)
    expect((await cashier.get('/api/v1/board')).status).toBe(200)
    const forbidden = await cashier.get('/api/v1/admin/employees')
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    for (const path of ['/api/v1/cashier/orders', '/api/v1/board', '/api/v1/admin/dashboard']) {
      expect((await admin.get(path)).status).toBe(200)
    }
  })

  it('rejects every staff endpoint without a session', async () => {
    for (const path of ['/api/v1/cashier/orders', '/api/v1/board', '/api/v1/admin/products', '/api/v1/board/events']) {
      expect((await api().get(path)).status).toBe(401)
    }
  })
})

describe('platform', () => {
  it('tags every response with an X-Request-Id', async () => {
    const res = await api().get('/healthz')
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    const echoed = await api().get('/healthz').set('X-Request-Id', 'trace-abc-123')
    expect(echoed.headers['x-request-id']).toBe('trace-abc-123')
  })

  it('returns the standard error shape for unknown routes', async () => {
    const res = await api().get('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ success: false, data: null, error: { code: 'ROUTE_NOT_FOUND' } })
  })
})
