// Application menu. On macOS it is what gives the window Cmd+W, Cmd+Q and the Edit
// shortcuts (copy, paste, select all) while the dock icon is showing. Other platforms
// get no menu bar at all.

import { app, Menu, type MenuItemConstructorOptions } from 'electron'

export function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' }],
    },
  ]
  if (!app.isPackaged) {
    template.push({ label: 'Debug', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
