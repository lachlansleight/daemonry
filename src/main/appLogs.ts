// App output: rotated log files on disk plus an in-memory tail per app that the GUI
// shows live. The file keeps raw bytes; the tail keeps cleaned lines.

import { EventEmitter } from 'node:events'
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  type WriteStream,
} from 'node:fs'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { LOG_TAIL_LINES, type AppId, type LogKind, type LogLine } from '@shared/types'
import { log } from './log'

export const LOG_MAX_BYTES = Number(process.env['DAEMONRY_LOG_MAX_BYTES']) || 5 * 1024 * 1024
/** Current file plus this many rotated ones. */
export const LOG_KEEP = 3
const PRIME_BYTES = 64 * 1024
const MARKER_PREFIX = '[daemonry '
// CSI sequences (colours, cursor moves) and OSC sequences (titles, hyperlinks).
const ANSI = /\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g

export function logFileFor(logsDir: string, id: AppId): string {
  return join(logsDir, `${id}.log`)
}

function rotatedFile(logsDir: string, id: AppId, index: number): string {
  return join(logsDir, `${id}.${index}.log`)
}

export function deleteLogFiles(logsDir: string, id: AppId): void {
  const files = [logFileFor(logsDir, id)]
  for (let i = 1; i < LOG_KEEP; i++) files.push(rotatedFile(logsDir, id, i))
  for (const file of files) {
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch (err) {
      log.warn(`could not delete ${file}`, err)
    }
  }
}

/** Strip ANSI escapes and keep only the final state of a line that used \r to redraw. */
export function cleanLine(raw: string): string {
  const text = raw.replace(ANSI, '')
  const cr = text.lastIndexOf('\r')
  return cr === -1 ? text : text.slice(cr + 1)
}

/** In-memory tails for every app, kept across runs. Emits 'lines' (id, LogLine[]). */
export class LogStore extends EventEmitter {
  private readonly tails = new Map<AppId, LogLine[]>()
  private readonly seqs = new Map<AppId, number>()

  tail(id: AppId): LogLine[] {
    return this.tails.get(id) ?? []
  }

  append(id: AppId, kind: LogKind, text: string, t = Date.now(), emit = true): void {
    const seq = (this.seqs.get(id) ?? 0) + 1
    this.seqs.set(id, seq)
    const line: LogLine = { seq, t, kind, text }
    const tail = this.tails.get(id) ?? []
    tail.push(line)
    if (tail.length > LOG_TAIL_LINES) tail.splice(0, tail.length - LOG_TAIL_LINES)
    this.tails.set(id, tail)
    if (emit) this.emit('lines', id, [line])
  }

  /** Clears the in-memory tail only; the file is untouched. */
  clear(id: AppId): void {
    this.tails.set(id, [])
  }

  forget(id: AppId): void {
    this.tails.delete(id)
    this.seqs.delete(id)
  }

  /** Seed the tail from the end of an existing log file, so history survives a restart. */
  primeFromFile(id: AppId, file: string): void {
    try {
      if (!existsSync(file)) return
      const { size, mtimeMs } = statSync(file)
      if (size === 0) return
      const length = Math.min(size, PRIME_BYTES)
      const buffer = Buffer.alloc(length)
      const fd = openSync(file, 'r')
      try {
        readSync(fd, buffer, 0, length, size - length)
      } finally {
        closeSync(fd)
      }
      let text = buffer.toString('utf8')
      // Drop the partial first line when we started mid-file.
      if (size > length) text = text.slice(text.indexOf('\n') + 1)
      const lines = text.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      for (const raw of lines) {
        const marker = parseMarker(raw)
        if (marker) this.append(id, 'sys', marker.text, marker.t, false)
        else this.append(id, 'out', cleanLine(raw), mtimeMs, false)
      }
    } catch (err) {
      log.warn(`could not read log tail for ${id}`, err)
    }
  }
}

function parseMarker(raw: string): { t: number; text: string } | null {
  if (!raw.startsWith(MARKER_PREFIX)) return null
  const end = raw.indexOf('] ')
  if (end === -1) return null
  const t = Date.parse(raw.slice(MARKER_PREFIX.length, end))
  return { t: Number.isFinite(t) ? t : Date.now(), text: raw.slice(end + 2) }
}

/** One run's writer: appends raw output to the rotated file and emits cleaned lines. */
export class AppLogWriter {
  readonly file: string
  private stream: WriteStream | null = null
  private size = 0
  private readonly decoders = { out: new StringDecoder('utf8'), err: new StringDecoder('utf8') }
  private readonly partial = { out: '', err: '' }

  constructor(
    private readonly logsDir: string,
    private readonly id: AppId,
    private readonly onLine: (kind: LogKind, text: string) => void,
  ) {
    this.file = logFileFor(logsDir, id)
    this.open()
  }

  write(kind: 'out' | 'err', chunk: Buffer): void {
    this.writeRaw(chunk)
    const text = this.partial[kind] + this.decoders[kind].write(chunk)
    const parts = text.split('\n')
    this.partial[kind] = parts.pop() ?? ''
    for (const part of parts) this.onLine(kind, cleanLine(part))
  }

  marker(text: string): void {
    this.writeRaw(Buffer.from(`\n${MARKER_PREFIX}${new Date().toISOString()}] ${text}\n`))
    this.onLine('sys', text)
  }

  close(): void {
    for (const kind of ['out', 'err'] as const) {
      const rest = this.partial[kind] + this.decoders[kind].end()
      this.partial[kind] = ''
      if (rest) this.onLine(kind, cleanLine(rest))
    }
    this.stream?.end()
    this.stream = null
  }

  private open(): void {
    try {
      mkdirSync(this.logsDir, { recursive: true })
      this.size = existsSync(this.file) ? statSync(this.file).size : 0
      this.stream = createWriteStream(this.file, { flags: 'a' })
      this.stream.on('error', (err) => {
        log.error(`app log unwritable: ${this.file}`, err.message)
        this.stream = null
      })
    } catch (err) {
      log.error(`app log unopenable: ${this.file}`, err)
      this.stream = null
    }
  }

  private writeRaw(chunk: Buffer): void {
    if (this.size + chunk.length > LOG_MAX_BYTES && this.size > 0) this.rotate()
    this.stream?.write(chunk)
    this.size += chunk.length
  }

  /** id.1.log becomes id.2.log, id.log becomes id.1.log, and a fresh id.log is opened. */
  private rotate(): void {
    this.stream?.end()
    this.stream = null
    try {
      for (let i = LOG_KEEP - 1; i >= 1; i--) {
        const from = i === 1 ? this.file : rotatedFile(this.logsDir, this.id, i - 1)
        const to = rotatedFile(this.logsDir, this.id, i)
        if (!existsSync(from)) continue
        if (existsSync(to)) unlinkSync(to)
        renameSync(from, to)
      }
    } catch (err) {
      log.error(`log rotation failed for ${this.id}`, err)
    }
    this.open()
  }
}
