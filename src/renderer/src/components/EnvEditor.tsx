import { TextInput } from './ui'

export interface EnvEntry {
  key: string
  value: string
}

export function envToEntries(env: Record<string, string>): EnvEntry[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }))
}

export function entriesToEnv(entries: EnvEntry[]): Record<string, string> {
  const env: Record<string, string> = {}
  for (const { key, value } of entries) {
    const k = key.trim()
    if (k) env[k] = value
  }
  return env
}

export function EnvEditor({ entries, onChange }: { entries: EnvEntry[]; onChange: (entries: EnvEntry[]) => void }): React.JSX.Element {
  const update = (i: number, patch: Partial<EnvEntry>): void =>
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const remove = (i: number): void => onChange(entries.filter((_, j) => j !== i))
  const add = (): void => onChange([...entries, { key: '', value: '' }])

  return (
    <div className="flex flex-col gap-[6px]">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-[6px]">
          <div className="w-[200px] shrink-0">
            <TextInput
              mono
              placeholder="KEY"
              value={entry.key}
              onChange={(e) => update(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
            />
          </div>
          <div className="flex-1 min-w-[0px]">
            <TextInput mono placeholder="value" value={entry.value} onChange={(e) => update(i, { value: e.target.value })} />
          </div>
          <button
            type="button"
            title="Remove"
            onClick={() => remove(i)}
            className="no-drag w-[30px] h-[30px] shrink-0 rounded-[6px] text-[16px] text-ink-2 hover:text-ink-0 hover:bg-surface-3 transition-colors"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="no-drag self-start h-[26px] px-[8px] rounded-[5px] text-[12px] text-ink-1 hover:text-ink-0 hover:bg-surface-3 transition-colors"
      >
        + Add variable
      </button>
    </div>
  )
}
