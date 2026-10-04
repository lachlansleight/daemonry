import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Route } from '@shared/ipc'
import { emptyRuntime, type AppConfig, type AppId, type AppRuntime, type Snapshot } from '@shared/types'
import { api } from './api'

interface DaemonryContext {
  snapshot: Snapshot | null
  route: Route
  navigate: (route: Route) => void
}

const Context = createContext<DaemonryContext | null>(null)

export function DaemonryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [route, setRoute] = useState<Route>({ page: 'home' })

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
  const value = useMemo(() => ({ snapshot, route, navigate }), [snapshot, route, navigate])
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
