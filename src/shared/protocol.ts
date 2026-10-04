// Socket protocol between daemonry and an app. Newline-delimited JSON, one object per line.
// Daemonry listens; the app connects. See DESIGN.md "App protocol".

import type { CommandDecl, Platform } from './types'

export const PROTOCOL_VERSION = 1

export const ENV = {
  socket: 'DAEMONRY_SOCKET',
  appId: 'DAEMONRY_APP_ID',
  appName: 'DAEMONRY_APP_NAME',
} as const

/** App to daemonry. */
export type AppMessage =
  | { type: 'hello'; protocol: number; commands?: CommandDecl[]; status?: string }
  | { type: 'commands'; commands: CommandDecl[] }
  | { type: 'status'; text: string }

/** Daemonry to app. */
export type RunnerMessage =
  | { type: 'welcome'; app: { id: string; name: string } }
  | { type: 'command'; id: string }
  | { type: 'shutdown' }

export function socketPathFor(appId: string, platform: Platform, tmpdir: string): string {
  if (platform === 'win32') return `\\\\.\\pipe\\daemonry-${appId}`
  return `${tmpdir.replace(/\/$/, '')}/daemonry-${appId}.sock`
}
