// In-memory stand-in for the main process, used only when previewing in a browser.

import type { ActionResult, DaemonryApi, Route } from '@shared/ipc'
import { emptyRuntime, newAppConfig, type AppId, type AppRuntime, type LogLine, type Snapshot } from '@shared/types'

export function createMockApi(): DaemonryApi {
  const apps = [
    newAppConfig({
      id: 'botchi01',
      name: 'botchi-server',
      cwd: '/Users/lachlan/Development/LiquidCity/Studio2026/botchi/botchi-server',
      command: 'npm run dev',
      autostart: true,
      env: { PORT: '4100' },
    }),
    newAppConfig({
      id: 'reachy01',
      name: 'reachy-idle',
      cwd: '/Users/lachlan/Development/LiquidCity/reachy-mini/reachy-idle',
      command: 'npm start -- --quiet',
      autostart: true,
      stopGraceMs: 20_000,
    }),
    newAppConfig({
      id: 'bridge01',
      name: 'agent-bridge',
      cwd: '/Users/lachlan/Development/Lachlan/claude-code-wrapper/plugin',
      command: 'npm start',
      env: { BRIDGE_PORT: '8787' },
    }),
  ]

  const snapshot: Snapshot = {
    config: { version: 1, launchAtLogin: true, defaultStopGraceMs: 10_000, apps },
    runtime: {
      botchi01: {
        ...emptyRuntime('botchi01'),
        state: 'running',
        pid: 48213,
        startedAt: Date.now() - 2 * 3600_000 - 14 * 60_000,
        connected: true,
        commands: [{ id: 'reload-prompts', label: 'Reload prompts' }, { id: 'dump-state', label: 'Dump state' }],
        statusText: '3 clients',
      },
      reachy01: emptyRuntime('reachy01'),
      bridge01: { ...emptyRuntime('bridge01'), state: 'crashed', exitCode: 1, lastError: null },
    },
    paths: {
      configFile: '/Users/lachlan/Library/Application Support/daemonry/config.json',
      logsDir: '/Users/lachlan/Library/Logs/daemonry',
    },
    platform: 'darwin',
    packaged: true,
    loginItem: { openAtLogin: true, status: 'requires-approval' },
    shellEnv: {
      shell: '/bin/zsh',
      ok: true,
      error: null,
      capturedAt: Date.now(),
      nodePath: '/Users/lachlan/.nvm/versions/node/v23.11.0/bin/node',
      pathEntries: ['/Users/lachlan/.nvm/versions/node/v23.11.0/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'],
      varCount: 142,
    },
  }

  const logs = new Map<AppId, LogLine[]>()
  const logListeners = new Set<(id: AppId, lines: LogLine[]) => void>()
  let seq = 0
  const pushLog = (id: AppId, kind: LogLine['kind'], text: string, emit = true): void => {
    const line: LogLine = { seq: ++seq, t: Date.now(), kind, text }
    logs.set(id, [...(logs.get(id) ?? []), line].slice(-2000))
    if (emit) logListeners.forEach((cb) => cb(id, [line]))
  }
  pushLog('botchi01', 'sys', 'start: npm run dev  (cwd /Users/lachlan/Development/LiquidCity/Studio2026/botchi/botchi-server)', false)
  pushLog('botchi01', 'out', '> botchi-server@0.1.0 dev', false)
  pushLog('botchi01', 'out', '> nodemon --watch src --ext ts,json --exec "npm run bundle && npm run start"', false)
  pushLog('botchi01', 'err', '[nodemon] 3.1.4', false)
  pushLog('botchi01', 'err', '[nodemon] starting `npm run bundle && npm run start`', false)
  pushLog('botchi01', 'out', 'Server listening on http://localhost:4100', false)
  pushLog('bridge01', 'sys', 'start: npm start  (cwd /Users/lachlan/Development/Lachlan/claude-code-wrapper/plugin)', false)
  pushLog('bridge01', 'err', '[bridge:fatal] BRIDGE_TOKEN is not set.', false)
  pushLog('bridge01', 'sys', 'crashed: code 1', false)
  setInterval(() => {
    if (snapshot.runtime['botchi01']?.state === 'running') pushLog('botchi01', 'out', `GET /api/state 200 ${Math.round(Math.random() * 40)}ms`)
  }, 1500)

  const listeners = new Set<(s: Snapshot) => void>()
  const navListeners = new Set<(r: Route) => void>()
  const emit = (): void => listeners.forEach((cb) => cb(structuredClone(snapshot)))
  const patch = (id: AppId, p: Partial<AppRuntime>): void => {
    snapshot.runtime[id] = { ...(snapshot.runtime[id] ?? emptyRuntime(id)), ...p }
    emit()
  }
  const ok: ActionResult = { ok: true }

  return {
    getSnapshot: async () => structuredClone(snapshot),
    onSnapshot: (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    onNavigate: (cb) => (navListeners.add(cb), () => navListeners.delete(cb)),

    saveApp: async (app) => {
      const i = snapshot.config.apps.findIndex((a) => a.id === app.id)
      if (i === -1) {
        snapshot.config.apps.push(app)
        snapshot.runtime[app.id] = emptyRuntime(app.id)
      } else snapshot.config.apps[i] = app
      emit()
    },
    deleteApp: async (id) => {
      snapshot.config.apps = snapshot.config.apps.filter((a) => a.id !== id)
      delete snapshot.runtime[id]
      emit()
    },
    setLaunchAtLogin: async (v) => {
      snapshot.config.launchAtLogin = v
      snapshot.loginItem = { openAtLogin: v, status: v ? 'requires-approval' : 'not-registered' }
      emit()
    },
    openLoginItemsSettings: async () => undefined,
    setDefaultStopGrace: async (ms) => ((snapshot.config.defaultStopGraceMs = ms), emit()),
    refreshShellEnv: async () => {
      snapshot.shellEnv = { ...snapshot.shellEnv, capturedAt: Date.now() }
      emit()
      return snapshot.shellEnv
    },

    startApp: async (id) => {
      if (id === 'bridge01') return { ok: false, error: 'BRIDGE_TOKEN is not set (mock failure)' }
      patch(id, { state: 'launching', exitCode: null, exitSignal: null, lastError: null })
      setTimeout(() => patch(id, { state: 'running', pid: 10000 + Math.floor(Math.random() * 50000), startedAt: Date.now() }), 1200)
      return ok
    },
    stopApp: async (id) => {
      patch(id, { state: 'stopping' })
      setTimeout(() => patch(id, { ...emptyRuntime(id) }), 800)
      return ok
    },
    restartApp: async (id) => {
      patch(id, { state: 'stopping' })
      setTimeout(() => patch(id, { ...emptyRuntime(id), state: 'launching' }), 800)
      setTimeout(() => patch(id, { state: 'running', pid: 12345, startedAt: Date.now() }), 2000)
      return ok
    },
    sendCommand: async (id, commandId) => {
      patch(id, { statusText: `ran ${commandId}` })
      return ok
    },

    chooseFolder: async () => '/Users/lachlan/Development/example-app',
    revealInFolder: async () => undefined,

    getLogTail: async (id) => logs.get(id) ?? [],
    onLogLines: (cb) => (logListeners.add(cb), () => logListeners.delete(cb)),
    clearLogs: async (id) => {
      logs.set(id, [])
    },
  }
}
