// Was this process started by the OS at login, or by the user? The GUI opens for a
// manual launch and stays out of the way for a login launch.
//
// Windows: the login item is registered with --launched-at-login.
// macOS: SMAppService passes no arguments and Electron's wasOpenedAtLogin is not
// dependable on modern macOS, so the fallback is timing: a launch within a short window
// of the console login is treated as a login launch. /dev/console's mtime is the time
// the current user logged in at the console.

import { app } from 'electron'
import { statSync } from 'node:fs'

export const LOGIN_LAUNCH_ARG = '--launched-at-login'
const LOGIN_WINDOW_MS = 120_000

export function launchedAtLogin(loginWindowMs = LOGIN_WINDOW_MS): boolean {
  if (process.argv.includes(LOGIN_LAUNCH_ARG)) return true
  if (process.platform !== 'darwin') return false
  if (app.isPackaged) {
    try {
      if (app.getLoginItemSettings().wasOpenedAtLogin) return true
    } catch {
      // fall through to timing
    }
  }
  try {
    const loginTime = statSync('/dev/console').mtimeMs
    return Date.now() - loginTime < loginWindowMs
  } catch {
    return false
  }
}
