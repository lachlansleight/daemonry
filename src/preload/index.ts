import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type DaemonryApi, type Route } from '@shared/ipc'
import type { AppConfig, AppId, LogLine, Snapshot } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api: DaemonryApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  onSnapshot: (cb) => subscribe<Snapshot>(IPC.snapshot, cb),
  onNavigate: (cb) => subscribe<Route>(IPC.navigate, cb),

  saveApp: (app: AppConfig) => ipcRenderer.invoke(IPC.saveApp, app),
  deleteApp: (id: AppId) => ipcRenderer.invoke(IPC.deleteApp, id),
  setLaunchAtLogin: (value) => ipcRenderer.invoke(IPC.setLaunchAtLogin, value),
  openLoginItemsSettings: () => ipcRenderer.invoke(IPC.openLoginItemsSettings),
  setDefaultStopGrace: (ms) => ipcRenderer.invoke(IPC.setDefaultStopGrace, ms),
  refreshShellEnv: () => ipcRenderer.invoke(IPC.refreshShellEnv),

  startApp: (id) => ipcRenderer.invoke(IPC.startApp, id),
  stopApp: (id) => ipcRenderer.invoke(IPC.stopApp, id),
  restartApp: (id) => ipcRenderer.invoke(IPC.restartApp, id),
  sendCommand: (id, commandId) => ipcRenderer.invoke(IPC.sendCommand, id, commandId),

  chooseFolder: (initial) => ipcRenderer.invoke(IPC.chooseFolder, initial),
  revealInFolder: (path) => ipcRenderer.invoke(IPC.revealInFolder, path),

  getLogTail: (id) => ipcRenderer.invoke(IPC.getLogTail, id),
  onLogLines: (cb) => {
    const handler = (_event: IpcRendererEvent, id: AppId, lines: LogLine[]): void => cb(id, lines)
    ipcRenderer.on(IPC.logLines, handler)
    return () => ipcRenderer.off(IPC.logLines, handler)
  },
  clearLogs: (id) => ipcRenderer.invoke(IPC.clearLogs, id),
}

contextBridge.exposeInMainWorld('daemonry', api)
