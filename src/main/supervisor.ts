// Process supervisor: spawns apps through the user's shell in their own process
// group, tracks the state machine, and tears the whole tree down on stop.
// See DESIGN.md "Process lifecycle".

import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ActionResult } from '@shared/ipc'
import { ENV } from '@shared/protocol'
import type { AppId } from '@shared/types'
import { AppLogWriter } from './appLogs'
import { log } from './log'
import type { ShellEnv } from './shellEnv'
import type { Store } from './store'

/** Alive this long without crashing counts as running (until the socket says so sooner). */
const LAUNCH_SETTLE_MS = 3000

interface RunningApp {
  child: ChildProcess
  pid: number
  stopRequested: boolean
  settleTimer: NodeJS.Timeout | null
  killTimer: NodeJS.Timeout | null
  logWriter: AppLogWriter
  /** Resolves once the whole tree is gone (all stdio closed) and state is final. */
  finished: Promise<void>
}

const ok = (): ActionResult => ({ ok: true })
const fail = (error: string): ActionResult => ({ ok: false, error })

export class Supervisor {
  private readonly running = new Map<AppId, RunningApp>()

  constructor(
    private readonly store: Store,
    private readonly shellEnv: ShellEnv,
    private readonly logsDir: string,
  ) {}

  hasRunning(): boolean {
    return this.running.size > 0
  }

  async start(id: AppId): Promise<ActionResult> {
    const app = this.store.getApp(id)
    if (!app) return fail(`unknown app ${id}`)
    if (this.running.has(id)) return fail(`${app.name} is already running`)
    if (!app.command.trim()) return fail(`${app.name} has no launch command`)
    const cwd = await fs.stat(app.cwd).catch(() => null)
    if (!cwd?.isDirectory()) return this.failedToStart(id, `folder not found: ${app.cwd || '(empty)'}`)

    const env = {
      ...this.shellEnv.get(),
      ...app.env,
      [ENV.appId]: app.id,
      [ENV.appName]: app.name,
    }
    const logWriter = new AppLogWriter(join(this.logsDir, `${app.id}.log`))
    logWriter.marker(`start: ${app.command}  (cwd ${app.cwd})`)

    const win = process.platform === 'win32'
    const child = spawn(app.command, {
      cwd: app.cwd,
      env,
      shell: win ? true : this.shellEnv.shellPath(),
      // Own process group on POSIX so the whole tree can be signalled at once.
      detached: !win,
      windowsHide: true,
      // stdin stays open but silent: some tools (nodemon) misbehave on a closed stdin.
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const spawnError = await new Promise<Error | null>((resolve) => {
      child.once('spawn', () => resolve(null))
      child.once('error', (err) => resolve(err))
    })
    if (spawnError || !child.pid) {
      const message = spawnError?.message ?? 'spawn failed'
      logWriter.marker(`spawn failed: ${message}`)
      logWriter.close()
      return this.failedToStart(id, message)
    }

    const pid = child.pid
    let settle: (() => void) | null = null
    const finished = new Promise<void>((resolve) => {
      settle = resolve
    })
    const entry: RunningApp = {
      child,
      pid,
      stopRequested: false,
      settleTimer: null,
      killTimer: null,
      logWriter,
      finished,
    }
    this.running.set(id, entry)

    child.stdout?.on('data', (chunk: Buffer) => logWriter.write(chunk))
    child.stderr?.on('data', (chunk: Buffer) => logWriter.write(chunk))
    child.stdin?.on('error', () => undefined)
    child.on('error', (err) => log.warn(`${app.name}: child error`, err.message))
    // 'close' rather than 'exit': it waits for every holder of the pipes, so a
    // grandchild that outlives the shell still counts as running.
    child.once('close', (code, signal) => {
      this.onClose(id, code, signal)
      settle?.()
    })

    this.store.updateRuntime(id, {
      state: 'launching',
      pid,
      startedAt: Date.now(),
      exitCode: null,
      exitSignal: null,
      connected: false,
      commands: [],
      statusText: null,
      lastError: null,
    })
    entry.settleTimer = setTimeout(() => {
      entry.settleTimer = null
      if (this.store.getRuntime(id).state === 'launching') this.store.updateRuntime(id, { state: 'running' })
    }, LAUNCH_SETTLE_MS)

    log.info(`started ${app.name} (pid ${pid}): ${app.command}`)
    return ok()
  }

  async stop(id: AppId): Promise<ActionResult> {
    const entry = this.running.get(id)
    const name = this.store.getApp(id)?.name ?? id
    if (!entry) return fail(`${name} is not running`)

    if (!entry.stopRequested) {
      entry.stopRequested = true
      this.store.updateRuntime(id, { state: 'stopping' })
      const graceMs = this.store.getApp(id)?.stopGraceMs ?? this.store.getConfig().defaultStopGraceMs
      log.info(`stopping ${name} (pid ${entry.pid}), grace ${graceMs}ms`)
      // Milestone 4: send {"type":"shutdown"} over the socket before signalling.
      if (process.platform === 'win32') {
        // No SIGTERM on Windows. Until the socket exists there is no graceful path.
        this.forceKill(entry)
      } else {
        signalGroup(entry.pid, 'SIGTERM')
        entry.killTimer = setTimeout(() => {
          entry.killTimer = null
          log.warn(`${name}: grace period expired, killing the process group`)
          this.forceKill(entry)
        }, graceMs)
      }
    }
    await entry.finished
    return ok()
  }

  async restart(id: AppId): Promise<ActionResult> {
    if (this.running.has(id)) {
      const stopped = await this.stop(id)
      if (!stopped.ok) return stopped
    }
    return this.start(id)
  }

  sendCommand(id: AppId, commandId: string): Promise<ActionResult> {
    const name = this.store.getApp(id)?.name ?? id
    return Promise.resolve(fail(`cannot send "${commandId}" to ${name}: the app protocol arrives in milestone 4`))
  }

  async startAll(): Promise<ActionResult> {
    return this.startMany(this.store.getConfig().apps.map((a) => a.id))
  }

  /** Apps flagged autostart, run once at daemonry startup. */
  async startAutostart(): Promise<ActionResult> {
    const ids = this.store
      .getConfig()
      .apps.filter((a) => a.autostart)
      .map((a) => a.id)
    if (ids.length > 0) log.info(`autostarting ${ids.length} app(s)`)
    return this.startMany(ids)
  }

  async stopAll(): Promise<ActionResult> {
    const results = await Promise.all([...this.running.keys()].map((id) => this.stop(id)))
    const errors = results.filter((r) => !r.ok).map((r) => r.error)
    return errors.length ? fail(errors.join('; ')) : ok()
  }

  private async startMany(ids: AppId[]): Promise<ActionResult> {
    const errors: string[] = []
    for (const id of ids) {
      if (this.running.has(id)) continue
      const result = await this.start(id)
      if (!result.ok && result.error) errors.push(result.error)
    }
    return errors.length ? fail(errors.join('; ')) : ok()
  }

  private failedToStart(id: AppId, message: string): ActionResult {
    log.warn(`${this.store.getApp(id)?.name ?? id}: failed to start: ${message}`)
    this.store.updateRuntime(id, { state: 'crashed', pid: null, startedAt: null, lastError: message })
    return fail(message)
  }

  private onClose(id: AppId, code: number | null, signal: NodeJS.Signals | null): void {
    const entry = this.running.get(id)
    if (!entry) return
    if (entry.settleTimer) clearTimeout(entry.settleTimer)
    if (entry.killTimer) clearTimeout(entry.killTimer)
    this.running.delete(id)

    const name = this.store.getApp(id)?.name ?? id
    const requested = entry.stopRequested
    const state = requested || code === 0 ? 'inactive' : 'crashed'
    const how = requested ? 'stopped' : state === 'crashed' ? 'crashed' : 'exited'
    const detail = signal ? `signal ${signal}` : `code ${code}`
    entry.logWriter.marker(`${how}: ${detail}`)
    entry.logWriter.close()
    log.info(`${name} ${how} (${detail})`)

    this.store.updateRuntime(id, {
      state,
      pid: null,
      startedAt: null,
      exitCode: code,
      exitSignal: signal,
      connected: false,
      commands: [],
      statusText: null,
    })
  }

  private forceKill(entry: RunningApp): void {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(entry.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on(
        'error',
        (err) => log.warn('taskkill failed', err.message),
      )
    } else {
      signalGroup(entry.pid, 'SIGKILL')
    }
  }
}

/** Signal the whole process group; fall back to the pid alone if the group is gone. */
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}
