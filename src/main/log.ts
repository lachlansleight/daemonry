// Daemonry's own log: console plus <logs>/daemonry.log. App logs are separate (milestone 3).

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let file: string | null = null

export function initLog(path: string): void {
  file = path
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    file = null
  }
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, extra?: unknown): void {
  const suffix = extra === undefined ? '' : ' ' + safeString(extra)
  const line = `${new Date().toISOString()} ${level} ${message}${suffix}`
  if (level === 'ERROR') console.error(line)
  else console.log(line)
  if (file) {
    try {
      appendFileSync(file, line + '\n')
    } catch {
      // never let logging take the app down
    }
  }
}

function safeString(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const log = {
  info: (message: string, extra?: unknown) => write('INFO', message, extra),
  warn: (message: string, extra?: unknown) => write('WARN', message, extra),
  error: (message: string, extra?: unknown) => write('ERROR', message, extra),
}
