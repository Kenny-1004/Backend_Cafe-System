import { Client } from 'pg'
import env from '@/config/env'
import hub from '@/realtime/hub'

type OrderStatusEvent = { orderId: number; publicId: string; orderNumber: number; status: string }
type StockChangedEvent = { ingredientId: number; stockQty: string }

let client: Client | null = null
let connected = false
let stopped = false
let retryTimer: NodeJS.Timeout | undefined

export const isListenerConnected = () => connected

function dispatch(channel: string, payload: string | undefined) {
  let data: unknown
  try {
    data = JSON.parse(payload ?? '{}')
  } catch {
    console.error(`Ignoring malformed ${channel} notification`)
    return
  }

  if (channel === 'order_status') {
    const event = data as OrderStatusEvent
    hub.publish('board', 'order.status', event)
    hub.publish('display', 'order.status', { status: event.status }) // public: status only
    hub.publish('cashier', 'order.status', event)
    hub.publish('admin', 'order.status', event)
    if (event.publicId) hub.publish(`order:${event.publicId}`, 'order.status', event) // kiosk sees only its order
  } else if (channel === 'stock_changed') {
    const event = data as StockChangedEvent
    hub.publish('admin', 'stock.changed', event)
    hub.publish('menu', 'menu.changed', { ingredientId: event.ingredientId })
  }
}

function scheduleReconnect(delayMs: number) {
  if (stopped) return
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => void connect(Math.min(delayMs * 2, 30_000)), delayMs)
}

async function connect(nextDelayMs = 1_000) {
  if (stopped) return
  const next = new Client({ connectionString: env.DATABASE_URL })
  next.on('notification', (message) => dispatch(message.channel, message.payload))
  next.on('error', (error) => {
    console.error('LISTEN connection lost; reconnecting:', error.message)
    connected = false
    void next.end().catch(() => undefined)
    scheduleReconnect(1_000)
  })
  next.on('end', () => {
    if (client === next) connected = false
  })

  try {
    await next.connect()
    await next.query('LISTEN order_status')
    await next.query('LISTEN stock_changed')
    client = next
    connected = true
  } catch (error) {
    console.error('LISTEN connection failed; retrying:', (error as Error).message)
    void next.end().catch(() => undefined)
    scheduleReconnect(nextDelayMs)
  }
}

// One dedicated connection per API instance (LISTEN needs a session, not a pooled client)
export async function startListener() {
  stopped = false
  await connect()
}

export async function stopListener() {
  stopped = true
  clearTimeout(retryTimer)
  connected = false
  await client?.end().catch(() => undefined)
  client = null
}
