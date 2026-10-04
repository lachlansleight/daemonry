// Shared data model. The main process owns the truth; the renderer only views it.

export type AppId = string

/** Mirrors NodeJS.Platform without needing Node types in the renderer. */
export type Platform = 'darwin' | 'win32' | 'linux' | 'aix' | 'android' | 'freebsd' | 'haiku' | 'openbsd' | 'sunos' | 'cygwin' | 'netbsd'

export type AppState = 'inactive' | 'launching' | 'running' | 'stopping' | 'crashed'

export interface CommandDecl {
  id: string
  label?: string
}

export interface AppConfig {
  /** 8 random base36 chars, stable for the app's lifetime. */
  id: AppId
  name: string
  /** Absolute path to the app folder; also the working directory. */
  cwd: string
  /** One shell command, e.g. "npm start -- --quiet". */
  command: string
  /** Start when daemonry starts. */
  autostart: boolean
  /** Layered on top of the captured shell environment. */
  env: Record<string, string>
  /** null means use DaemonryConfig.defaultStopGraceMs. */
  stopGraceMs: number | null
}

export interface DaemonryConfig {
  version: 1
  launchAtLogin: boolean
  defaultStopGraceMs: number
  apps: AppConfig[]
}

export interface AppRuntime {
  id: AppId
  state: AppState
  pid: number | null
  startedAt: number | null
  exitCode: number | null
  exitSignal: string | null
  /** The app's socket client is connected. */
  connected: boolean
  /** Declared by the app over the socket. */
  commands: CommandDecl[]
  /** Optional one-line status reported by the app. */
  statusText: string | null
  /** Why the last start failed or the app crashed, when daemonry knows. */
  lastError: string | null
}

/** What daemonry learned from the user's login shell. */
export interface ShellEnvSummary {
  shell: string
  ok: boolean
  error: string | null
  capturedAt: number | null
  nodePath: string | null
  pathEntries: string[]
  varCount: number
}

export const EMPTY_SHELL_ENV: ShellEnvSummary = {
  shell: '',
  ok: false,
  error: null,
  capturedAt: null,
  nodePath: null,
  pathEntries: [],
  varCount: 0,
}

export interface Paths {
  configFile: string
  logsDir: string
}

/** Everything the renderer needs, broadcast whole on every change. */
export interface Snapshot {
  config: DaemonryConfig
  runtime: Record<AppId, AppRuntime>
  paths: Paths
  platform: Platform
  shellEnv: ShellEnvSummary
}

export const DEFAULT_STOP_GRACE_MS = 10_000

export const DEFAULT_CONFIG: DaemonryConfig = {
  version: 1,
  launchAtLogin: false,
  defaultStopGraceMs: DEFAULT_STOP_GRACE_MS,
  apps: [],
}

export function emptyRuntime(id: AppId): AppRuntime {
  return {
    id,
    state: 'inactive',
    pid: null,
    startedAt: null,
    exitCode: null,
    exitSignal: null,
    connected: false,
    commands: [],
    statusText: null,
    lastError: null,
  }
}

export function newAppConfig(partial: Partial<AppConfig> = {}): AppConfig {
  return {
    id: partial.id ?? randomId(),
    name: partial.name ?? '',
    cwd: partial.cwd ?? '',
    command: partial.command ?? '',
    autostart: partial.autostart ?? false,
    env: partial.env ?? {},
    stopGraceMs: partial.stopGraceMs ?? null,
  }
}

export function randomId(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

export function isActive(state: AppState): boolean {
  return state === 'launching' || state === 'running' || state === 'stopping'
}
