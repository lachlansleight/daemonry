import type { AppRuntime, AppState } from './types'

export function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export const STATE_LABEL: Record<AppState, string> = {
  inactive: 'Inactive',
  launching: 'Launching',
  running: 'Running',
  stopping: 'Stopping',
  crashed: 'Crashed',
}

/** One-line description for the tray status line and the GUI. */
export function describeRuntime(rt: AppRuntime, now = Date.now()): string {
  const parts: string[] = []
  switch (rt.state) {
    case 'running':
      parts.push('Running')
      if (rt.pid) parts.push(`pid ${rt.pid}`)
      if (rt.startedAt) parts.push(formatUptime(now - rt.startedAt))
      break
    case 'launching':
      parts.push('Launching…')
      break
    case 'stopping':
      parts.push('Stopping…')
      break
    case 'inactive':
      parts.push('Inactive')
      break
    case 'crashed':
      parts.push('Crashed')
      if (rt.exitSignal) parts.push(rt.exitSignal)
      else if (rt.exitCode !== null) parts.push(`exit ${rt.exitCode}`)
      break
  }
  if (rt.statusText) parts.push(rt.statusText)
  return parts.join(' · ')
}
