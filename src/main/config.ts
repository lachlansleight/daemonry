// Config file: <userData>/config.json, written atomically.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  DEFAULT_CONFIG,
  DEFAULT_STOP_GRACE_MS,
  newAppConfig,
  type AppConfig,
  type DaemonryConfig,
} from '@shared/types'
import { log } from './log'

export function loadConfig(file: string): { config: DaemonryConfig; existed: boolean } {
  if (!existsSync(file)) return { config: structuredClone(DEFAULT_CONFIG), existed: false }
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return { config: normaliseConfig(raw), existed: true }
  } catch (err) {
    log.error(`config unreadable, starting fresh: ${file}`, err)
    try {
      renameSync(file, `${file}.broken-${Date.now()}`)
    } catch {
      // nothing more we can do
    }
    return { config: structuredClone(DEFAULT_CONFIG), existed: false }
  }
}

export function saveConfig(file: string, config: DaemonryConfig): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normaliseConfig(raw: unknown): DaemonryConfig {
  const r = isRecord(raw) ? raw : {}
  const apps = Array.isArray(r.apps) ? r.apps.map(normaliseApp).filter((a) => a !== null) : []
  const seen = new Set<string>()
  const unique = apps.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
  return {
    version: 1,
    launchAtLogin: r.launchAtLogin === true,
    defaultStopGraceMs: positiveInt(r.defaultStopGraceMs) ?? DEFAULT_STOP_GRACE_MS,
    apps: unique,
  }
}

export function normaliseApp(raw: unknown): AppConfig | null {
  if (!isRecord(raw)) return null
  const env: Record<string, string> = {}
  if (isRecord(raw.env)) {
    for (const [k, v] of Object.entries(raw.env)) {
      const key = k.trim()
      if (key && typeof v === 'string') env[key] = v
    }
  }
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined
  return newAppConfig({
    id,
    name: typeof raw.name === 'string' ? raw.name.trim() : '',
    cwd: typeof raw.cwd === 'string' ? raw.cwd.trim() : '',
    command: typeof raw.command === 'string' ? raw.command.trim() : '',
    autostart: raw.autostart === true,
    env,
    stopGraceMs: positiveInt(raw.stopGraceMs),
  })
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}
