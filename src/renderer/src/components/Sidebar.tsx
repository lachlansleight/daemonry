import type { Route } from '@shared/ipc'
import { STATE_LABEL } from '@shared/format'
import { useDaemonry } from '../store'
import { StatusDot } from './StatusDot'

function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-drag h-[30px] px-[10px] rounded-[6px] text-left text-[13px] transition-colors ${
        active ? 'bg-surface-3 text-ink-0' : 'text-ink-1 hover:bg-surface-2 hover:text-ink-0'
      }`}
    >
      {label}
    </button>
  )
}

export function Sidebar(): React.JSX.Element {
  const { snapshot, route, navigate } = useDaemonry()
  const isMac = (snapshot?.platform ?? 'darwin') === 'darwin'
  const apps = snapshot?.config.apps ?? []

  const is = (r: Route): boolean =>
    r.page === route.page && (r.page !== 'app' || (route.page === 'app' && route.id === r.id))

  return (
    <aside className="w-[220px] h-full shrink-0 flex flex-col bg-surface-1 border-r border-line">
      <div className={`drag shrink-0 ${isMac ? 'h-[38px]' : 'h-[10px]'}`} />
      <div className="px-[18px] pb-[10px] text-[13px] font-semibold text-ink-0 drag">daemonry</div>

      <nav className="px-[8px] flex flex-col gap-[2px]">
        <NavItem label="Home" active={is({ page: 'home' })} onClick={() => navigate({ page: 'home' })} />
        <NavItem label="Settings" active={is({ page: 'settings' })} onClick={() => navigate({ page: 'settings' })} />
      </nav>

      <div className="mt-[20px] px-[18px] pr-[12px] flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">Apps</span>
        <button
          type="button"
          title="Add app"
          onClick={() => navigate({ page: 'new' })}
          className={`no-drag w-[22px] h-[22px] rounded-[5px] text-[16px] leading-[22px] text-center transition-colors ${
            route.page === 'new' ? 'bg-surface-3 text-ink-0' : 'text-ink-1 hover:bg-surface-3 hover:text-ink-0'
          }`}
        >
          +
        </button>
      </div>

      <div className="mt-[6px] px-[8px] pb-[8px] flex-1 overflow-y-auto flex flex-col gap-[2px]">
        {apps.map((app) => {
          const rt = snapshot?.runtime[app.id]
          const state = rt?.state ?? 'inactive'
          const active = is({ page: 'app', id: app.id })
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => navigate({ page: 'app', id: app.id })}
              className={`no-drag h-[44px] px-[10px] rounded-[6px] flex items-center gap-[10px] text-left transition-colors ${
                active ? 'bg-surface-3' : 'hover:bg-surface-2'
              }`}
            >
              <StatusDot state={state} />
              <span className="flex flex-col min-w-[0px]">
                <span className={`text-[13px] truncate ${active ? 'text-ink-0' : 'text-ink-0/90'}`}>
                  {app.name || 'Untitled'}
                </span>
                <span className="text-[11px] text-ink-2 leading-[14px]">{STATE_LABEL[state]}</span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
