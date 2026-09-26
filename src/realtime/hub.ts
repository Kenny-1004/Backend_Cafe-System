// In-process pub/sub. Each API instance has its own hub fed by its own LISTEN connection,
// so every instance sees every event and no state is shared between instances.

export type Channel =
  | 'board' // all order status changes, for the orders board
  | 'display' // public now-serving screen: a bare hint, no ids or names
  | 'cashier' // all order status changes, for the cashier's unpaid list
  | 'admin' // order status + stock level changes
  | 'menu' // stock changes, so kiosks refresh availability
  | `order:${string}` // one kiosk order, by public id

export type HubListener = (event: string, data: unknown) => void

const channels = new Map<Channel, Set<HubListener>>()

const subscribe = (channel: Channel, listener: HubListener) => {
  let listeners = channels.get(channel)
  if (!listeners) {
    listeners = new Set()
    channels.set(channel, listeners)
  }
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) channels.delete(channel)
  }
}

const publish = (channel: Channel, event: string, data: unknown) => {
  for (const listener of channels.get(channel) ?? []) {
    try {
      listener(event, data)
    } catch (error) {
      console.error(`Realtime listener on ${channel} failed:`, error)
    }
  }
}

const subscriberCount = () => [...channels.values()].reduce((sum, set) => sum + set.size, 0)

export default { subscribe, publish, subscriberCount }
