// Renderer <-> main contract. The preload exposes DaemonryApi as window.daemonry.

import type { AppConfig, AppId, LogLine, ShellEnvSummary, Snapshot } from './types'

export type Route =
  | { page: 'home' }
  | { page: 'settings' }
  | { page: 'new' }
  | { page: 'app'; id: AppId; section?: 'status' | 'logs' | 'config' }

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface DaemonryApi {
  getSnapshot(): Promise<Snapshot>
  onSnapshot(cb: (snapshot: Snapshot) => void): () => void
  onNavigate(cb: (route: Route) => void): () => void

  saveApp(app: AppConfig): Promise<void>
  deleteApp(id: AppId): Promise<void>
  setLaunchAtLogin(value: boolean): Promise<void>
  setDefaultStopGrace(ms: number): Promise<void>
  refreshShellEnv(): Promise<ShellEnvSummary>

  startApp(id: AppId): Promise<ActionResult>
  stopApp(id: AppId): Promise<ActionResult>
  restartApp(id: AppId): Promise<ActionResult>
  sendCommand(id: AppId, commandId: string): Promise<ActionResult>

  chooseFolder(initial?: string): Promise<string | null>
  revealInFolder(path: string): Promise<void>

  getLogTail(id: AppId): Promise<LogLine[]>
  onLogLines(cb: (id: AppId, lines: LogLine[]) => void): () => void
  clearLogs(id: AppId): Promise<void>
}

export const IPC = {
  getSnapshot: 'snapshot:get',
  snapshot: 'snapshot:changed',
  navigate: 'ui:navigate',
  saveApp: 'config:saveApp',
  deleteApp: 'config:deleteApp',
  setLaunchAtLogin: 'config:setLaunchAtLogin',
  setDefaultStopGrace: 'config:setDefaultStopGrace',
  refreshShellEnv: 'shellEnv:refresh',
  startApp: 'app:start',
  stopApp: 'app:stop',
  restartApp: 'app:restart',
  sendCommand: 'app:sendCommand',
  chooseFolder: 'dialog:chooseFolder',
  revealInFolder: 'shell:revealInFolder',
  getLogTail: 'logs:tail',
  logLines: 'logs:lines',
  clearLogs: 'logs:clear',
} as const
