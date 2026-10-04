import { app } from 'electron'
import { join } from 'node:path'
import type { Paths } from '@shared/types'
import { loadConfig } from './config'
import { applyLoginItem, registerIpc } from './ipc'
import { initLog, log } from './log'
import { ShellEnv } from './shellEnv'
import { Store } from './store'
import { Supervisor } from './supervisor'
import { TrayController } from './tray'
import { markQuitting, openWindow } from './window'

// Dev affordances, all opt-in through the environment:
//   DAEMONRY_USER_DATA    separate profile (config, logs, single-instance lock)
//   DAEMONRY_INSPECT_PORT open the Node inspector on the main process and expose
//                         globalThis.__daemonry = { app, store, supervisor } for scripts/dev-eval.mjs
//   DAEMONRY_KEEP_DOCK    skip hiding the dock icon
const userDataOverride = process.env['DAEMONRY_USER_DATA']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
  app.setPath('logs', join(userDataOverride, 'logs'))
  app.setPath('sessionData', join(userDataOverride, 'session'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => openWindow())
  void app.whenReady().then(main)
}

function main(): void {
  if (process.platform === 'darwin' && !process.env['DAEMONRY_KEEP_DOCK']) app.dock?.hide()

  const paths: Paths = {
    configFile: join(app.getPath('userData'), 'config.json'),
    logsDir: app.getPath('logs'),
  }
  initLog(join(paths.logsDir, 'daemonry.log'))
  log.info(`daemonry ${app.getVersion()} starting`, { packaged: app.isPackaged, config: paths.configFile })

  const { config, existed } = loadConfig(paths.configFile)
  const store = new Store(config, paths)
  const shellEnv = new ShellEnv()
  const supervisor = new Supervisor(store, shellEnv, paths.logsDir)
  const tray = new TrayController(store, supervisor, openWindow)

  registerIpc(store, supervisor, shellEnv)
  tray.init()
  if (config.launchAtLogin) applyLoginItem(true)
  openInspectorIfRequested({ store, supervisor })

  // First run: no config yet, so show the GUI.
  if (!existed) openWindow({ page: 'home' })

  // Capture the login shell environment before anything is launched with it.
  void shellEnv
    .capture()
    .then((summary) => {
      store.setShellEnv(summary)
      return supervisor.startAutostart()
    })
    .then((result) => {
      if (!result.ok) log.warn('autostart finished with errors', result.error)
    })

  // Quit stops every app first and waits for them, then quits for real.
  let quitReady = false
  app.on('before-quit', (event) => {
    markQuitting()
    if (quitReady) return
    if (!supervisor.hasRunning()) {
      quitReady = true
      tray.dispose()
      return
    }
    event.preventDefault()
    log.info('quit requested: stopping all apps')
    void supervisor.stopAll().finally(() => {
      quitReady = true
      tray.dispose()
      app.quit()
    })
  })
}

function openInspectorIfRequested(handles: Record<string, unknown>): void {
  const port = Number(process.env['DAEMONRY_INSPECT_PORT'])
  if (!port || app.isPackaged) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const inspector = require('node:inspector') as typeof import('node:inspector')
  inspector.open(port, '127.0.0.1')
  ;(globalThis as Record<string, unknown>)['__daemonry'] = { app, ...handles }
  log.info(`inspector open on 127.0.0.1:${port}; globalThis.__daemonry exposed`)
}

// A menu bar app keeps running with no windows open.
app.on('window-all-closed', () => {
  /* intentionally empty */
})
