import { useEffect, useRef, useState } from 'react'
import { STATE_LABEL, describeRuntime, formatUptime } from '@shared/format'
import { isActive, type AppId } from '@shared/types'
import { api } from '../api'
import { AppForm } from '../components/AppForm'
import { LogView } from '../components/LogView'
import { StatusDot } from '../components/StatusDot'
import { Button, Page, SectionLabel } from '../components/ui'
import { useActions, useApp, useDaemonry, useNow } from '../store'

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[4px] min-w-[0px]">
      <span className="text-[11px] text-ink-2">{label}</span>
      <span className={`text-[13px] text-ink-0 truncate ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
    </div>
  )
}

export function AppPage({ id, section }: { id: AppId; section?: 'status' | 'logs' | 'config' }): React.JSX.Element | null {
  const { snapshot, navigate } = useDaemonry()
  const { config, runtime } = useApp(id)
  const actions = useActions()
  const now = useNow(isActive(runtime.state))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lineCount, setLineCount] = useState(0)
  const [logEpoch, setLogEpoch] = useState(0)
  const logsRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = section === 'logs' ? logsRef.current : section === 'config' ? configRef.current : null
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [section, id])

  useEffect(() => setConfirmDelete(false), [id])

  if (!config) return null
  const active = isActive(runtime.state)
  const running = runtime.state === 'running'
  const platform = snapshot?.platform ?? 'darwin'
  const revealLabel = platform === 'darwin' ? 'Open in Finder' : platform === 'win32' ? 'Show in Explorer' : 'Open folder'
  const logFile = snapshot ? `${snapshot.paths.logsDir}${platform === 'win32' ? '\\' : '/'}${id}.log` : ''

  return (
    <Page
      title={config.name || 'Untitled'}
      actions={
        <>
          {active ? (
            <Button onClick={() => actions.stop(id)} disabled={runtime.state === 'stopping'}>
              Stop
            </Button>
          ) : (
            <Button variant="primary" onClick={() => actions.start(id)}>
              Start
            </Button>
          )}
          <Button onClick={() => actions.restart(id)} disabled={!running}>
            Restart
          </Button>
          <Button variant="ghost" onClick={() => void api.revealInFolder(config.cwd)} disabled={!config.cwd}>
            {revealLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-[10px] mb-[24px] text-[13px]">
        <StatusDot state={runtime.state} size={10} />
        <span className={runtime.state === 'crashed' ? 'text-bad' : 'text-ink-1'}>{describeRuntime(runtime, now)}</span>
      </div>

      {runtime.commands.length > 0 && (
        <section className="mb-[28px]">
          <SectionLabel>Commands</SectionLabel>
          <div className="flex flex-wrap gap-[8px]">
            {runtime.commands.map((c) => (
              <Button key={c.id} onClick={() => actions.sendCommand(id, c.id)} disabled={!running || !runtime.connected} title={c.id}>
                {c.label ?? c.id}
              </Button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-[28px]">
        <SectionLabel>Status</SectionLabel>
        <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-[16px] rounded-[8px] border border-line px-[16px] py-[14px]">
          <Stat label="State" value={STATE_LABEL[runtime.state]} />
          <Stat label="PID" value={runtime.pid ? String(runtime.pid) : '—'} mono />
          <Stat label="Uptime" value={running && runtime.startedAt ? formatUptime(now - runtime.startedAt) : '—'} />
          <Stat
            label="Last exit"
            value={runtime.exitSignal ?? (runtime.exitCode !== null ? `code ${runtime.exitCode}` : '—')}
            mono
          />
          <Stat label="Socket" value={runtime.connected ? 'Connected' : '—'} />
        </div>
      </section>

      <section className="mb-[28px] scroll-mt-[24px]" ref={logsRef}>
        <div className="flex items-center justify-between mb-[12px]">
          <SectionLabel>Logs</SectionLabel>
          <div className="flex items-center gap-[6px] mb-[12px]">
            <span className="text-[11px] text-ink-2 mr-[6px]">{lineCount > 0 ? `${lineCount} lines` : ''}</span>
            <Button
              variant="ghost"
              onClick={() => void api.clearLogs(id).then(() => setLogEpoch((e) => e + 1))}
              disabled={lineCount === 0}
              title="Clear the view; the file is kept"
            >
              Clear
            </Button>
            <Button variant="ghost" onClick={() => void api.revealInFolder(logFile)} title={logFile}>
              Log file
            </Button>
          </div>
        </div>
        <LogView key={`${id}:${logEpoch}`} id={id} onCount={setLineCount} />
      </section>

      <section className="mb-[28px] scroll-mt-[24px]" ref={configRef}>
        <SectionLabel>Configuration</SectionLabel>
        <div className="rounded-[8px] border border-line px-[16px] py-[16px]">
          <AppForm app={config} submitLabel="Save" />
        </div>
      </section>

      <section className="pt-[8px] border-t border-line flex items-center justify-end gap-[8px]">
        {confirmDelete ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void api.deleteApp(id).then(() => navigate({ page: 'home' }))
              }}
            >
              Confirm delete
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete app
          </Button>
        )}
      </section>
    </Page>
  )
}
