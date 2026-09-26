import type { Request, Response } from 'express'
import hub, { type Channel } from '@/realtime/hub'

const PING_MS = 25_000
const open = new Set<Response>()

export const openStreamCount = () => open.size

// Attach a response to one or more hub channels as a Server-Sent Events stream.
// Events are hints to refresh: clients re-fetch their REST snapshot on (re)connect.
export function stream(req: Request, res: Response, channels: Channel[]) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop Nginx from buffering the stream
  })
  res.write('retry: 3000\n') // EventSource reconnect delay
  res.write(`event: ready\ndata: {}\n\n`)
  open.add(res)

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const unsubscribers = channels.map((channel) => hub.subscribe(channel, send))
  const ping = setInterval(() => res.write(': ping\n\n'), PING_MS) // keeps proxies from closing it

  const cleanup = () => {
    clearInterval(ping)
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    open.delete(res)
  }
  req.on('close', cleanup)
  res.on('error', cleanup)
}

// Called on shutdown so server.close() is not held open by long-lived streams
export function closeAllStreams() {
  for (const res of open) res.end()
  open.clear()
}
