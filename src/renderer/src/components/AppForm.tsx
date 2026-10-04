import { useEffect, useMemo, useState } from 'react'
import type { AppConfig } from '@shared/types'
import { api } from '../api'
import { useDaemonry } from '../store'
import { EnvEditor, entriesToEnv, envToEntries, type EnvEntry } from './EnvEditor'
import { Button, Field, TextInput, Toggle } from './ui'

interface Draft {
  name: string
  cwd: string
  command: string
  autostart: boolean
  stopGraceSeconds: string
  env: EnvEntry[]
}

function toDraft(app: AppConfig): Draft {
  return {
    name: app.name,
    cwd: app.cwd,
    command: app.command,
    autostart: app.autostart,
    stopGraceSeconds: app.stopGraceMs === null ? '' : String(app.stopGraceMs / 1000),
    env: envToEntries(app.env),
  }
}

function fromDraft(base: AppConfig, d: Draft): AppConfig {
  const seconds = Number.parseFloat(d.stopGraceSeconds)
  return {
    ...base,
    name: d.name.trim(),
    cwd: d.cwd.trim(),
    command: d.command.trim(),
    autostart: d.autostart,
    stopGraceMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null,
    env: entriesToEnv(d.env),
  }
}

export function AppForm({
  app,
  submitLabel,
  onSaved,
}: {
  app: AppConfig
  submitLabel: string
  onSaved?: (saved: AppConfig) => void
}): React.JSX.Element {
  const { snapshot } = useDaemonry()
  const [draft, setDraft] = useState<Draft>(() => toDraft(app))
  const [saving, setSaving] = useState(false)

  // Reset when a different app is shown or when the stored config changes underneath us.
  useEffect(() => setDraft(toDraft(app)), [app])

  const result = useMemo(() => fromDraft(app, draft), [app, draft])
  const dirty = JSON.stringify(result) !== JSON.stringify(app)
  const valid = result.name.length > 0 && result.cwd.length > 0 && result.command.length > 0
  const defaultGrace = (snapshot?.config.defaultStopGraceMs ?? 10_000) / 1000

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((d) => ({ ...d, [key]: value }))

  const chooseFolder = async (): Promise<void> => {
    const picked = await api.chooseFolder(draft.cwd || undefined)
    if (!picked) return
    setDraft((d) => ({
      ...d,
      cwd: picked,
      name: d.name || picked.split(/[\\/]/).filter(Boolean).pop() || '',
    }))
  }

  const save = async (): Promise<void> => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await api.saveApp(result)
      onSaved?.(result)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid grid-cols-[1fr_1fr] gap-[16px]">
        <Field label="Name">
          <TextInput value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="my-app" autoFocus={!app.name} />
        </Field>
        <Field label="Stop grace (seconds)">
          <TextInput
            type="number"
            min={1}
            step={1}
            value={draft.stopGraceSeconds}
            onChange={(e) => set('stopGraceSeconds', e.target.value)}
            placeholder={String(defaultGrace)}
            title="Time between asking the app to stop and killing it. Empty uses the default from Settings."
          />
        </Field>
      </div>

      <Field label="Folder">
        <div className="flex gap-[6px]">
          <div className="flex-1 min-w-[0px]">
            <TextInput mono value={draft.cwd} onChange={(e) => set('cwd', e.target.value)} placeholder="/path/to/app" />
          </div>
          <Button onClick={() => void chooseFolder()} className="shrink-0 h-[30px]">
            Choose…
          </Button>
        </div>
      </Field>

      <Field label="Command">
        <TextInput mono value={draft.command} onChange={(e) => set('command', e.target.value)} placeholder="npm start" />
      </Field>

      <div className="flex items-center justify-between h-[30px]">
        <span className="text-[13px] text-ink-0">Start when daemonry starts</span>
        <Toggle checked={draft.autostart} onChange={(v) => set('autostart', v)} />
      </div>

      <Field label="Environment variables">
        <EnvEditor entries={draft.env} onChange={(env) => set('env', env)} />
      </Field>

      <div className="flex items-center gap-[8px] pt-[4px]">
        <Button type="submit" variant="primary" disabled={!valid || !dirty || saving}>
          {submitLabel}
        </Button>
        {dirty && app.name && (
          <Button variant="ghost" onClick={() => setDraft(toDraft(app))}>
            Revert
          </Button>
        )}
      </div>
    </form>
  )
}
