import { useEffect, useState } from 'react'
import { api } from '../api'
import { Button, Page, Row, TextInput, Toggle } from '../components/ui'
import { useDaemonry } from '../store'

export function Settings(): React.JSX.Element {
  const { snapshot } = useDaemonry()
  const config = snapshot?.config
  const [grace, setGrace] = useState('')

  useEffect(() => {
    if (config) setGrace(String(config.defaultStopGraceMs / 1000))
  }, [config?.defaultStopGraceMs]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitGrace = (): void => {
    const seconds = Number.parseFloat(grace)
    if (Number.isFinite(seconds) && seconds > 0) void api.setDefaultStopGrace(Math.round(seconds * 1000))
    else if (config) setGrace(String(config.defaultStopGraceMs / 1000))
  }

  if (!config || !snapshot) return <Page title="Settings">{null}</Page>

  return (
    <Page title="Settings">
      <div className="rounded-[8px] border border-line px-[16px]">
        <Row label="Launch daemonry at login">
          <Toggle checked={config.launchAtLogin} onChange={(v) => void api.setLaunchAtLogin(v)} />
        </Row>
        <Row label="Default stop grace">
          <div className="flex items-center gap-[6px]">
            <TextInput
              type="number"
              min={1}
              step={1}
              value={grace}
              onChange={(e) => setGrace(e.target.value)}
              onBlur={commitGrace}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-[80px] text-right"
              title="Time between asking an app to stop and killing it"
            />
            <span className="text-[12px] text-ink-2">s</span>
          </div>
        </Row>
        <Row label="Config file">
          <span className="text-[12px] font-mono text-ink-2 truncate" title={snapshot.paths.configFile}>
            {snapshot.paths.configFile}
          </span>
          <Button variant="ghost" onClick={() => void api.revealInFolder(snapshot.paths.configFile)}>
            Reveal
          </Button>
        </Row>
        <Row label="Logs">
          <span className="text-[12px] font-mono text-ink-2 truncate" title={snapshot.paths.logsDir}>
            {snapshot.paths.logsDir}
          </span>
          <Button variant="ghost" onClick={() => void api.revealInFolder(snapshot.paths.logsDir)}>
            Reveal
          </Button>
        </Row>
      </div>
    </Page>
  )
}
