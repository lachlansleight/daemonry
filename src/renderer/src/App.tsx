import { Sidebar } from './components/Sidebar'
import { AppPage } from './pages/AppPage'
import { Home } from './pages/Home'
import { NewApp } from './pages/NewApp'
import { Settings } from './pages/Settings'
import { useDaemonry } from './store'

export function App(): React.JSX.Element {
  const { route, snapshot } = useDaemonry()
  const isMac = (snapshot?.platform ?? 'darwin') === 'darwin'

  let page: React.JSX.Element | null
  switch (route.page) {
    case 'home':
      page = <Home />
      break
    case 'settings':
      page = <Settings />
      break
    case 'new':
      page = <NewApp />
      break
    case 'app':
      page = <AppPage id={route.id} section={route.section} />
      break
  }

  return (
    <div className="flex h-full bg-surface-0">
      <Sidebar />
      <main className="flex-1 min-w-[0px] h-full overflow-y-auto">
        {/* Window drag strip under the hidden macOS title bar. */}
        <div className={`drag ${isMac ? 'h-[38px]' : 'h-[0px]'}`} />
        {page}
      </main>
    </div>
  )
}
