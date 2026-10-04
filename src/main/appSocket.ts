// One listening socket per running app. Daemonry listens, the app's client connects,
// newline-delimited JSON flows both ways. See DESIGN.md "App protocol".

import { existsSync, unlinkSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import type { AppMessage, RunnerMessage } from '@shared/protocol'
import type { CommandDecl } from '@shared/types'
import { log } from './log'

export interface AppSocketHandlers {
  onHello(commands: CommandDecl[], status: string | null): void
  onCommands(commands: CommandDecl[]): void
  onStatus(text: string | null): void
  onDisconnect(): void
}

const MAX_LINE_BYTES = 64 * 1024
const MAX_COMMANDS = 50
const MAX_ID_LENGTH = 64
const MAX_LABEL_LENGTH = 80
const MAX_STATUS_LENGTH = 200

export class AppSocketServer {
  private server: Server | null = null
  private client: Socket | null = null
  private buffer = ''

  constructor(
    readonly path: string,
    private readonly app: { id: string; name: string },
    private readonly handlers: AppSocketHandlers,
  ) {}

  get connected(): boolean {
    return this.client !== null && !this.client.destroyed
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      // A stale socket file from a crashed daemonry would block listen().
      if (process.platform !== 'win32' && existsSync(this.path)) {
        try {
          unlinkSync(this.path)
        } catch {
          // listen() will report it
        }
      }
      const server = createServer((socket) => this.accept(socket))
      server.on('error', (err) => {
        if (this.server) log.warn(`${this.app.name}: socket server error`, err.message)
        else reject(err)
      })
      server.listen(this.path, () => {
        this.server = server
        resolve()
      })
    })
  }

  send(message: RunnerMessage): boolean {
    if (!this.connected || !this.client) return false
    this.client.write(JSON.stringify(message) + '\n')
    return true
  }

  close(): void {
    this.client?.destroy()
    this.client = null
    this.server?.close()
    this.server = null
    if (process.platform !== 'win32') {
      try {
        unlinkSync(this.path)
      } catch {
        // already gone
      }
    }
  }

  private accept(socket: Socket): void {
    if (this.client) {
      // A watcher restarted the app before the old process let go; newest wins.
      log.info(`${this.app.name}: new client connection replaces the previous one`)
      this.client.destroy()
    }
    this.client = socket
    this.buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.onData(socket, chunk))
    socket.on('error', (err) => log.warn(`${this.app.name}: client socket error`, err.message))
    socket.on('close', () => {
      if (this.client !== socket) return
      this.client = null
      this.handlers.onDisconnect()
    })
  }

  private onData(socket: Socket, chunk: string): void {
    this.buffer += chunk
    if (this.buffer.length > MAX_LINE_BYTES) {
      log.warn(`${this.app.name}: oversized protocol message, dropping the connection`)
      this.buffer = ''
      socket.destroy()
      return
    }
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.handleLine(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      log.warn(`${this.app.name}: ignoring non-JSON protocol line`)
      return
    }
    const message = parseAppMessage(raw)
    if (!message) {
      log.warn(`${this.app.name}: ignoring unknown protocol message`, line.slice(0, 120))
      return
    }
    switch (message.type) {
      case 'hello':
        this.send({ type: 'welcome', app: { id: this.app.id, name: this.app.name } })
        this.handlers.onHello(message.commands ?? [], message.status ?? null)
        break
      case 'commands':
        this.handlers.onCommands(message.commands)
        break
      case 'status':
        this.handlers.onStatus(message.text || null)
        break
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate and tidy a declared command list: strings only, trimmed, capped, unique ids. */
export function normaliseCommands(raw: unknown): CommandDecl[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CommandDecl[] = []
  for (const item of raw) {
    const id = isRecord(item) && typeof item['id'] === 'string' ? item['id'].trim().slice(0, MAX_ID_LENGTH) : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label =
      isRecord(item) && typeof item['label'] === 'string' ? item['label'].trim().slice(0, MAX_LABEL_LENGTH) : undefined
    out.push(label ? { id, label } : { id })
    if (out.length >= MAX_COMMANDS) break
  }
  return out
}

export function parseAppMessage(raw: unknown): AppMessage | null {
  if (!isRecord(raw) || typeof raw['type'] !== 'string') return null
  switch (raw['type']) {
    case 'hello': {
      const protocol = typeof raw['protocol'] === 'number' ? raw['protocol'] : 1
      const status = typeof raw['status'] === 'string' ? raw['status'].slice(0, MAX_STATUS_LENGTH) : undefined
      return { type: 'hello', protocol, commands: normaliseCommands(raw['commands']), status }
    }
    case 'commands':
      return { type: 'commands', commands: normaliseCommands(raw['commands']) }
    case 'status':
      return { type: 'status', text: typeof raw['text'] === 'string' ? raw['text'].slice(0, MAX_STATUS_LENGTH) : '' }
    default:
      return null
  }
}
