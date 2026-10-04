import { describeRuntime } from '@shared/format'
import { isActive } from '@shared/types'
import { api } from '../api'
import { StatusDot } from '../components/StatusDot'
import { Button, Page } from '../components/ui'
import { useDaemonry, useNow } from '../store'

export function Home(): React.JSX.Element {
  const { snapshot, navigate } = useDaemonry()
  const apps = snapshot?.config.apps ?? []
  const anyActive = apps.some((a) => isActive(snapshot?.runtime[a.id]?.state ?? 'inactive'))
  const now = useNow(anyActive)

  return (
    <Page
      title="Home"
      actions={
        apps.length > 0 ? (
          <>
            <Button onClick={() => apps.forEach((a) => void api.startApp(a.id))} disabled={apps.every((a) => isActive(snapshot?.runtime[a.id]?.state ?? 'inactive'))}>
              Start all
            </Button>
            <Button onClick={() => apps.forEach((a) => void api.stopApp(a.id))} disabled={!anyActive}>
              Stop all
            </Button>
          </>
        ) : undefined
      }
    >
      {apps.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] rounded-[8px] border border-line border-dashed">
          <Button onClick={() => navigate({ page: 'new' })}>Add app</Button>
        </div>
      ) : (
        <div className="rounded-[8px] border border-line overflow-hidden">
          {apps.map((app) => {
            const rt = snapshot!.runtime[app.id]
            const active = isActive(rt.state)
            return (
              <div key={app.id} className="flex items-center gap-[14px] h-[52px] px-[16px] border-b border-line last:border-b-0 hover:bg-surface-1/60">
                <StatusDot state={rt.state} size={10} />
                <button
                  type="button"
                  onClick={() => navigate({ page: 'app', id: app.id })}
                  className="no-drag flex flex-col min-w-[0px] w-[260px] text-left"
                >
                  <span className="text-[13px] text-ink-0 truncate hover:underline">{app.name || 'Untitled'}</span>
                  <span className="text-[11px] font-mono text-ink-2 truncate leading-[14px]">{app.command}</span>
                </button>
                <span className="flex-1 text-[12px] text-ink-1 truncate">{describeRuntime(rt, now)}</span>
                <div className="flex items-center gap-[6px]">
                  {active ? (
                    <Button onClick={() => void api.stopApp(app.id)} disabled={rt.state === 'stopping'}>
                      Stop
                    </Button>
                  ) : (
                    <Button onClick={() => void api.startApp(app.id)}>Start</Button>
                  )}
                  <Button variant="ghost" onClick={() => void api.restartApp(app.id)} disabled={rt.state !== 'running'}>
                    Restart
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Page>
  )
}
