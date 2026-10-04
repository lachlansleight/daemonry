import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '@shared/ipc'
import type { AppId } from '@shared/types'
import { normaliseApp } from './config'
import { log } from './log'
import type { ShellEnv } from './shellEnv'
import type { Store } from './store'
import type { Supervisor } from './supervisor'
import { getWindow } from './window'

export function registerIpc(store: Store, supervisor: Supervisor, shellEnv: ShellEnv): void {
  ipcMain.handle(IPC.getSnapshot, () => store.snapshot())

  ipcMain.handle(IPC.saveApp, (_event, raw: unknown) => {
    const appConfig = normaliseApp(raw)
    if (!appConfig) throw new Error('invalid app config')
    store.upsertApp(appConfig)
  })

  ipcMain.handle(IPC.deleteApp, async (_event, id: AppId) => {
    await supervisor.stop(id)
    store.deleteApp(id)
  })

  ipcMain.handle(IPC.setLaunchAtLogin, (_event, value: boolean) => {
    store.setLaunchAtLogin(value === true)
    applyLoginItem(value === true)
  })

  ipcMain.handle(IPC.setDefaultStopGrace, (_event, ms: number) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) throw new Error('invalid grace period')
    store.setDefaultStopGrace(Math.round(ms))
  })

  ipcMain.handle(IPC.refreshShellEnv, async () => {
    const summary = await shellEnv.capture()
    store.setShellEnv(summary)
    return summary
  })

  ipcMain.handle(IPC.startApp, (_event, id: AppId) => supervisor.start(id))
  ipcMain.handle(IPC.stopApp, (_event, id: AppId) => supervisor.stop(id))
  ipcMain.handle(IPC.restartApp, (_event, id: AppId) => supervisor.restart(id))
  ipcMain.handle(IPC.sendCommand, (_event, id: AppId, commandId: string) => supervisor.sendCommand(id, commandId))

  ipcMain.handle(IPC.chooseFolder, async (_event, initial?: string) => {
    const parent = getWindow()
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: initial || app.getPath('home'),
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.revealInFolder, async (_event, target: string) => {
    const stat = await fs.stat(target).catch(() => null)
    if (!stat) return
    if (stat.isDirectory()) await shell.openPath(target)
    else shell.showItemInFolder(target)
  })

  store.on('change', (snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.snapshot, snapshot)
  })
}

/** Login item registration only works from a packaged build. */
export function applyLoginItem(openAtLogin: boolean): void {
  if (!app.isPackaged) {
    log.info(`launch at login set to ${openAtLogin}; not applied to the OS from a dev build`)
    return
  }
  app.setLoginItemSettings({ openAtLogin })
}
