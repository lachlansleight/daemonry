import { useMemo } from 'react'
import { newAppConfig } from '@shared/types'
import { AppForm } from '../components/AppForm'
import { Page } from '../components/ui'
import { useDaemonry } from '../store'

export function NewApp(): React.JSX.Element {
  const { navigate } = useDaemonry()
  const blank = useMemo(() => newAppConfig(), [])
  return (
    <Page title="New app">
      <div className="rounded-[8px] border border-line px-[16px] py-[16px] max-w-[720px]">
        <AppForm app={blank} submitLabel="Add app" onSaved={(saved) => navigate({ page: 'app', id: saved.id })} />
      </div>
    </Page>
  )
}
