import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { IPC, type Route } from '@shared/ipc'

let win: BrowserWindow | null = null
let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function getWindow(): BrowserWindow | null {
  return win
}

/** Show the GUI, creating it on first use, and optionally navigate to a route. */
export function openWindow(route?: Route): void {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (route) win.webContents.send(IPC.navigate, route)
    return
  }

  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: 'daemonry',
    backgroundColor: '#0e0e10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => {
    win?.show()
    if (route) win?.webContents.send(IPC.navigate, route)
  })

  // Closing hides; the app lives in the tray until Quit.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win?.hide()
  })

  win.on('closed', () => {
    win = null
  })

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}
