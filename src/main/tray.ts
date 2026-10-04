import { app, Menu, nativeImage, screen, shell, Tray, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import type { Route } from '@shared/ipc'
import { describeRuntime } from '@shared/format'
import { isActive, type AppConfig, type AppRuntime, type AppState, type Platform, type Snapshot } from '@shared/types'
import { log } from './log'
import type { Store } from './store'
import type { Supervisor } from './supervisor'

const GLYPH: Record<AppState, string> = {
  running: '●',
  launching: '◌',
  stopping: '◌',
  inactive: '○',
  crashed: '✕',
}

const REVEAL_LABEL: Partial<Record<Platform, string>> = {
  darwin: 'Open in Finder',
  win32: 'Show in Explorer',
}

export class TrayController {
  private tray: Tray | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly store: Store,
    private readonly supervisor: Supervisor,
    private readonly openWindow: (route?: Route) => void,
  ) {}

  init(): void {
    const snapshot = this.store.snapshot()
    const image = this.iconFor(snapshot)
    this.tray = new Tray(image)
    this.tray.setToolTip('daemonry')
    this.rebuild(snapshot)
    log.info('tray created', {
      imageEmpty: image.isEmpty(),
      imageSize: image.getSize(),
      template: image.isTemplateImage(),
      bounds: this.tray.getBounds(),
      display: screen.getPrimaryDisplay().bounds,
    })
    setTimeout(() => log.info('tray bounds after 2s', this.tray?.getBounds()), 2000)
    this.store.on('change', (s: Snapshot) => this.rebuild(s))
    // Uptime in the status lines goes stale; refresh while anything is active.
    this.timer = setInterval(() => {
      const s = this.store.snapshot()
      if (Object.values(s.runtime).some((r) => isActive(r.state))) this.rebuild(s)
    }, 30_000)
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.tray?.destroy()
    this.tray = null
  }

  private rebuild(snapshot: Snapshot): void {
    if (!this.tray) return
    this.tray.setImage(this.iconFor(snapshot))
    this.tray.setContextMenu(Menu.buildFromTemplate(this.template(snapshot)))
  }

  private iconFor(snapshot: Snapshot): Electron.NativeImage {
    const states = Object.values(snapshot.runtime).map((r) => r.state)
    const crashed = states.includes('crashed')
    const active = states.some(isActive)
    const mac = process.platform === 'darwin'
    let file: string
    if (crashed) file = 'alert.png'
    else if (active) file = mac ? 'runningTemplate.png' : 'running-light.png'
    else file = mac ? 'idleTemplate.png' : 'idle-light.png'
    const image = nativeImage.createFromPath(join(__dirname, '../../resources/tray', file))
    if (mac && !crashed) image.setTemplateImage(true)
    return image
  }

  private template(snapshot: Snapshot): MenuItemConstructorOptions[] {
    const apps = snapshot.config.apps
    const items: MenuItemConstructorOptions[] = [
      { label: 'Open daemonry', click: () => this.openWindow({ page: 'home' }) },
      { label: 'Start All Apps', enabled: apps.length > 0, click: () => void this.supervisor.startAll() },
      { label: 'Stop All Apps', enabled: apps.length > 0, click: () => void this.supervisor.stopAll() },
      { type: 'separator' },
    ]
    for (const app of apps) items.push(this.appItem(app, snapshot.runtime[app.id]))
    if (apps.length > 0) items.push({ type: 'separator' })
    items.push({ label: 'Quit daemonry', click: () => app.quit() })
    return items
  }

  private appItem(appConfig: AppConfig, rt: AppRuntime): MenuItemConstructorOptions {
    const active = isActive(rt.state)
    const running = rt.state === 'running'
    const sub: MenuItemConstructorOptions[] = [
      { label: describeRuntime(rt), enabled: false },
      active
        ? { label: 'Stop', enabled: rt.state !== 'stopping', click: () => void this.supervisor.stop(appConfig.id) }
        : { label: 'Start', click: () => void this.supervisor.start(appConfig.id) },
      { label: 'Restart', enabled: running, click: () => void this.supervisor.restart(appConfig.id) },
    ]
    if (rt.commands.length > 0) {
      sub.push({ type: 'separator' })
      for (const command of rt.commands) {
        sub.push({
          label: `Command: ${command.label ?? command.id}`,
          enabled: running && rt.connected,
          click: () => void this.supervisor.sendCommand(appConfig.id, command.id),
        })
      }
    }
    sub.push(
      { type: 'separator' },
      { label: 'View Logs', click: () => this.openWindow({ page: 'app', id: appConfig.id, section: 'logs' }) },
      {
        label: REVEAL_LABEL[process.platform] ?? 'Open Folder',
        enabled: appConfig.cwd.length > 0,
        click: () => void shell.openPath(appConfig.cwd),
      },
    )
    return { label: `${GLYPH[rt.state]} ${appConfig.name || 'Untitled'}`, submenu: sub }
  }
}
