import { app } from 'electron'
import { join } from 'node:path'
import type { Paths } from '@shared/types'
import { loadConfig } from './config'
import { applyLoginItem, registerIpc } from './ipc'
import { initLog, log } from './log'
import { Store } from './store'
import { Supervisor } from './supervisor'
import { TrayController } from './tray'
import { markQuitting, openWindow } from './window'

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
  const supervisor = new Supervisor(store)
  const tray = new TrayController(store, supervisor, openWindow)

  registerIpc(store, supervisor)
  tray.init()
  if (config.launchAtLogin) applyLoginItem(true)

  // First run: no config yet, so show the GUI.
  if (!existed) openWindow({ page: 'home' })

  // Milestone 2: supervisor.startAutostart()

  app.on('before-quit', () => {
    markQuitting()
    // Milestone 2: stop every app and wait before letting the quit proceed.
    tray.dispose()
  })
}

// A menu bar app keeps running with no windows open.
app.on('window-all-closed', () => {
  /* intentionally empty */
})
