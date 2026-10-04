import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ActionResult, Route } from '@shared/ipc'
import { emptyRuntime, type AppConfig, type AppId, type AppRuntime, type Snapshot } from '@shared/types'
import { api } from './api'

export interface Toast {
  id: number
  text: string
}

interface DaemonryContext {
  snapshot: Snapshot | null
  route: Route
  navigate: (route: Route) => void
  toasts: Toast[]
  notify: (text: string) => void
  dismiss: (id: number) => void
}

const TOAST_MS = 6000

const Context = createContext<DaemonryContext | null>(null)

export function DaemonryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [route, setRoute] = useState<Route>({ page: 'home' })
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let cancelled = false
    void api.getSnapshot().then((s) => {
      if (!cancelled) setSnapshot(s)
    })
    const offSnapshot = api.onSnapshot(setSnapshot)
    const offNavigate = api.onNavigate(setRoute)
    return () => {
      cancelled = true
      offSnapshot()
      offNavigate()
    }
  }, [])

  // If the current app disappears (deleted), fall back to home.
  useEffect(() => {
    if (route.page === 'app' && snapshot && !snapshot.config.apps.some((a) => a.id === route.id)) {
      setRoute({ page: 'home' })
    }
  }, [route, snapshot])

  const navigate = useCallback((r: Route) => setRoute(r), [])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = useCallback(
    (text: string) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t.slice(-3), { id, text }])
      setTimeout(() => dismiss(id), TOAST_MS)
    },
    [dismiss],
  )
  const value = useMemo(
    () => ({ snapshot, route, navigate, toasts, notify, dismiss }),
    [snapshot, route, navigate, toasts, notify, dismiss],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useDaemonry(): DaemonryContext {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useDaemonry outside provider')
  return ctx
}

export function useApp(id: AppId): { config: AppConfig | undefined; runtime: AppRuntime } {
  const { snapshot } = useDaemonry()
  const config = snapshot?.config.apps.find((a) => a.id === id)
  const runtime = snapshot?.runtime[id] ?? emptyRuntime(id)
  return { config, runtime }
}

/** Re-renders once a second so uptimes tick. */
export function useNow(enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [enabled])
  return now
}

/** App actions that surface failures as toasts. */
export function useActions(): {
  start: (id: AppId) => void
  stop: (id: AppId) => void
  restart: (id: AppId) => void
  sendCommand: (id: AppId, commandId: string) => void
  startAll: (ids: AppId[]) => void
  stopAll: (ids: AppId[]) => void
} {
  const { notify } = useDaemonry()
  const run = useCallback(
    (promise: Promise<ActionResult>) => {
      void promise
        .then((result) => {
          if (!result.ok) notify(result.error ?? 'Action failed')
        })
        .catch((err: unknown) => notify(err instanceof Error ? err.message : String(err)))
    },
    [notify],
  )
  return useMemo(
    () => ({
      start: (id) => run(api.startApp(id)),
      stop: (id) => run(api.stopApp(id)),
      restart: (id) => run(api.restartApp(id)),
      sendCommand: (id, commandId) => run(api.sendCommand(id, commandId)),
      startAll: (ids) => ids.forEach((id) => run(api.startApp(id))),
      stopAll: (ids) => ids.forEach((id) => run(api.stopApp(id))),
    }),
    [run],
  )
}
