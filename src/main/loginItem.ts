// Launch-at-login registration. Only meaningful from a packaged build: from source the
// "app" is the Electron dev binary, which is not something to register.

import { app, shell } from 'electron'
import type { LoginItemState } from '@shared/types'
import { LOGIN_LAUNCH_ARG } from './launchContext'
import { log } from './log'

/** Windows passes arguments to the login item; macOS (SMAppService) cannot. */
const winArgs = process.platform === 'win32' ? { args: [LOGIN_LAUNCH_ARG] } : {}

const UNSUPPORTED: LoginItemState = { openAtLogin: false, status: 'unsupported' }

export function readLoginItem(): LoginItemState {
  if (!app.isPackaged) return UNSUPPORTED
  try {
    const settings = app.getLoginItemSettings(winArgs)
    if (process.platform === 'darwin') return { openAtLogin: settings.openAtLogin, status: settings.status }
    return { openAtLogin: settings.openAtLogin, status: settings.openAtLogin ? 'enabled' : 'not-registered' }
  } catch (err) {
    log.warn('could not read login item settings', err)
    return UNSUPPORTED
  }
}

export function applyLoginItem(openAtLogin: boolean): LoginItemState {
  if (!app.isPackaged) {
    log.info(`launch at login set to ${openAtLogin}; not applied to the OS from a dev build`)
    return UNSUPPORTED
  }
  try {
    app.setLoginItemSettings({ openAtLogin, ...winArgs })
  } catch (err) {
    log.error('could not update login item settings', err)
  }
  const state = readLoginItem()
  log.info(`login item ${openAtLogin ? 'enabled' : 'disabled'}`, state)
  return state
}

/** Where the user can approve or inspect the login item. */
export function openLoginItemsSettings(): void {
  if (process.platform === 'darwin') {
    void shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension')
  } else if (process.platform === 'win32') {
    void shell.openExternal('ms-settings:startupapps')
  }
}
