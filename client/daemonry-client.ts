// daemonry client. Copy this one file into your app; it has no dependencies beyond
// Node's `net` module and uses only erasable TypeScript syntax, so it runs under
// `node file.ts` (Node 23.6+), tsx, esbuild or tsc alike.
//
//   import { daemonry } from './daemonry-client.ts'   // drop the extension under tsc/tsx if you prefer
//
//   daemonry.commands([{ id: 'reload', label: 'Reload config' }, { id: 'dump' }])
//   daemonry.onCommand((id) => { if (id === 'reload') reload() })
//   daemonry.onShutdown(() => { tidyUp(); process.exit(0) })   // optional
//   daemonry.status('Idle')                                    // optional, shown next to the app
//
// When the app was not launched by daemonry (no DAEMONRY_SOCKET in the environment) every
// call is a no-op and `daemonry.active` is false, so the app still runs normally from a
// terminal. The client reconnects with backoff whenever the connection drops, so an app
// run under a file watcher keeps working across restarts of the inner process.
//
// A "shutdown" message from daemonry runs the onShutdown handlers. If none were
// registered it invokes the process's SIGTERM listeners, or exits with code 0 when there
// are none either. Daemonry force-kills the process tree if it is still alive after the
// app's grace period, so a handler that hangs is not fatal, just slow.

import { createConnection, type Socket } from 'node:net'

export interface DaemonryCommand {
  id: string
  label?: string
}

export type CommandHandler = (id: string) => void
export type ShutdownHandler = () => void

type RunnerMessage =
  | { type: 'welcome'; app: { id: string; name: string } }
  | { type: 'command'; id: string }
  | { type: 'shutdown' }

const PROTOCOL = 1
const RECONNECT_MIN_MS = 250
const RECONNECT_MAX_MS = 5000

class DaemonryClient {
  /** True when launched by daemonry. */
  readonly active: boolean
  readonly appId: string | null
  readonly appName: string | null

  private readonly socketPath: string | null
  private socket: Socket | null = null
  private connected = false
  private declared: DaemonryCommand[] = []
  private statusText: string | null = null
  private readonly commandHandlers: CommandHandler[] = []
  private readonly shutdownHandlers: ShutdownHandler[] = []
  private buffer = ''
  private retryMs = RECONNECT_MIN_MS
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false

  constructor() {
    this.socketPath = process.env['DAEMONRY_SOCKET'] || null
    this.active = this.socketPath !== null
    this.appId = process.env['DAEMONRY_APP_ID'] ?? null
    this.appName = process.env['DAEMONRY_APP_NAME'] ?? null
    if (this.active) this.connect()
  }

  /** Declare the commands daemonry offers in its menu. Replaces any earlier declaration. */
  commands(list: DaemonryCommand[]): this {
    this.declared = list.map((c) => (c.label ? { id: c.id, label: c.label } : { id: c.id }))
    this.send({ type: 'commands', commands: this.declared })
    return this
  }

  onCommand(handler: CommandHandler): this {
    this.commandHandlers.push(handler)
    return this
  }

  onShutdown(handler: ShutdownHandler): this {
    this.shutdownHandlers.push(handler)
    return this
  }

  /** One line of status shown next to the app in the menu and GUI. null clears it. */
  status(text: string | null): this {
    this.statusText = text
    this.send({ type: 'status', text: text ?? '' })
    return this
  }

  /** Disconnect and stop reconnecting. Only needed when the app wants to exit on its own. */
  close(): void {
    this.closed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.socket?.destroy()
    this.socket = null
    this.connected = false
  }

  private connect(): void {
    if (this.closed || this.socketPath === null) return
    const socket = createConnection(this.socketPath)
    this.socket = socket
    socket.setEncoding('utf8')
    socket.on('connect', () => {
      this.connected = true
      this.retryMs = RECONNECT_MIN_MS
      this.send({ type: 'hello', protocol: PROTOCOL, commands: this.declared, status: this.statusText ?? undefined })
    })
    socket.on('data', (chunk: string) => this.onData(chunk))
    socket.on('error', () => {
      // 'close' follows and schedules the retry
    })
    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null
        this.connected = false
      }
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect(): void {
    if (this.closed || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, RECONNECT_MAX_MS)
  }

  private send(message: object): void {
    if (!this.connected || this.socket === null) return
    this.socket.write(JSON.stringify(message) + '\n')
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.handle(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private handle(line: string): void {
    let message: RunnerMessage
    try {
      message = JSON.parse(line) as RunnerMessage
    } catch {
      return
    }
    switch (message.type) {
      case 'command':
        for (const handler of this.commandHandlers) handler(message.id)
        break
      case 'shutdown':
        this.shutdown()
        break
      case 'welcome':
        break
    }
  }

  private shutdown(): void {
    if (this.shutdownHandlers.length > 0) {
      for (const handler of this.shutdownHandlers) handler()
      return
    }
    if (process.listenerCount('SIGTERM') > 0) {
      process.emit('SIGTERM', 'SIGTERM')
      return
    }
    process.exit(0)
  }
}

export const daemonry: DaemonryClient = new DaemonryClient()
