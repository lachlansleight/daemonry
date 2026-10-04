// Single source of truth for config and runtime state. Emits 'change' with the new Snapshot.

import { EventEmitter } from 'node:events'
import {
  emptyRuntime,
  type AppConfig,
  type AppId,
  type AppRuntime,
  type DaemonryConfig,
  type Paths,
  type Snapshot,
} from '@shared/types'
import { saveConfig } from './config'
import { log } from './log'

export class Store extends EventEmitter {
  private runtime = new Map<AppId, AppRuntime>()

  constructor(
    private config: DaemonryConfig,
    private readonly paths: Paths,
  ) {
    super()
    for (const app of config.apps) this.runtime.set(app.id, emptyRuntime(app.id))
  }

  snapshot(): Snapshot {
    const runtime: Record<AppId, AppRuntime> = {}
    for (const app of this.config.apps) runtime[app.id] = this.runtime.get(app.id) ?? emptyRuntime(app.id)
    return {
      config: structuredClone(this.config),
      runtime,
      paths: this.paths,
      platform: process.platform,
    }
  }

  getConfig(): DaemonryConfig {
    return this.config
  }

  getApp(id: AppId): AppConfig | undefined {
    return this.config.apps.find((a) => a.id === id)
  }

  getRuntime(id: AppId): AppRuntime {
    return this.runtime.get(id) ?? emptyRuntime(id)
  }

  upsertApp(app: AppConfig): void {
    const index = this.config.apps.findIndex((a) => a.id === app.id)
    if (index === -1) {
      this.config.apps.push(app)
      this.runtime.set(app.id, emptyRuntime(app.id))
      log.info(`app added: ${app.name} (${app.id})`)
    } else {
      this.config.apps[index] = app
      log.info(`app updated: ${app.name} (${app.id})`)
    }
    this.persist()
  }

  deleteApp(id: AppId): void {
    const before = this.config.apps.length
    this.config.apps = this.config.apps.filter((a) => a.id !== id)
    this.runtime.delete(id)
    if (this.config.apps.length !== before) log.info(`app deleted: ${id}`)
    this.persist()
  }

  setLaunchAtLogin(value: boolean): void {
    this.config.launchAtLogin = value
    this.persist()
  }

  setDefaultStopGrace(ms: number): void {
    this.config.defaultStopGraceMs = ms
    this.persist()
  }

  /** Runtime changes are not persisted; they only broadcast. */
  updateRuntime(id: AppId, patch: Partial<AppRuntime>): void {
    const current = this.runtime.get(id) ?? emptyRuntime(id)
    this.runtime.set(id, { ...current, ...patch, id })
    this.emitChange()
  }

  private persist(): void {
    try {
      saveConfig(this.paths.configFile, this.config)
    } catch (err) {
      log.error('failed to save config', err)
    }
    this.emitChange()
  }

  private emitChange(): void {
    this.emit('change', this.snapshot())
  }
}
