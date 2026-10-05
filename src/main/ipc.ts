import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '@shared/ipc'
import type { AppId, LogLine, Paths } from '@shared/types'
import { deleteLogFiles, type LogStore } from './appLogs'
import { normaliseApp } from './config'
import { applyLoginItem, openLoginItemsSettings } from './loginItem'
import type { ShellEnv } from './shellEnv'
import type { Store } from './store'
import type { Supervisor } from './supervisor'
import { getWindow } from './window'

export interface IpcDeps {
  store: Store
  supervisor: Supervisor
  shellEnv: ShellEnv
  logStore: LogStore
  paths: Paths
}

/** Log lines are coalesced for this long before being pushed to the renderer. */
const LOG_FLUSH_MS = 50

export function registerIpc({ store, supervisor, shellEnv, logStore, paths }: IpcDeps): void {
  ipcMain.handle(IPC.getSnapshot, () => store.snapshot())

  ipcMain.handle(IPC.saveApp, (_event, raw: unknown) => {
    const appConfig = normaliseApp(raw)
    if (!appConfig) throw new Error('invalid app config')
    store.upsertApp(appConfig)
  })

  ipcMain.handle(IPC.deleteApp, async (_event, id: AppId) => {
    await supervisor.stop(id)
    store.deleteApp(id)
    logStore.forget(id)
    deleteLogFiles(paths.logsDir, id)
  })

  ipcMain.handle(IPC.setLaunchAtLogin, (_event, value: boolean) => {
    store.setLaunchAtLogin(value === true)
    store.setLoginItemState(applyLoginItem(value === true))
  })

  ipcMain.handle(IPC.openLoginItemsSettings, () => openLoginItemsSettings())

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

  ipcMain.handle(IPC.getLogTail, (_event, id: AppId) => logStore.tail(id))
  ipcMain.handle(IPC.clearLogs, (_event, id: AppId) => logStore.clear(id))

  store.on('change', (snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.snapshot, snapshot)
  })

  // Batch log lines per app and only push to windows that can show them. A window
  // that was hidden refetches the tail when it becomes visible again.
  const pending = new Map<AppId, LogLine[]>()
  let flushTimer: NodeJS.Timeout | null = null
  const flush = (): void => {
    flushTimer = null
    const targets = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible())
    if (targets.length > 0) {
      for (const [id, lines] of pending) for (const win of targets) win.webContents.send(IPC.logLines, id, lines)
    }
    pending.clear()
  }
  logStore.on('lines', (id: AppId, lines: LogLine[]) => {
    const queue = pending.get(id)
    if (queue) queue.push(...lines)
    else pending.set(id, [...lines])
    if (!flushTimer) flushTimer = setTimeout(flush, LOG_FLUSH_MS)
  })
}
