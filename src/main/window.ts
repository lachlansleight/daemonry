import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
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

/**
 * The dock icon is shown only while the GUI window is open. With no window daemonry
 * is a pure menu bar app. DAEMONRY_KEEP_DOCK makes the dock icon permanent (dev aid).
 */
function dockPinned(): boolean {
  return process.platform !== 'darwin' || Boolean(process.env['DAEMONRY_KEEP_DOCK'])
}

async function showDock(): Promise<void> {
  if (dockPinned() || !app.dock || app.dock.isVisible()) return
  await app.dock.show()
}

function hideDock(): void {
  if (dockPinned() || !app.dock || !app.dock.isVisible()) return
  app.dock.hide()
}

/** From source the dock would show Electron's icon; use the app icon instead. */
export function applyDevDockIcon(): void {
  if (app.isPackaged || process.platform !== 'darwin' || !app.dock) return
  const file = join(__dirname, '../../build/icon.png')
  if (!existsSync(file)) return
  const icon = nativeImage.createFromPath(file)
  if (!icon.isEmpty()) app.dock.setIcon(icon)
}

/** Show the GUI, creating it on first use, and optionally navigate to a route. */
export function openWindow(route?: Route): void {
  void (async () => {
    await showDock()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      app.focus({ steal: true })
      if (route) win.webContents.send(IPC.navigate, route)
      return
    }
    createWindow(route)
  })()
}

function createWindow(route?: Route): void {
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
    app.focus({ steal: true })
    if (route) win?.webContents.send(IPC.navigate, route)
  })

  // Closing hides; the app lives in the tray until Quit. Cmd+W goes through here too.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win?.hide()
  })

  win.on('hide', () => hideDock())

  win.on('closed', () => {
    win = null
    hideDock()
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
